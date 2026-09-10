# Make yourself at home

Prism is a Windows desktop app. The interface is plain HTML, CSS and JavaScript; Tauri and Rust handle the native window, files and background connection.

## One-time setup

- Windows on an x64 PC.
- [Node.js](https://nodejs.org/en/download) 22.12 or newer and npm. Node 24 is used for development.
- [Rust](https://www.rust-lang.org/tools/install), using the Windows MSVC toolchain.
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/), with **Desktop development with C++** and a Windows SDK.
- [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

[Tauri's Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows) explain the tool installation. Reopen your terminal after installing tools so it picks up the new PATH.

```powershell
git clone https://github.com/kalelooz/Prism.git
cd Prism
npm ci
npm run start:native
```

The native command generates the frontend assets before compiling. Saved settings and images remain on your computer. Applying a background is an explicit action; it requires a supported Codex version and the access prompt described in the [README](../README.md#before-using-backgrounds).

## Check a change

Run these from the repository root:

```powershell
npm test
node native-assets.mjs
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

The Node checks use temporary files and an isolated hidden Electron window. Normal Rust tests leave the explicitly marked live wallpaper check ignored. Keep it that way for routine work: that check can reapply a background to a real Codex session.

`native-assets.mjs` must run before a standalone Cargo test or build in a fresh checkout. Its generated files are deliberately excluded from Git.

## Make a portable app

```powershell
npm run package:native
```

Open `Prism.exe` in `dist-native/Prism-<version>-win32-x64`. Keep the bundled helper and notices alongside it. `Codex with Prism.cmd` opens the configured background session after setup.

The build preserves any existing output folder. For another build of the same version, move the old folder aside first. When releasing a new version, keep `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` and `src-tauri/tauri.conf.json` in sync.

These are unsigned development builds. Building locally does not provide a trusted publisher signature or Microsoft Store approval. Don't change Windows security settings to make a build pass.

## Where things live

| File or folder | What it does |
| --- | --- |
| `index.html`, `style.css`, `app.mjs` | Shared interface and interactions |
| `theme.mjs` | Color themes, validation and import/export |
| `wallpaper.mjs` | Fixed background adapter and target checks |
| `src-tauri/src/` | Native window, local storage and guarded actions |
| `wallpaper-windows.ps1` | Windows package checks and explicit Codex launch |
| `native-assets.mjs`, `native-run.mjs` | Native build preparation and packaging |
| `tests/`, `*.test.mjs` | Existing regression checks |
| `main.cjs`, `preload.cjs`, `background-*.mjs`, `wallpaper-client.cjs` | Older Electron host and test support |

`npm run preview` serves the interface without native features. `npm start` opens the older Electron host; `npm run package` packages that host. Use the native commands for the current app.

After changing packaging, build both packages and run `node tests/packaging-check.mjs`. It checks runtime files, matching licenses and excluded development/private files.

## Contributing

Keep changes focused, reuse the existing components, and run the checks relevant to your change. Include a screenshot for visible changes using sample content. Please leave personal chats, images, credentials, generated files and signing keys out of commits and issues.

Background integration is experimental. Preserve its consent, official-package signature, supported-version, exact process/profile, loopback and helper-integrity checks. A Codex update needs compatibility testing before it can be added to the supported versions.
