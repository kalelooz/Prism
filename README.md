<p align="center">
  <img src="docs/images/prism.svg" width="64" height="64" alt="Prism logo">
</p>

<h1 align="center">Prism</h1>

<p align="center"><strong>Make Codex feel like your space.</strong></p>
<p align="center">Choose your colors and add your own background images.<br>For the Codex desktop app on Windows.</p>

<p align="center">
  <a href="#the-look-is-yours">Explore the looks</a> ·
  <a href="#build-it-yourself">Build it yourself</a> ·
  <a href="https://github.com/kalelooz/Prism/issues">Ideas &amp; feedback</a> ·
  <a href="https://buymeacoffee.com/prismcodex">Support Prism</a>
</p>

<p align="center">
  <a href="https://github.com/kalelooz/Prism/releases/download/v0.14.11/Prism-0.14.11-Windows-x64.zip"><img src="https://img.shields.io/badge/Download_for_Windows-x64_%C2%B7_v0.14.11-285A48?style=for-the-badge" alt="Download Prism for Windows x64"></a>
</p>
<p align="center"><strong>Free and open source · Portable beta</strong><br><sub>Download the ZIP, extract all files, then open Prism.exe. <a href="#download-and-run">Setup details</a></sub></p>

![A forest background across the sidebar and chat in Prism's sample Codex preview](docs/images/prism-forest.png)

<p align="center"><sub>Forest photo by Candra Sasmito / Pexels. <a href="docs/IMAGE-CREDITS.md">Photo credits</a>.<br>These images show Prism's sample previews. Click an image to see it at full size.</sub></p>

## The look is yours

Choose where your image appears and adjust the fading so the text is easy to read. Or keep things simple with plain colors.

- Add a background to the chat, sidebar, right panel or terminal.
- Use one image across the window, repeat it, or choose a different image for each area.
- Save your favorite background setups and switch between them.
- Edit, save and share color themes, including fonts and code colors.

![Beach background in the chat area with a plain sidebar](docs/images/prism-beach.png)

<p align="center"><sub>Beach in the chat, plain color in the sidebar. Photo by Septimiu Lupea / Pexels.</sub></p>

![Tokyo skyline in the sidebar with a plain chat area](docs/images/prism-tokyo.png)

<p align="center"><sub>City lights in the sidebar, plain color in the chat. Photo by miyou_ 77 / Pexels.</sub></p>

## Six themes to start with

Try Afterglow, Graphite, Sea glass, Ember, Paper or Orchid. Keep the colors you like and change the rest.

![Six Prism theme previews: Afterglow, Graphite, Sea glass, Ember, Paper and Orchid](docs/images/prism-themes.png)

## How it works

For colors, choose a theme, make your edits and click **Copy theme**. In Codex, open **Settings → Appearance → Light/Dark theme → Import** and paste the full theme text. Prism includes a guide.

For backgrounds, choose an image from your computer, adjust it and click **Apply**. Follow the setup steps in Prism. It saves your choices before connecting. Next time, use **Codex with Prism** to open Codex with your background.

Images and saved setups stay on your computer. The photographs shown here are examples, not a bundled wallpaper collection.

### Before using backgrounds

Backgrounds are experimental. Prism uses a separate Codex profile with a debugging connection on your computer. This lets Prism add the background. It asks for permission first, and you may need to sign in to that profile.

- Prism checks the official Codex installation, its local connection and the background layout. Older and newer Codex builds can work without a Prism update; a changed version number alone does not block backgrounds. Changes to the connection or layout may still need a Prism update.
- Your usual Codex shortcut can open a separate session with its own appearance. Use **Codex with Prism** for your background.
- Other programs on your computer could use the debugging connection to read or control that Codex session. Removing the background or quitting Prism leaves the connection open. Quit that Codex session to close it.
- If your usual Codex session is already open, Prism asks you to save your work and quit it normally. Prism never closes Codex for you.

## Download and run

**[Download Prism 0.14.11 for Windows x64](https://github.com/kalelooz/Prism/releases/download/v0.14.11/Prism-0.14.11-Windows-x64.zip)** · [Release notes](https://github.com/kalelooz/Prism/releases/tag/v0.14.11)

1. Download the ZIP and choose **Extract All**.
2. Keep the extracted folder together and open **Prism.exe**. No Node.js or Rust installation is needed.
3. Choose a theme, or follow Prism's setup steps to enable backgrounds.

Requires Windows 10 (build 19041 or later) or Windows 11 on x64, plus [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/). Windows 11 normally includes WebView2.

This is an unsigned beta, so Windows may warn or block it. A signed Microsoft Store download is still pending. Backgrounds are experimental; read [Before using backgrounds](#before-using-backgrounds) above.

## Build it yourself

You'll need Windows x64 and a few developer tools. Follow the [setup guide](docs/DEVELOPMENT.md), then run:

```powershell
git clone https://github.com/kalelooz/Prism.git
cd Prism
npm ci
npm run start:native
```

To make a portable app, run `npm run package:native`. Open `Prism.exe` in the new `dist-native/Prism-<version>-win32-x64` folder and keep the folder together. These builds aren't signed by a verified publisher, so Windows may warn or block them.

The [development guide](docs/DEVELOPMENT.md) explains the code and how to test a change.

## Help shape Prism

Tell us which look you would use, what feels unclear, or what you would like next. [Share an idea or report a problem](https://github.com/kalelooz/Prism/issues). For a bug, include the Prism version, Codex version and visible error; leave out conversations, personal images and credentials.

Small fixes and theme ideas are welcome. Please discuss bigger changes in an issue first.

If you would like to support the work, [buy Prism a coffee](https://buymeacoffee.com/prismcodex). Tips are optional. Every feature works without one.

## Free to use and change

Prism's original code uses the [MIT license](LICENSE). You can use it and change it; keep the license notice with your copy. Photos and other people's work keep their own licenses. See the [third-party notices](THIRD_PARTY_NOTICES.txt) and [photo credits](docs/IMAGE-CREDITS.md).

---

<p align="center"><sub>Made by <a href="https://github.com/kalelooz">kalelooz</a> · <a href="docs/IMAGE-CREDITS.md">Image credits</a><br>Prism is an independent project and is not affiliated with OpenAI. Codex is a product of OpenAI.</sub></p>
