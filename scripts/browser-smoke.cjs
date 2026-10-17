const { navigate } = require('./navigation.cjs');
/* Tests the real UI + API in a browser. Only Tauri's credential delivery is bridged. */
const {chromium}=require('playwright-core');
const {spawn}=require('node:child_process');
const {createServer}=require('node:http');
const {mkdtempSync,rmSync,mkdirSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const {randomBytes}=require('node:crypto');
const {once}=require('node:events');
(async()=>{
  const storage=mkdtempSync(join(tmpdir(),'dragontrip-browser-'));
  const token=randomBytes(32).toString('hex');
  const child=spawn(resolve('.venv/bin/python'),['-m','dragontrip'],{cwd:resolve('backend'),env:{...process.env,DRAGONTRIP_TOKEN:token,DRAGONTRIP_DEV:'1',XDG_DATA_HOME:storage}});
  child.stderr.on('data',x=>process.stderr.write(x));
  let browser,server;
  try{
    const port=await new Promise((ok,fail)=>{child.stdout.on('data',d=>{const m=String(d).match(/DRAGONTRIP_READY (\d+)/);if(m)ok(Number(m[1]));});child.once('exit',()=>fail(new Error('Backend exited before readiness')));});
    server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/plain','Server':'DragontripLab'});res.end('Authorized loopback test\n');});
    server.listen(8080,'127.0.0.1');await once(server,'listening');
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    const page=await browser.newPage({viewport:{width:1366,height:768}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(({port,token})=>{
      window.__TAURI_INTERNALS__={invoke:async command=>{if(command==='backend_connection')return {port,token};throw new Error(command);}};
    },{port,token});
    await page.goto('http://localhost:1420');
    await page.getByText('Workspace overview',{exact:true}).waitFor();
    await page.getByRole('button',{name:'New project',exact:true}).click();
    await page.getByLabel('Project name').fill('HTB Lab');
    await page.getByRole('button',{name:'Create project',exact:true}).click();
    await navigate(page, 'Network Graph');
    await page.getByRole('button',{name:'Start scan',exact:true}).click();
    await page.getByLabel('Target IPv4 address').fill('127.0.0.1');
    await page.getByRole('checkbox').check();
    await page.getByRole('dialog').getByRole('button',{name:'Start scan',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden',timeout:10000});
    await page.locator('.object-card.service').first().waitFor({timeout:60000});
    await page.locator('.object-card.service').first().click();
    await page.getByText('INSPECTOR',{exact:true}).waitFor();
    await page.getByText('Source evidence',{exact:true}).waitFor();
    await page.waitForTimeout(400);
    await page.locator('.terminal-heading .badge').filter({hasText:'completed'}).waitFor();
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Horizontal overflow');
    const screenshotDir=process.env.SCREENSHOT_DIR || 'docs/screenshots';
    mkdirSync(screenshotDir,{recursive:true});
    await page.screenshot({animations:'disabled',path:join(screenshotDir,'graph-1366.png')});
    // Persist a dragged service position through the actual graph callback and API.
    const projectId=await page.evaluate(()=>localStorage.getItem('dragontrip.project'));
    const beforeGraph=await fetch('http://127.0.0.1:'+port+'/projects/'+projectId,{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
    const beforeService=beforeGraph.nodes.find(n=>n.kind==='service');
    const card=page.locator('.object-card.service').first();
    const box=await card.boundingBox();
    await page.mouse.move(box.x+70,box.y+30);await page.mouse.down();
    await page.mouse.move(box.x+120,box.y+70,{steps:12});await page.mouse.up();
    await page.waitForTimeout(500);
    await page.getByRole('button',{name:'Custom node',exact:true}).click();
    await page.getByLabel('Object label').fill('Manual investigation');
    await page.getByRole('button',{name:'Add object',exact:true}).click();
    await page.locator('.object-card.custom').waitFor();
    const saved=await page.evaluate(async({port,token})=>{
      const headers={Authorization:'Bearer '+token};
      const projects=await fetch('http://127.0.0.1:'+port+'/projects',{headers}).then(r=>r.json());
      return fetch('http://127.0.0.1:'+port+'/projects/'+projects[0].id,{headers}).then(r=>r.json());
    },{port,token});
    const afterService=saved.nodes.find(n=>n.id===beforeService.id);
    if(afterService.x===beforeService.x&&afterService.y===beforeService.y)throw new Error('Dragged position was not saved');
    // Keyboard positioning must override a previously dragged position, including its local cache.
    await page.getByLabel('Find graph object').fill(beforeService.label);
    await page.locator('.search-results').getByRole('button',{name:beforeService.label,exact:true}).click();
    await page.locator('.object-card.service').first().waitFor();
    await page.getByText('Position on map',{exact:true}).click();
    const manualX=Math.round(afterService.x)+25,manualY=Math.round(afterService.y)+20;
    await page.getByLabel('X coordinate',{exact:true}).fill(String(manualX));
    await page.getByLabel('Y coordinate',{exact:true}).fill(String(manualY));
    await page.getByRole('button',{name:'Save position',exact:true}).click();
    await page.waitForFunction(({id,x,y})=>{
      const node=document.querySelector('.react-flow__node[data-id="'+id+'"]');
      return node&&node.style.transform.includes(x+'px')&&node.style.transform.includes(y+'px');
    },{id:afterService.id,x:manualX,y:manualY});
    // Draw a relation using XYFlow handles.
    const hostElement=page.locator('.react-flow__node').filter({has:page.locator('.object-card.host')});
    const customElement=page.locator('.react-flow__node').filter({has:page.locator('.object-card.custom')});
    // Fit graph after manual node addition.
    await page.getByRole('button',{name:'fit view',exact:false}).click();
    await page.waitForTimeout(500);
    const from=await customElement.locator('.react-flow__handle-right').boundingBox();
    const to=await hostElement.locator('.react-flow__handle-left').boundingBox();
    const edgeResponse=page.waitForResponse(r=>r.url().endsWith('/edges')&&r.request().method()==='POST',{timeout:10000});
    await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();
    await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:20});await page.mouse.up();
    const response=await edgeResponse;
    if(response.status()!==201)throw new Error('Edge creation failed: '+await response.text());
    await page.waitForTimeout(700);
    await page.reload();
    await navigate(page, 'Network Graph');
    await page.locator('.object-card.custom').waitFor();
    await page.getByText('CUSTOM_RELATION',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Hosts',exact:true}).click();
    await page.getByLabel('Host inventory').getByRole('button').filter({hasText:'127.0.0.1'}).waitFor();
    await navigate(page, 'Scans');
    await page.getByLabel('Scan history').getByRole('button').filter({hasText:'127.0.0.1'}).waitFor();
    await page.getByRole('button',{name:'Dashboard',exact:true}).click();
    const collapse=page.getByRole('button',{name:'Collapse task panel',exact:true});
    if(await collapse.isVisible())await collapse.click();
    await page.screenshot({animations:'disabled',path:join(screenshotDir,'dashboard-1366.png')});
    await page.setViewportSize({width:1920,height:1080});
    await page.screenshot({animations:'disabled',path:join(screenshotDir,'dashboard-1920.png')});
    if(errors.length)throw new Error(errors.join('\n'));
    console.log('PASS: actual Nmap → SQLite → React graph → Inspector → drag → manual node/edge → reload persistence');
    console.log('Browser screenshots saved under '+screenshotDir+'. Tauri IPC bridge was injected for browser testing.');
  }finally{
    if(browser)await browser.close();
    if(server)await new Promise(r=>server.close(r));
    child.kill('SIGTERM');
    await once(child,'exit').catch(()=>{});
    rmSync(storage,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
