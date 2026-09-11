import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const runner = resolve('native-run.mjs');
const temporary = mkdtempSync(join(tmpdir(), 'prism build flags '));
try {
  const stub = join(temporary, 'node_modules/@tauri-apps/cli');
  mkdirSync(stub, { recursive: true });
  writeFileSync(join(stub, 'tauri.js'), `
    const entry = Object.entries(process.env).find(([key]) => key.toUpperCase() === 'CARGO_ENCODED_RUSTFLAGS');
    process.stdout.write(JSON.stringify(entry?.[1] ?? null));
    process.exit(17); // Stop before any real compile or packaging.
  `);
  const base = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(RUSTFLAGS|CARGO_ENCODED_RUSTFLAGS)$/i.test(key)));
  for (const [extra, inherited] of [
    [{ rustflags: '--cfg prism_plain_probe' }, ['--cfg', 'prism_plain_probe']],
    [{ RustFlags: '--cfg ignored', Cargo_Encoded_Rustflags: '--cfg\x1fprism_value="two words"' }, ['--cfg', 'prism_value="two words"']],
  ]) {
    const child = spawnSync(process.execPath, [runner, 'build'], { cwd: temporary, env: { ...base, ...extra }, encoding: 'utf8', windowsHide: true });
    assert.equal(child.status, 17, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout).split('\x1f'), [
      ...inherited,
      `--remap-path-prefix=${homedir()}=/build/home`,
      `--remap-path-prefix=${temporary}=/build/prism`,
    ]);
  }
  console.log('PASS: mixed-case Rust flags, encoded precedence and paths containing spaces.');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
