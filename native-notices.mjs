import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { homedir } from 'node:os';

const cargo = join(process.env.CARGO_HOME || join(homedir(), '.cargo'), 'bin', 'cargo.exe');
const run = args => execFileSync(cargo, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true });
const manifest = ['--locked', '--manifest-path', 'src-tauri/Cargo.toml'];
const metadata = JSON.parse(run(['metadata', ...manifest, '--format-version', '1', '--filter-platform', 'x86_64-pc-windows-msvc']));
const sysroot = execFileSync(join(dirname(cargo), 'rustc.exe'), ['--print', 'sysroot'], { encoding: 'utf8', windowsHide: true }).trim();
const rust = join(sysroot, 'share', 'doc', 'rust');
const normal = new Set(run(['tree', ...manifest, '--target', 'x86_64-pc-windows-msvc', '--edges', 'normal', '--prefix', 'none', '--format', '{p}']).split(/\r?\n/).map(line => line.split(' ').slice(0, 2).join(' ')));
const fallback = {
  'alloc-stdlib 0.2.4': ['alloc-stdlib-LICENSE'],
  'clipboard-win 5.4.1': ['clipboard-win-LICENSE'],
  'selectors 0.36.1': ['selectors-MPL-2.0.txt'],
  'webview2-com 0.38.2': ['webview2-com-LICENSE'],
  'webview2-com-sys 0.38.2': ['webview2-com-LICENSE'],
  'webview2-com-macros 0.8.1': ['webview2-com-macros-LICENSE'],
};
for (const name of ['unic-char-property', 'unic-char-range', 'unic-common', 'unic-ucd-ident', 'unic-ucd-version']) fallback[`${name} 0.9.0`] = ['unic-LICENSE-MIT', 'unic-LICENSE-APACHE'];
const packages = metadata.packages.filter(p => p.source && normal.has(`${p.name} v${p.version}`)).sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const sections = ["Prism native dependency licenses\n\nThe following notices cover the resolved Windows x64 normal Cargo dependency graph, including compile-time helpers in that graph. Components retain their own licenses. Unmodified source for each component is available from its exact-version crates.io link. In particular, source for the MPL-2.0-covered selectors component is available at its link below. License text supplements are documented in the Prism source repository's licenses/README.md.\n"];
for (const p of packages) {
  const dir = dirname(p.manifest_path);
  let files = readdirSync(dir, { withFileTypes: true }).filter(f => f.isFile() && /^(licen[sc]e|copying|notice|copyright)(\b|[._-])/i.test(f.name)).map(f => join(dir, f.name));
  if (p.license_file) files.push(join(dir, p.license_file));
  files = [...new Set(files)];
  for (const file of files) if (!realpathSync(file).startsWith(realpathSync(dir) + sep)) throw Error(`License escapes package: ${p.name}`);
  if (!files.length) files = (fallback[`${p.name} ${p.version}`] || []).map(f => join('licenses', f));
  if (!files.length) throw Error(`Missing license text: ${p.name} ${p.version}`);
  const texts = files.map(file => readFileSync(file, 'utf8'));
  // siphasher's archive contains its copyright notice but references external MIT/Apache terms.
  if (p.name === 'siphasher' && p.version === '1.0.3') texts.push(readFileSync(join(rust, 'licenses', 'MIT.txt'), 'utf8'));
  if (!texts.some(text => text.length >= 500)) throw Error(`License text needs inspection: ${p.name} ${p.version}`);
  sections.push(`\n${'='.repeat(72)}\n${p.name} ${p.version}\nLicense: ${p.license || 'See text below'}\nSource: https://crates.io/crates/${p.name}/${p.version}\n\n${texts.join('\n\n')}`);
}
sections.push('\nMicrosoft WebView2 SDK 1.0.3650.58 loader (via webview2-com-sys 0.38.2)\n\n' + readFileSync('licenses/WebView2-SDK-1.0.3650.58.txt', 'utf8'));
sections.push('\nRust standard library: see RUST_STANDARD_LIBRARY_LICENSES.html for component attributions. Standard license texts follow.\n');
for (const file of readdirSync(join(rust, 'licenses')).sort()) sections.push(`\n${file}\n\n${readFileSync(join(rust, 'licenses', file), 'utf8')}`);
mkdirSync('src-tauri/generated', { recursive: true });
writeFileSync('src-tauri/generated/DEPENDENCY_LICENSES.txt', sections.join('\n'));
copyFileSync(join(rust, 'COPYRIGHT-library.html'), 'src-tauri/generated/RUST_STANDARD_LIBRARY_LICENSES.html');
console.log(`Prepared native notices for ${packages.length} Cargo dependencies and the Rust standard library.`);
