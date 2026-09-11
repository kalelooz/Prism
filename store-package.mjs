import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

if (process.versions.electron) {
  const { app, nativeImage } = await import('electron');
  const out = process.argv[2];
  mkdirSync(process.argv[3], { recursive: true });
  app.setPath('userData', process.argv[3]);
  // Electron must finish evaluating its main ESM module before app.ready can fire.
  app.whenReady().then(() => {
    const icon = nativeImage.createFromPath(resolve('icon.png'));
    if (icon.isEmpty()) throw Error('The Prism icon could not be read.');
    for (const [name, size] of [['StoreLogo', 50], ['Square150x150Logo', 150], ['Square44x44Logo', 44]]) {
      writeFileSync(join(out, `${name}.png`), icon.resize({ width: size, height: size, quality: 'best' }).toPNG());
    }
    app.quit();
  }).catch(error => { console.error(error); app.exit(1); });
} else {
  const version = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Store versions require three numeric app components.');
  const quad = `${version}.0`;
  const portable = resolve(`dist-native/Prism-${version}-win32-x64`);
  const out = resolve(`dist-msix/Prism-${quad}-x64`);
  const msix = `${out}.msix`;
  if (existsSync(out) || existsSync(msix)) throw Error(`Preserving existing Store output: ${out}`);
  const files = ['Prism.exe', 'Prism.Windows.exe', 'LICENSE', 'THIRD_PARTY_NOTICES.txt', 'DEPENDENCY_LICENSES.txt', 'RUST_STANDARD_LIBRARY_LICENSES.html'];
  for (const file of files) if (!existsSync(join(portable, file))) throw Error(`Build the current native package first: missing ${file}`);
  const sdk = join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10', 'bin');
  const makeappx = readdirSync(sdk).filter(v => /^10\.0\.\d+\.0$/.test(v)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).map(v => join(sdk, v, 'x64', 'makeappx.exe')).find(existsSync);
  if (!makeappx) throw Error('Install the Windows SDK with MakeAppx to package Prism for the Store.');
  mkdirSync(join(out, 'Assets'), { recursive: true });
  for (const file of files) copyFileSync(join(portable, file), join(out, file));
  writeFileSync(join(out, 'AppxManifest.xml'), readFileSync('store/AppxManifest.xml', 'utf8').replace('@VERSION@', quad));
  const run = (program, args, env = process.env) => {
    const result = spawnSync(program, args, { stdio: 'inherit', windowsHide: true, env });
    if (result.error) throw result.error;
    if (result.status !== 0) throw Error(`Store packaging failed: ${program}`);
  };
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  run(createRequire(import.meta.url)('electron'), [fileURLToPath(import.meta.url), join(out, 'Assets'), resolve(`work/store-assets/${quad}`)], env);
  // Keep MakeAppx schema and semantic validation enabled; never use /nv.
  run(makeappx, ['pack', '/d', out, '/p', msix]);
  console.log(`Built unsigned Store candidate: ${msix}`);
}
