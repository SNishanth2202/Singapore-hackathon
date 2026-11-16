import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const commands = [
  { cwd: 'backend', args: ['node_modules/ts-node-dev/lib/bin.js', '--respawn', '--transpile-only', 'src/scripts/preview.ts'] },
  { cwd: 'frontend', args: ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3000', '--strictPort'] },
];
const children = new Set();
let stopping = false;

function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) {
      // On Windows killing only the watcher leaves its forked API process running.
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true, stdio: 'ignore',
      });
      killer.on('error', () => child.kill());
      killer.once('exit', status => {
        if (status !== 0 && child.exitCode === null && child.signalCode === null) child.kill();
      });
    } else {
      child.kill();
    }
  }
}

for (const command of commands) {
  const child = spawn(process.execPath, command.args, {
    cwd: path.join(root, command.cwd), stdio: 'inherit', windowsHide: true,
  });
  children.add(child);
  child.once('error', error => {
    children.delete(child);
    console.error(`Could not start ${command.cwd}: ${error.message}`);
    stop(1);
  });
  child.once('exit', code => {
    children.delete(child);
    stop(code ?? 1);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
