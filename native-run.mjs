import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
const mode = process.argv[2];
if (!['dev', 'build'].includes(mode)) throw Error('Choose dev or build');
const env = { ...process.env };
const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH';
env[pathKey] = join(homedir(), '.cargo', 'bin') + ';' + (env[pathKey] || '');
const child = spawn(process.execPath, ['node_modules/@tauri-apps/cli/tauri.js', mode, ...(mode === 'build' ? ['--no-bundle'] : [])], { stdio: 'inherit', env });
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
if (code !== 0) { process.exitCode = code || 1; } else if (mode === 'build') {
  await import('./native-notices.mjs');
  const version = JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8')).version;
  const out = `dist-native/Prism-${version}-win32-x64`;
  if (await stat(out).catch(() => null)) throw Error(`Preserving existing package: ${out}`);
  await mkdir(out, { recursive: true });
  await copyFile('src-tauri/target/release/prism-native.exe', `${out}/Prism.exe`);
  await copyFile('src-tauri/generated/Prism.Windows.exe', `${out}/Prism.Windows.exe`);
  await copyFile('README.md', `${out}/README.md`);
  await copyFile('LICENSE', `${out}/LICENSE`);
  await copyFile('THIRD_PARTY_NOTICES.txt', `${out}/THIRD_PARTY_NOTICES.txt`);
  for (const file of ['DEPENDENCY_LICENSES.txt', 'RUST_STANDARD_LIBRARY_LICENSES.html']) await copyFile(`src-tauri/generated/${file}`, `${out}/${file}`);
  await writeFile(`${out}/Codex with Prism.cmd`, '@echo off\r\nstart "" "%~dp0Prism.exe" --background --open-codex\r\n');
  console.log(`Built ${out}/Prism.exe`);
}
