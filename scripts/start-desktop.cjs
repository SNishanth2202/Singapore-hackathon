const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend');
const frontend = path.join(root, 'frontend');
const url = 'http://127.0.0.1:3000/companies';
const children = new Set();
let stopping = false;

function page(port) {
  return new Promise(resolve => {
    const request = http.get({ hostname: '127.0.0.1', port, path: '/', timeout: 1000 }, response => {
      let body = '';
      response.on('data', chunk => { if (body.length < 20000) body += chunk.toString(); });
      response.on('end', () => resolve({ up: true, body }));
      response.on('error', () => resolve({ up: true, body: '' }));
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve({ up: false, body: '' }));
  });
}
const ours = (port, result) => result.up && (port === 5000 ? /Singtel Scout|Enterprise Radar AI/.test(result.body) && result.body.includes('Backend API') : /<title>(?:Singtel Scout|Enterprise Radar AI)/i.test(result.body));
function start(args, cwd) {
  const child = spawn(process.execPath, args, { cwd, stdio: 'inherit', windowsHide: true, env: { ...process.env, PORT: '5000' } });
  children.add(child);
  child.on('error', () => { console.error('A project process could not start. Check the messages above.'); stop(1); });
  return child;
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill();
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

async function waitReady(port) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (ours(port, await page(port))) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`The service on port ${port} did not become ready. Check the messages above.`);
}

async function main() {
  for (const file of ['.env', 'backend/node_modules/typescript/bin/tsc', 'frontend/node_modules/vite/bin/vite.js']) {
    if (!fs.existsSync(path.join(root, file))) throw new Error(`Required project file is missing: ${file}. Complete project setup first.`);
  }
  const [api, web] = await Promise.all([page(5000), page(3000)]);
  for (const [port, result] of [[5000, api], [3000, web]]) {
    if (result.up && !ours(port, result)) throw new Error(`Port ${port} is being used by another application. Close that application and try again.`);
  }
  if (process.argv.includes('--check')) {
    console.log(JSON.stringify({ project: root, backendRunning: ours(5000, api), websiteRunning: ours(3000, web), url }, null, 2));
    return;
  }
  if (!api.up) {
    console.log('Preparing the backend...');
    const build = start([path.join(backend, 'node_modules/typescript/bin/tsc'), '--project', path.join(backend, 'tsconfig.json')], backend);
    const code = await new Promise(resolve => build.once('exit', resolve));
    children.delete(build);
    if (code !== 0) throw new Error('Backend preparation failed. Check the messages above.');
    console.log('Starting the backend...');
    const service = start([path.join(backend, 'dist/scripts/preview.js')], backend);
    service.once('exit', code => { children.delete(service); if (!stopping) { console.error('The backend stopped.'); stop(code || 1); } });
  }
  if (!web.up) {
    console.log('Starting the website...');
    const service = start([path.join(frontend, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '3000', '--strictPort'], frontend);
    service.once('exit', code => { children.delete(service); if (!stopping) { console.error('The website stopped.'); stop(code || 1); } });
  }
  await Promise.all([waitReady(5000), waitReady(3000)]);
  console.log(`\nReady: ${url}\nKeep FreeLLMAPI Desktop running for AI analysis.`);
  if (!process.argv.includes('--no-open')) {
    const browser = spawn('explorer.exe', [url], { stdio: 'ignore', windowsHide: true });
    browser.on('error', () => console.log(`Open this address in your browser: ${url}`));
    browser.unref();
  }
  if (children.size) console.log('Keep this window open. Press Ctrl+C to stop the services started here.');
  else console.log('The project is already running. Its existing launcher controls those services.');
}
main().catch(error => { console.error(`\n${error.message}`); stop(1); });
