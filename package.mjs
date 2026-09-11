import { packager } from '@electron/packager';
const paths = await packager({ dir: '.', name: 'Prism', platform: 'win32', arch: 'x64',
  out: 'dist-electron', icon: 'icon.ico', overwrite: false, asar: { unpack: '*.ps1' },
  ignore: [/^\/(dist[^/]*|artifacts|work|plans|publish|docs|src-tauri|tests|store|licenses|node_modules|\.git|\.github)(\/|$)/, /\.test\.mjs$/, /\.lnk$/i, /\/(CODEX_PROJECT\.md|CONTEXT\.md|PRO_PLAN\.md|READABILITY\.md|RELEASE_SETUP\.md|VERIFICATION\.md|prism-feasibility-[^/]+\.md|\.c2cignore|\.gitignore|native-(assets|entry|run|notices)\.mjs|store-package\.mjs|windows-helper(?:-build\.mjs|\.cs)|package\.mjs|preview\.cjs|wallpaper-restart\.(ps1|log))$/, /(^|\/)\.env(\.[^/]*)?$/, /\.(pfx|p12|key|pem)$/i],
  win32metadata: { CompanyName: 'Prism', FileDescription: 'Prism · Codex themes and backgrounds', ProductName: 'Prism' }
});
console.log(`Built ${paths.join(', ')}`);
