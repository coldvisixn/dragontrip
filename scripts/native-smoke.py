"""Real packaged Tauri/WebKitGTK verification. Requires tauri-driver + WebKitWebDriver.

Run with DISPLAY set (e.g. xvfb-run) and Nmap on PATH. Uses its own loopback
server and temporary XDG directories; never injects an IPC or API mock.
"""
import argparse
import http.server
import json
import os
import platform
import shutil
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request

from visual_check import capture_ui

ROOT = Path(__file__).resolve().parent.parent


def wait_until(check, timeout=30):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        try:
            value = check()
            if value:
                return value
        except (OSError, RuntimeError) as exc:
            last = exc
        time.sleep(.2)
    raise RuntimeError(f"Native UI wait timed out; last error: {last}")


def process_tree(parent):
    children = {}
    states = {}
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            lines = dict(line.split(":", 1) for line in (entry / "status").read_text().splitlines() if ":" in line)
            pid = int(entry.name)
            children.setdefault(int(lines["PPid"]), []).append(pid)
            states[pid] = lines["State"].strip()
        except (OSError, KeyError, ValueError):
            continue
    found = {}
    queue = [parent]
    while queue:
        for pid in children.get(queue.pop(), []):
            found[pid] = states[pid]
            queue.append(pid)
    return found


def application_tree(parent, application):
    found = {}
    for pid in process_tree(parent):
        try:
            if Path(f"/proc/{pid}/exe").resolve() == application:
                found[pid] = "application"
                found.update(process_tree(pid))
        except OSError:
            pass
    if not found:
        raise RuntimeError("Native application process was not found")
    return found


def snapshot(parent, application):
    rss = pss = 0
    ticks = {}
    pids = application_tree(parent, application)
    for pid in pids:
        try:
            status = Path(f"/proc/{pid}/status").read_text()
            rss += int(next(line.split()[1] for line in status.splitlines() if line.startswith("VmRSS:")))
            rollup = Path(f"/proc/{pid}/smaps_rollup").read_text()
            pss += int(next(line.split()[1] for line in rollup.splitlines() if line.startswith("Pss:")))
            stat = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
            ticks[pid] = int(stat[11]) + int(stat[12])
        except (OSError, StopIteration):
            pass
    return {"rss_mib": round(rss/1024, 1), "pss_mib": round(pss/1024, 1),
            "ticks": ticks, "processes": len(pids)}


def measure(parent, application):
    start = time.monotonic()
    before = snapshot(parent, application)
    time.sleep(1)
    after = snapshot(parent, application)
    after_ticks=after.pop("ticks")
    elapsed_ticks=sum(max(0,tick-before["ticks"].get(pid,0)) for pid,tick in after_ticks.items())
    after["exited_during_cpu_sample"]=len(set(before["ticks"])-set(after_ticks))
    after["cpu_percent_one_core"] = round(elapsed_ticks /
        os.sysconf("SC_CLK_TCK") / (time.monotonic()-start) * 100, 1)
    return after


class Driver:
    def __init__(self, port):
        self.base = f"http://127.0.0.1:{port}"
        self.session = None

    def request(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(self.base + path, data=data, method=method,
                                         headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=90) as result:
                payload = json.load(result)
        except urllib.error.HTTPError as exc:
            raise RuntimeError(exc.read().decode(errors="replace")) from exc
        value = payload.get("value")
        if isinstance(value, dict) and value.get("error"):
            raise RuntimeError(str(value))
        return value

    def start(self, application):
        value = self.request("POST", "/session", {"capabilities": {
            "alwaysMatch": {"tauri:options": {"application": str(application)}}}})
        self.session = value["sessionId"]

    def call(self, method, path, body=None):
        return self.request(method, f"/session/{self.session}" + path, body)

    def js(self, script, *args):
        return self.call("POST", "/execute/sync", {"script": script, "args": list(args)})

    def click(self, label):
        result = self.js("""
            const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===arguments[0]);
            if(!b||b.disabled)return false;b.click();return true;
        """, label)
        if not result:
            raise RuntimeError(f"Button unavailable: {label}")

    def fill(self, selector, text):
        wait_until(lambda: self.js("return !!document.querySelector(arguments[0])", selector))
        # Let the native dialog focus/transition finish before WebDriver types.
        time.sleep(.2)
        element = self.call("POST", "/element", {"using": "css selector", "value": selector})
        eid = element["element-6066-11e4-a52e-4f735466cecf"]
        self.call("POST", f"/element/{eid}/value", {"text": text, "value": list(text)})

    def graph(self):
        return self.call("POST", "/execute/async", {"script": """
            const done=arguments[arguments.length-1];
            window.__TAURI_INTERNALS__.invoke('backend_connection').then(async c=>{
                const pid=localStorage.getItem('dragontrip.project');
                const r=await fetch('http://127.0.0.1:'+c.port+'/projects/'+pid,
                    {headers:{Authorization:'Bearer '+c.token}});
                return r.json();
            }).then(done).catch(e=>done({testError:e.message}));
        """, "args": []})

    def drag(self, source, target=None, offset=None):
        boxes = self.js("""
            const a=document.querySelector(arguments[0])?.getBoundingClientRect();
            const b=arguments[1]?document.querySelector(arguments[1])?.getBoundingClientRect():null;
            return a?{a:{x:a.x+a.width/2,y:a.y+a.height/2},b:b?{x:b.x+b.width/2,y:b.y+b.height/2}:null}:null;
        """, source, target)
        if not boxes:
            raise RuntimeError(f"Drag source not found: {source}")
        start = boxes["a"]
        end = boxes["b"] or {"x": start["x"] + offset[0], "y": start["y"] + offset[1]}
        actions = [
            {"type": "pointerMove", "duration": 0, "origin": "viewport", "x": round(start["x"]), "y": round(start["y"])},
            {"type": "pointerDown", "button": 0}, {"type": "pause", "duration": 100},
        ]
        for step in range(1, 13):
            actions.append({"type": "pointerMove", "duration": 60, "origin": "viewport",
                            "x": round(start["x"]+(end["x"]-start["x"])*step/12),
                            "y": round(start["y"]+(end["y"]-start["y"])*step/12)})
        actions.append({"type": "pointerUp", "button": 0})
        self.call("POST", "/actions", {"actions": [{
            "type": "pointer", "id": "mouse", "parameters": {"pointerType": "mouse"},
            "actions": actions}]})
        self.call("DELETE", "/actions")
        time.sleep(.3)

    def stop(self):
        if self.session:
            self.request("DELETE", f"/session/{self.session}")
            self.session = None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("application", type=Path, help="Installed or extracted Debian executable")
    parser.add_argument("--driver", default="tauri-driver")
    parser.add_argument("--native-driver", default="WebKitWebDriver")
    parser.add_argument("--port", type=int, default=4444)
    parser.add_argument("--profile", action="store_true", help="Measure native idle/scan and 100/300 manual nodes")
    args = parser.parse_args()
    native_driver = shutil.which(args.native_driver) or args.native_driver
    native_driver = Path(native_driver).resolve()
    if not native_driver.is_file():
        raise SystemExit("WebKitWebDriver is missing; install webkit2gtk-driver or pass --native-driver /absolute/path")
    args.native_driver = str(native_driver)
    application = args.application.resolve()
    if not application.is_file():
        raise SystemExit(f"Executable missing: {application}")

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.end_headers()
            try:
                self.wfile.write(b"Dragontrip native loopback verification\n")
            except OSError:
                pass
        def log_message(self, *_):
            pass

    class Server(http.server.ThreadingHTTPServer):
        def handle_error(self, *_):
            pass

    with tempfile.TemporaryDirectory(prefix="dragontrip-native-") as storage:
        env = {**os.environ, "XDG_DATA_HOME": storage + "/data", "XDG_CONFIG_HOME": storage + "/config",
               "XDG_CACHE_HOME": storage + "/cache", "XDG_RUNTIME_DIR": storage + "/runtime"}
        Path(env["XDG_RUNTIME_DIR"]).mkdir(mode=0o700)
        Path(env["XDG_CONFIG_HOME"]).mkdir(mode=0o700)
        downloads=Path(storage)/"downloads"
        downloads.mkdir(mode=0o700)
        (Path(env["XDG_CONFIG_HOME"])/"user-dirs.dirs").write_text(f'XDG_DOWNLOAD_DIR="{downloads}"\n')
        with Server(("127.0.0.1", 8080), Handler) as loopback:
            threading.Thread(target=loopback.serve_forever, daemon=True).start()
            with open("/tmp/dragontrip-native-driver.log", "w") as log:
                proc = subprocess.Popen([args.driver, "--port", str(args.port), "--native-port", str(args.port+1),
                                         "--native-driver", args.native_driver], env=env, stdout=log, stderr=log)
                driver = Driver(args.port)
                try:
                    wait_until(lambda: driver.request("GET", "/status"))
                    started=time.monotonic()
                    driver.start(application)
                    print("Native session launched", flush=True)
                    wait_until(lambda: driver.js("return document.body.textContent.includes('Workspace overview')"))
                    # Actual Tauri IPC, not a browser connection shim.
                    assert driver.js("return Boolean(window.__TAURI_INTERNALS__)")
                    print("Dashboard ready", flush=True)
                    os_name=platform.freedesktop_os_release().get("PRETTY_NAME","Linux")
                    metrics={"environment":os_name+" / Xvfb / WebKitGTK / automation; not VirtualBox",
                             "startup_seconds":round(time.monotonic()-started,3)}
                    if args.profile:
                        time.sleep(4)
                        metrics["idle"]=measure(proc.pid,application)
                        print("Idle metrics:",metrics["idle"],flush=True)
                    driver.click("New project")
                    driver.fill(".dialog input", "HTB Native Lab")
                    driver.click("Create project")
                    wait_until(lambda: driver.js("return !!document.querySelector('.graph-toolbar')"))
                    driver.click("Start scan")
                    driver.fill(".dialog input:not([type=checkbox])", "127.0.0.1")
                    driver.js("document.querySelector('.dialog input[type=checkbox]').click()")
                    driver.js("[...document.querySelectorAll('.dialog button')].find(b=>b.textContent.trim()==='Start scan').click()")
                    if args.profile:
                        time.sleep(.5)
                        metrics["scanning"]=measure(proc.pid,application)
                        print("Scan metrics:",metrics["scanning"],flush=True)
                    def settled_scan():
                        scans = driver.graph().get("scans", [])
                        return next((scan for scan in scans if scan.get("status") in
                                     {"completed", "failed", "cancelled", "interrupted"}), None)
                    finished = wait_until(settled_scan, 90)
                    assert finished["status"] == "completed", json.dumps(finished)
                    wait_until(lambda: driver.js("return !!document.querySelector('.object-card.service')"))
                    driver.js("document.querySelector('.object-card.service').click()")
                    wait_until(lambda: driver.js("return document.body.textContent.includes('Source evidence')"))
                    time.sleep(.5)
                    print("Real Nmap and Inspector ready", flush=True)
                    before = driver.graph()
                    assert any(n["attrs"].get("port") == 8080 for n in before["nodes"])
                    screenshots = ROOT / "docs/screenshots"
                    screenshots.mkdir(exist_ok=True)
                    capture_ui(screenshots / "native-graph.png")
                    service = next(n for n in before["nodes"] if n["kind"] == "service")
                    driver.click("Export source XML")
                    evidence=downloads/f"nmap-{service['attrs']['scan_id']}.xml"
                    wait_until(lambda: evidence.exists())
                    assert b"<nmaprun" in evidence.read_bytes()
                    assert evidence.stat().st_mode & 0o077 == 0
                    driver.click("Export source XML")
                    copy=downloads/f"nmap-{service['attrs']['scan_id']}-1.xml"
                    wait_until(lambda: copy.exists())
                    assert copy.read_bytes()==evidence.read_bytes()
                    rejected=driver.call("POST","/execute/async",{"script": """
                        const done=arguments[arguments.length-1];
                        window.__TAURI_INTERNALS__.invoke('export_xml',{scanId:'../escape',content:'<nmaprun/>'})
                            .then(()=>done(false)).catch(()=>done(true));
                    ""","args":[]})
                    assert rejected
                    print("Native XML export, private permissions, collision protection and invalid-path rejection passed",flush=True)
                    driver.drag(".object-card.service", offset=(-35, 45))
                    moved = wait_until(lambda: (
                        lambda d: d if any(n["id"] == service["id"] and (n["x"], n["y"]) != (service["x"], service["y"])
                                          for n in d.get("nodes", [])) else None)(driver.graph()))
                    print("Native drag persisted", flush=True)
                    saved_service = next(n for n in moved["nodes"] if n["id"] == service["id"])
                    driver.click("Custom node")
                    driver.fill(".dialog input", "Native investigation")
                    driver.click("Add object")
                    wait_until(lambda: driver.js("return !!document.querySelector('.object-card.custom')"))
                    driver.js("document.querySelector('.react-flow__controls-fitview').click()")
                    time.sleep(.7)
                    driver.drag(".object-card.custom .react-flow__handle-right",
                                ".object-card.host .react-flow__handle-left")
                    wait_until(lambda: any(e["kind"] == "CUSTOM_RELATION" for e in driver.graph().get("edges", [])))
                    # Phase 2: execute a real web adapter through its Inspector recommendation.
                    driver.js("document.querySelector('.object-card.service').click()")
                    wait_until(lambda: driver.js("return [...document.querySelectorAll('.recommendation')].some(b=>b.textContent.trim().startsWith('whatweb'))"))
                    driver.js("[...document.querySelectorAll('.recommendation')].find(b=>b.textContent.trim().startsWith('whatweb')).click()")
                    wait_until(lambda: driver.js("return document.querySelector('.dialog select')?.value==='whatweb'"))
                    driver.js("document.querySelector('.dialog input[type=checkbox]').click()")
                    driver.js("[...document.querySelectorAll('.dialog button')].find(b=>b.textContent.trim()==='Start scan').click()")
                    wait_until(lambda: any(s.get('tool')=='whatweb' and s['status']=='completed' for s in driver.graph().get('scans',[])), 90)
                    wait_until(lambda: driver.js("return !!document.querySelector('.object-card.url')"))
                    driver.js("document.querySelector('.object-card.url').click()")
                    wait_until(lambda: driver.js("return document.body.textContent.includes('Source evidence · JSON')"))
                    web_node=next(n for n in driver.graph()['nodes'] if n['kind']=='url')
                    driver.click('Export source JSON')
                    json_file=downloads/f"recon-{web_node['attrs']['scan_id']}.json"
                    wait_until(lambda: json_file.exists())
                    assert json.loads(json_file.read_text())
                    assert json_file.stat().st_mode & 0o077 == 0
                    assert next(n for n in driver.graph()['nodes'] if n['id']==service['id'])['attrs']['state']=='open'
                    capture_ui(screenshots/'native-recon.png')
                    # Review a full profile without executing the high-traffic scan.
                    driver.click('Start scan')
                    driver.fill('.dialog input:not([type=checkbox])','127.0.0.1')
                    wait_until(lambda: driver.js("return !!document.querySelector('.dialog select option[value=full]')"))
                    driver.js("const s=document.querySelector('.dialog select');s.value='full';s.dispatchEvent(new Event('change',{bubbles:true}));")
                    wait_until(lambda: driver.js("return document.querySelectorAll('.dialog input[type=checkbox]').length===2"))
                    driver.js("document.querySelectorAll('.dialog input[type=checkbox]')[0].click()")
                    assert driver.js("return [...document.querySelectorAll('.dialog button')].find(b=>b.textContent.trim()==='Start scan').disabled")
                    driver.js("document.querySelectorAll('.dialog input[type=checkbox]')[1].click()")
                    assert not driver.js("return [...document.querySelectorAll('.dialog button')].find(b=>b.textContent.trim()==='Start scan').disabled")
                    driver.click('Cancel')
                    print('PASS: native WhatWeb recommendation + URL graph + JSON evidence export + separate Full Scan approval',flush=True)
                    print("Preparing native close / restart", flush=True)
                    tracked = application_tree(proc.pid, application)
                    driver.stop()
                    wait_until(lambda: all(not Path(f"/proc/{pid}").exists() or
                                           "Z" in Path(f"/proc/{pid}/status").read_text().split("State:")[1].splitlines()[0]
                                           for pid in tracked), 15)
                    started=time.monotonic()
                    driver.start(application)
                    print("Native session launched", flush=True)
                    wait_until(lambda: driver.js("return document.body.textContent.includes('Workspace overview')"))
                    driver.click("Network Graph")
                    wait_until(lambda: driver.js("return !!document.querySelector('.object-card.custom')"))
                    restored = driver.graph()
                    same = next(n for n in restored["nodes"] if n["id"] == service["id"])
                    assert (same["x"], same["y"]) == (saved_service["x"], saved_service["y"])
                    assert any(e["kind"] == "CUSTOM_RELATION" for e in restored["edges"])
                    assert not any(s["status"] in ("running", "queued") for s in restored["scans"])
                    print("PASS: native Tauri IPC + packaged Python + real Nmap + graph + Inspector + drag + manual link + restart")
                    assert any(n['kind']=='url' for n in restored['nodes'])
                    driver.click('Scans')
                    wait_until(lambda: driver.js("return !!document.querySelector('section[aria-label=\"Scan history\"] select')"))
                    driver.js("const s=document.querySelectorAll('section[aria-label=\"Scan history\"] select')[1];s.value='whatweb';s.dispatchEvent(new Event('change',{bubbles:true}));")
                    wait_until(lambda: driver.js("return document.querySelectorAll('.scan-row').length===1 && document.querySelector('.scan-row').textContent.includes('whatweb')"))
                    driver.click('Network Graph')
                    wait_until(lambda: driver.js("return !!document.querySelector('.object-card.custom')"))
                    print('PASS: native paginated tool filter and web-result restart persistence',flush=True)
                    if args.profile:
                        for count in (100,300):
                            result=driver.call("POST","/execute/async",{"script": """
                                const target=arguments[0],done=arguments[arguments.length-1];
                                window.__TAURI_INTERNALS__.invoke('backend_connection').then(async c=>{
                                    const base='http://127.0.0.1:'+c.port+'/projects/'+localStorage.getItem('dragontrip.project');
                                    const headers={Authorization:'Bearer '+c.token,'Content-Type':'application/json'};
                                    const d=await fetch(base,{headers}).then(r=>r.json());
                                    for(let i=d.nodes.length;i<target;i++){
                                        const r=await fetch(base+'/nodes',{method:'POST',headers,
                                            body:JSON.stringify({label:'Performance test object '+i,x:(i%20)*280,y:Math.floor(i/20)*140})});
                                        if(!r.ok)throw new Error('Profile fixture API failure');
                                    }
                                    return target;
                                }).then(done).catch(e=>done({testError:e.message}));
                            ""","args":[count]})
                            assert result==count,result
                            driver.js("location.reload()")
                            wait_until(lambda: driver.js("return document.body.textContent.includes('Workspace overview')"))
                            driver.click("Network Graph")
                            wait_until(lambda: driver.js("return !!document.querySelector('.object-card.custom')"))
                            time.sleep(4)
                            metrics[f"graph_{count}"]=measure(proc.pid,application)
                            metrics[f"graph_{count}"]["dom_nodes"]=driver.js("return document.querySelectorAll('.react-flow__node').length")
                            driver.js("""
                                window.testFrames=[];let last=performance.now(),n=0;
                                function tick(now){window.testFrames.push(now-last);last=now;if(++n<90)requestAnimationFrame(tick);}
                                requestAnimationFrame(tick);
                            """)
                            driver.drag(".object-card.custom",offset=(20,15))
                            frames=driver.js("return window.testFrames.slice(1).sort((a,b)=>a-b)")
                            if frames:
                                metrics[f"graph_{count}"]["drag_frame_median_ms"]=round(frames[len(frames)//2],1)
                                metrics[f"graph_{count}"]["drag_frame_p95_ms"]=round(frames[min(len(frames)-1,int(len(frames)*.95))],1)
                            print(f"Graph {count} metrics:",metrics[f"graph_{count}"],flush=True)
                        (ROOT/"docs/native-profile.json").write_text(json.dumps(metrics,indent=2)+"\n")
                    # Close with an active scan and require every owned descendant to exit.
                    previous_scan_count=len(driver.graph().get('scans',[]))
                    driver.click("Start scan")
                    driver.fill(".dialog input:not([type=checkbox])", "127.0.0.1")
                    driver.js("document.querySelector('.dialog input[type=checkbox]').click()")
                    driver.js("[...document.querySelectorAll('.dialog button')].find(b=>b.textContent.trim()==='Start scan').click()")
                    wait_until(lambda: len(driver.graph().get("scans", [])) > previous_scan_count)
                    time.sleep(.5)
                    print("Preparing native close / restart", flush=True)
                    tracked = application_tree(proc.pid, application)
                    driver.stop()
                    wait_until(lambda: all(not Path(f"/proc/{pid}").exists() or
                                           "Z" in Path(f"/proc/{pid}/status").read_text().split("State:")[1].splitlines()[0]
                                           for pid in tracked), 15)
                    print("PASS: closing native app during Nmap leaves no live application descendants")
                except Exception:
                    try:
                        print("Native failure graph:", json.dumps(driver.graph()), flush=True)
                        print("Native failure UI:", driver.js("return document.body.innerText"), flush=True)
                    except Exception as diagnostic_error:
                        print("Native diagnostics unavailable:", diagnostic_error, flush=True)
                    raise
                finally:
                    try:
                        driver.stop()
                    finally:
                        proc.terminate()
                        try:
                            proc.wait(timeout=10)
                        except subprocess.TimeoutExpired:
                            proc.kill()
                            proc.wait()
                        loopback.shutdown()


if __name__ == "__main__":
    main()
