import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const commands = [
  { cwd: 'backend', args: ['node_modules/ts-node-dev/lib/bin.js', '--respawn', '--transpile-only', 'src/ranking/demo-server.ts'] },
  { cwd: 'frontend', args: ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3000', '--strictPort'] },
];
const children = commands.map(c => spawn(process.execPath, c.args, { cwd: path.join(root, c.cwd), stdio: 'inherit', windowsHide: true }));
const stop = () => { for (const child of children) child.kill(); };
for (const child of children) child.on('exit', code => { if (code) { stop(); process.exitCode = code; } });
process.on('SIGINT', stop); process.on('SIGTERM', stop);
