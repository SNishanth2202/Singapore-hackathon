import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);

test('closing the frontend also stops the preview backend', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'scout-launcher-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const launcher = path.join(root, 'tools/start-demo.mjs');
  const backend = path.join(root, 'backend/node_modules/ts-node-dev/lib/bin.js');
  const frontend = path.join(root, 'frontend/node_modules/vite/bin/vite.js');
  for (const file of [launcher, backend, frontend]) {
    await mkdir(path.dirname(file), { recursive: true });
  }
  await copyFile(new URL('./start-demo.mjs', import.meta.url), launcher);
  // The real backend watcher forks the API and relays SIGTERM on Unix.
  await writeFile(backend, `
    const { spawn } = require('node:child_process');
    const worker = spawn(process.execPath, ['-e', "setTimeout(() => console.log('API still running'), 2500)"], { stdio: 'inherit' });
    process.on('SIGTERM', () => worker.kill());
    worker.on('exit', () => process.exit(83));
    require('node:fs').writeFileSync('../backend-ready', '');
  `);
  await writeFile(frontend, `setInterval(() => {
    if (require('node:fs').existsSync('../backend-ready')) process.exit(0);
  }, 25)`);
  const { stdout } = await run(process.execPath, [launcher], { cwd: root, timeout: 10000 });
  assert.doesNotMatch(stdout, /API still running/);
  await writeFile(frontend, 'process.exit(7)');
  await assert.rejects(run(process.execPath, [launcher], { cwd: root, timeout: 10000 }), { code: 7 });
});
