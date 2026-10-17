#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde::Serialize;
use std::{
    io::{BufRead, BufReader},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Mutex,
    },
    time::Duration,
};
use tauri::{Emitter, Manager, State};

#[derive(Clone, Serialize)]
struct Connection {
    port: u16,
    token: String,
}
struct Backend {
    connection: Connection,
    child: Mutex<Child>,
}

struct CloseGuard(AtomicBool);

#[tauri::command]
fn set_close_guard(unsafe_work: bool, state: State<CloseGuard>) {
    state.inner().0.store(unsafe_work, Ordering::SeqCst);
}

#[tauri::command]
fn confirm_close(window: tauri::WebviewWindow, state: State<CloseGuard>) -> Result<(), String> {
    state.inner().0.store(false, Ordering::SeqCst);
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
async fn export_recovery(
    app: tauri::AppHandle,
    draft_id: String,
    content: String,
) -> Result<String, String> {
    export_file(app, draft_id, content, true, "dragontrip-draft")
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    if url.len() > 2048 {
        return Err("Link is too long".into());
    }
    let parsed = tauri::Url::parse(&url).map_err(|_| "Invalid link")?;
    if !["http", "https"].contains(&parsed.scheme())
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("Only HTTP(S) links without credentials may be opened".into());
    }
    let mut child = Command::new("xdg-open")
        .arg(parsed.as_str())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[tauri::command]
async fn export_xml(
    app: tauri::AppHandle,
    scan_id: String,
    content: String,
) -> Result<String, String> {
    export_file(app, scan_id, content, false, "nmap")
}

#[tauri::command]
async fn export_json(
    app: tauri::AppHandle,
    scan_id: String,
    content: String,
) -> Result<String, String> {
    export_file(app, scan_id, content, true, "recon")
}

fn export_file(
    app: tauri::AppHandle,
    scan_id: String,
    content: String,
    json: bool,
    prefix: &str,
) -> Result<String, String> {
    use std::io::Write;
    let valid_id = scan_id.len() == 36
        && scan_id.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        });
    if !valid_id
        || content.len() > 16 * 1024 * 1024
        || if json {
            serde_json::from_str::<serde_json::Value>(&content).is_err()
        } else {
            !content.contains("<nmaprun")
        }
    {
        return Err("Invalid evidence export".into());
    }
    let directory = app.path().download_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let mut temporary = tempfile::NamedTempFile::new_in(&directory).map_err(|e| e.to_string())?;
    temporary
        .write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    let extension = if json { "json" } else { "xml" };
    for suffix in 0..100 {
        let filename = if suffix == 0 {
            format!("{prefix}-{scan_id}.{extension}")
        } else {
            format!("{prefix}-{scan_id}-{suffix}.{extension}")
        };
        let path = directory.join(filename);
        match temporary.persist_noclobber(&path) {
            Ok(_) => return Ok(path.to_string_lossy().into_owned()),
            Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
                temporary = error.file;
            }
            Err(error) => return Err(error.error.to_string()),
        }
    }
    Err("Too many exports of this scan in Downloads".into())
}

#[tauri::command]
fn backend_connection(state: State<Backend>) -> Connection {
    state.connection.clone()
}

fn stop(child: &mut Child) {
    // Backend and Nmap have separate groups. SIGTERM lets Python cancel and reap scans.
    unsafe {
        libc::kill(child.id() as i32, libc::SIGTERM);
    }
    for _ in 0..60 {
        if child.try_wait().ok().flatten().is_some() {
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn main() {
    // WebKit must choose its renderer before GTK creates the first webview.
    // Changing the policy later can leave a blank window on WebKitGTK 2.54.
    #[cfg(target_os = "linux")]
    if std::env::var("DRAGONTRIP_HARDWARE_ACCELERATION")
        .ok()
        .as_deref()
        != Some("1")
        && std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none()
    {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }
    let app = tauri::Builder::default()
        .manage(CloseGuard(AtomicBool::new(false)))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.state::<CloseGuard>().inner().0.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.emit("dragontrip:close-requested", ());
                }
            }
        })
        .setup(|app| {
            let mut bytes = [0u8; 32];
            getrandom::fill(&mut bytes).map_err(|e| format!("Cannot generate session token: {e}"))?;
            let token: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
            let mut command;
            if cfg!(debug_assertions) {
                let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
                let python = root.join(".venv/bin/python");
                command = Command::new(python);
                command.args(["-m", "dragontrip"]).current_dir(root.join("backend"));
                command.env("DRAGONTRIP_DEV", "1");
            } else {
                let binary = app.path().resource_dir()?.join("backend/dragontrip-backend");
                command = Command::new(binary);
            }
            command.env("DRAGONTRIP_TOKEN", &token)
                .env("DRAGONTRIP_PARENT_PID", std::process::id().to_string())
                .stdout(Stdio::piped()).stderr(Stdio::null());
            let mut child = command.spawn().map_err(|e| format!("Backend could not start: {e}"))?;
            let stdout = child.stdout.take().unwrap();
            let (tx, rx) = mpsc::channel();
            std::thread::spawn(move || {
                for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                    if let Some(value) = line.strip_prefix("DRAGONTRIP_READY ") {
                        if let Ok(port) = value.parse::<u16>() { let _ = tx.send(port); }
                    }
                }
            });
            let port = match rx.recv_timeout(Duration::from_secs(30)) {
                Ok(port) => port,
                Err(_) => { stop(&mut child); return Err("Backend startup failed; check installation and writable XDG data directory".into()); }
            };
            app.manage(Backend { connection: Connection {port, token}, child: Mutex::new(child) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![backend_connection, export_xml, export_json, export_recovery, open_external, set_close_guard, confirm_close])
        .build(tauri::generate_context!())
        .expect("Dragontrip failed to initialize");
    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(state) = handle.try_state::<Backend>() {
                if let Ok(mut child) = state.child.lock() {
                    stop(&mut child);
                };
            }
        }
    });
}
