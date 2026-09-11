# Make yourself at home

Prism is a Windows desktop app. The interface is plain HTML, CSS and JavaScript; Tauri and Rust handle the native window, files and background connection. The native app runs without Electron or Node. Electron is used for isolated UI checks and the older host.

## One-time setup

- Windows on an x64 PC.
- [Node.js](https://nodejs.org/en/download) 22.12 or newer and npm. Node 24 is used for development.
- [Rust](https://www.rust-lang.org/tools/install), using the Windows MSVC toolchain.
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/), with **Desktop development with C++** and a Windows 10/11 SDK. The SDK's Windows metadata and the Windows-included .NET Framework C# compiler build the fixed Windows helper.
- [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

[Tauri's Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows) explain the tool installation. Reopen your terminal after installing tools so it picks up the new PATH.

```powershell
git clone https://github.com/kalelooz/Prism.git
cd Prism
npm ci
npm run start:native
```

The native command generates the frontend assets before compiling. Saved settings and images remain on your computer. Applying a background is an explicit action; it requires a compatible Codex layout and the access prompt described in the [README](../README.md#before-using-backgrounds).

## Check a change

Run these from the repository root:

```powershell
npm test
node native-assets.mjs
cargo test --locked --manifest-path src-tauri/Cargo.toml
node windows-helper-build.mjs work/helper-check.exe tests/windows-helper-check.cs
.\work\helper-check.exe
```

The Node checks use temporary files and an isolated hidden Electron window. Normal Rust tests leave the explicitly marked live wallpaper check ignored. Keep it that way for routine work: that check can reapply a background to a real Codex session.

`native-assets.mjs` must run before a standalone Cargo test or build in a fresh checkout. Its generated files are deliberately excluded from Git.

## Make a portable app

```powershell
npm run package:native
```

Open `Prism.exe` in `dist-native/Prism-<version>-win32-x64`. Keep the bundled helper and notices alongside it. `Codex with Prism.cmd` opens the configured background session after setup.

The native helper is `Prism.Windows.exe`. It uses Windows APIs directly and does not require PowerShell execution-policy changes. `native-notices.mjs` collects the resolved Cargo dependency licenses and the installed Rust toolchain's standard-library notices into the package. Install Rust's documentation component if those files are missing.

The build preserves any existing output folder. For another build of the same version, move the old folder aside first. When releasing a new version, keep `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` and `src-tauri/tauri.conf.json` in sync.

These are unsigned development builds. Building locally does not provide a trusted publisher signature or Microsoft Store approval. Don't change Windows security settings to make a build pass.

## Prepare a Store package

After `npm run package:native`:

```powershell
npm run package:store
powershell.exe -NoProfile -File tests/store-package-check.ps1
```

This creates an unsigned `dist-msix/Prism-<version>.0-x64.msix` with the reserved **Prism for Codex** identity. The source manifest is in `store/AppxManifest.xml`. The Store package supports Windows 10 build 19041 or later on x64 and requires Microsoft Edge WebView2 Runtime. WebView2 is included with Windows 11 and available separately for Windows 10.

The Store app has its own local settings and Codex profile. It begins with Start with Windows disabled and uses the Windows StartupTask API when the user enables it. The portable app retains its existing data folders and startup entry. Do not run both variants against the same Codex background session.

MakeAppx validation and the package check do not prove installation, startup activation, clean-machine compatibility or Store certification. Test those separately with an appropriately signed package. Do not commit signing keys or automatically change certificate trust or Developer Mode. The Store package is signed by Microsoft only after its submission passes certification; the portable build needs its own signing route.

## Where things live

| File or folder | What it does |
| --- | --- |
| `index.html`, `style.css`, `app.mjs` | Shared interface and interactions |
| `theme.mjs` | Color themes, validation and import/export |
| `wallpaper.mjs` | Fixed background adapter and target checks |
| `src-tauri/src/` | Native window, local storage and guarded actions |
| `windows-helper.cs`, `windows-helper-build.mjs` | Compiled Windows operations for the native app |
| `wallpaper-windows.ps1` | Windows helper for the older Electron host |
| `native-assets.mjs`, `native-run.mjs` | Native build preparation and packaging |
| `store-package.mjs`, `store/AppxManifest.xml` | Store package and startup declaration |
| `tests/`, `*.test.mjs` | Existing regression checks |
| `main.cjs`, `preload.cjs`, `background-*.mjs`, `wallpaper-client.cjs` | Older Electron host and test support |

`npm run preview` serves the interface without native features. `npm start` opens the older Electron host; `npm run package` packages that host. Use the native commands for the current app.

After changing packaging, build both packages and run `node tests/packaging-check.mjs`. It checks runtime files, matching licenses and excluded development/private files.

## Contributing

Keep changes focused, reuse the existing components, and run the checks relevant to your change. Include a screenshot for visible changes using sample content. Please leave personal chats, images, credentials, generated files and signing keys out of commits and issues.

Background integration is experimental. Preserve its consent, official-package signature, exact process/profile, loopback, helper-integrity and live-layout checks. Keep the Codex version for diagnosis; do not reject a build solely because its version is unfamiliar. The shared adapter must recognize the main background surface before adding styles, and must leave an unrecognized layout untouched.
