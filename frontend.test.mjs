import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const electron = require('electron');
const runner = resolve(dirname(fileURLToPath(import.meta.url)), 'tests/frontend-runner.cjs');

test('frontend smoke', async () => {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const appDir = await mkdtemp(resolve(tmpdir(), 'prism-frontend-app-'));
  const profileDir = resolve(tmpdir(), `prism-frontend-profile-${randomUUID()}`);
  const resultFile = resolve(tmpdir(), `prism-frontend-result-${randomUUID()}.txt`);
  await writeFile(resolve(appDir, 'package.json'), JSON.stringify({ main: runner }));
  environment.PRISM_FRONTEND_RESULT = resultFile;
  environment.PRISM_FRONTEND_PROFILE = profileDir;
  const child = spawn(electron, [appDir], { cwd: dirname(runner), env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  let result;
  try {
    result = await new Promise((resolveResult, reject) => {
      let closed = null;
      const poll = setInterval(() => {
        if (!existsSync(resultFile)) return;
        const marker = readFileSync(resultFile, 'utf8');
        clearInterval(poll); clearTimeout(timer);
        resolveResult({ code: closed?.code ?? 0, marker });
      }, 25);
      const timer = setTimeout(() => { clearInterval(poll); child.kill(); reject(new Error(`frontend smoke timed out\n${output}`)); }, 20_000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', (code, signal) => { closed = { code, signal }; if (code !== 0 && !existsSync(resultFile)) { clearInterval(poll); clearTimeout(timer); resolveResult({ code, signal }); } });
    });
  } finally {
    await new Promise(resolve => setTimeout(resolve, 100));
    await rm(appDir, { recursive: true, force: true });
    await rm(resultFile, { force: true });
    await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  assert.equal(result.code, 0, result.marker || output || `Electron exited with ${result.signal || 'unknown signal'}`);
  assert.match(result.marker, /^PASS: frontend smoke/);
});
