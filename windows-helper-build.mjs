import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const framework = join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319');
const sdk = join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10');
const versions = readdirSync(join(sdk, 'UnionMetadata')).filter(v => /^10\.0\.\d+\.0$/.test(v)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
const winmd = versions.map(v => join(sdk, 'UnionMetadata', v, 'Windows.winmd')).find(existsSync);
if (!winmd) throw Error('Install the Windows 10/11 SDK to build the fixed Windows helper.');
const runtime = join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'assembly', 'GAC_MSIL', 'System.Runtime', 'v4.0_4.0.0.0__b03f5f7f11d50a3a', 'System.Runtime.dll');
const output = resolve(process.argv[2] || 'src-tauri/generated/Prism.Windows.exe');
mkdirSync(resolve(output, '..'), { recursive: true });
const args = ['/nologo', process.argv[3] ? '/target:exe' : '/target:winexe', '/platform:x64', '/highentropyva+', '/optimize+', `/out:${output}`, ...[winmd, runtime, join(framework, 'System.Runtime.WindowsRuntime.dll'), 'System.Management.dll', 'System.Drawing.dll', 'System.Web.Extensions.dll'].map(ref => `/r:${ref}`), resolve('windows-helper.cs')];
if (process.argv[3]) args.push(`/main:PrismWindowsTests`, resolve(process.argv[3]));
const result = spawnSync(join(framework, 'csc.exe'), args, { stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
if (result.status !== 0) throw Error('Windows helper compilation failed.');
console.log(`Built ${output}`);
