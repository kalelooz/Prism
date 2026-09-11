import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { listPackage, extractFile } from '@electron/asar';

// Run after packaging; --native-only checks just the Windows portable release.
const version = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version;
assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).version, version);
const native = `dist-native/Prism-${version}-win32-x64`;
for (const file of readdirSync(native)) {
  const bytes = readFileSync(`${native}/${file}`);
  for (const encoding of ['utf8', 'utf16le']) {
    const text = bytes.toString(encoding).toLowerCase();
    for (const path of [homedir(), process.cwd()]) {
      for (const spelling of [path, path.replaceAll('\\', '/')]) {
        assert(!text.includes(spelling.toLowerCase()), `Native package exposes a local build path: ${file}`);
      }
    }
  }
}
for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.txt']) {
  assert.deepEqual(readFileSync(`${native}/${file}`), readFileSync(file), `Native package: ${file}`);
}
assert.deepEqual(readFileSync(`${native}/Prism.Windows.exe`), readFileSync('src-tauri/generated/Prism.Windows.exe'));
for (const file of ['DEPENDENCY_LICENSES.txt', 'RUST_STANDARD_LIBRARY_LICENSES.html']) assert.deepEqual(readFileSync(`${native}/${file}`), readFileSync(`src-tauri/generated/${file}`));
assert.match(readFileSync(`${native}/DEPENDENCY_LICENSES.txt`, 'utf8'), /selectors 0\.36\.1[\s\S]*Mozilla Public License/);
assert.equal(readFileSync(`${native}/Prism.exe`).subarray(0, 2).toString(), 'MZ');
assert.match(readFileSync(`${native}/Codex with Prism.cmd`, 'utf8'), /Prism\.exe" --background --open-codex/);
if (process.argv.includes('--native-only')) {
  console.log('PASS: native package runtime inputs, licenses and build-path privacy.');
  process.exit(0);
}

const archive = 'dist-electron/Prism-win32-x64/resources/app.asar';
const entries = listPackage(archive).map(name => name.replaceAll('\\', '/'));
for (const file of ['main.cjs', 'preload.cjs', 'app.mjs', 'theme.mjs', 'wallpaper.mjs', 'wallpaper-client.cjs', 'wallpaper-windows.ps1', 'project-links.json', 'LICENSE', 'THIRD_PARTY_NOTICES.txt', 'assets/copy-import.gif']) {
  assert(entries.includes(`/${file}`), `Electron package: ${file}`);
}
for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.txt']) assert.deepEqual(extractFile(archive, file), readFileSync(file));
assert(!entries.some(name => /^\/(?:src-tauri|docs|tests|work|artifacts|plans|publish|store|licenses)(?:\/|$)/.test(name)));
assert(!entries.some(name => /^\/(?:\.github(?:\/|$)|\.gitignore$|native-(?:assets|entry|run|notices)\.mjs$|store-package\.mjs$|windows-helper(?:-build\.mjs|\.cs)$)/.test(name)));
assert(!entries.some(name => /(?:CODEX_PROJECT|CONTEXT|PRO_PLAN|RELEASE_SETUP|VERIFICATION)\.md$|(?:^|\/)\.env(?:\.[^/]*)?$|\.(?:pfx|p12|pem|key|lnk)$/i.test(name)));
console.log('PASS: native and Electron packages contain their runtime inputs and licenses, without source-only or private files.');
