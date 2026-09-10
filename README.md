<p align="center">
  <img src="docs/images/prism.svg" width="64" height="64" alt="Prism logo">
</p>

<h1 align="center">Prism</h1>

<p align="center"><strong>Make Codex feel like your space.</strong></p>
<p align="center">Color themes. Image backgrounds. A little more you.<br>A companion for the Codex desktop app on Windows.</p>

<p align="center">
  <a href="#the-look-is-yours">Explore the looks</a> ·
  <a href="#build-it-yourself">Build it yourself</a> ·
  <a href="https://github.com/kalelooz/Prism/issues">Ideas &amp; feedback</a> ·
  <a href="https://buymeacoffee.com/prismcodex">Support Prism</a>
</p>

<p align="center"><strong>Windows · Source available · Signed app coming later</strong><br><sub>You can build Prism today. A ready-made download is still in preparation.</sub></p>

![Prism's editor with a forest background across the sidebar and chat, independent fading controls, and a sample Codex workspace](docs/images/prism-forest.png)

<p align="center"><sub>Prism sample previews, not live Codex sessions. Photographers are credited on each image and in <a href="docs/IMAGE-CREDITS.md">Image credits</a>.</sub></p>

## The look is yours

A quiet forest. A little city light. A clean, plain sidebar. Start with a mood, then adjust it until it feels right.

<p>
  <img src="docs/images/prism-beach.png" width="49%" alt="Beach image in the chat area, with a plain sidebar">
  <img src="docs/images/prism-tokyo.png" width="49%" alt="Tokyo skyline in the sidebar, with a plain chat area">
</p>

- **Pick your panes.** Chat, sidebar, right panel, terminal—you choose.
- **Set the mood.** Span one image, repeat it, or use a different image in each area. Fade it until your text feels comfortable.
- **Keep your favorites.** Save background setups and swap between them.
- **Play with color.** Edit, save, import and export themes, including fonts and code colors.

## Six starting points. Your finishing touches.

Begin with **Afterglow**, **Graphite**, **Sea glass**, **Ember**, **Paper** or **Orchid**. Keep the palette, or change the details to suit your workspace.

![Six Prism theme previews: Afterglow, Graphite, Sea glass, Ember, Paper and Orchid](docs/images/prism-themes.png)

## A plain sidebar is a choice, too

Keep the image in the chat, bring it into the sidebar, or start with color alone. You decide where it belongs.

![The same beach chat preview compared with a plain sidebar and an image sidebar](docs/images/prism-sidebar-choice.png)

## How it works

**For color themes:** choose a palette → make your edits → **Copy theme** → open Codex **Settings → Appearance → Light/Dark theme → Import** → paste the complete theme text. Prism includes an import guide.

**For image backgrounds:** choose a local image → choose the areas and fading → **Apply** → follow Prism's access and setup instructions. Prism saves the setup before connecting. Next time, **Codex with Prism** opens the configured session with the background helper.

Images and saved setups stay on your computer. The photographs shown here are examples, not a bundled wallpaper collection.

### Before using backgrounds

Image backgrounds are an **experimental integration**. They use a separate Codex profile with a local debugging connection, and Prism asks for permission before opening it. You may need to sign in to that profile.

- **Compatibility is checked.** The current candidate supports Windows Codex packages `26.901.6511.0` and `26.903.8094.0`. Future Codex updates can require a Prism update.
- **Your normal Codex shortcut stays separate.** It can open a different session with its own appearance. Use **Codex with Prism** for the configured background session.
- **Local access matters.** Other programs on your computer could use the debugging connection to read or control that session. Removing a background or quitting Prism does not close that connection; quit the configured Codex session to close it.
- **You control closing.** If an ordinary Codex session is already open, Prism asks you to save your work and quit it normally. Prism never closes Codex for you.

## Build it yourself

Bring **Windows x64**, **Node.js 22.12+**, **Rust**, the **Microsoft C++ Build Tools** and **WebView2**. [One-time setup and build notes →](docs/DEVELOPMENT.md)

```powershell
git clone https://github.com/kalelooz/Prism.git
cd Prism
npm ci
npm run start:native
```

Want a portable build? Run `npm run package:native`, then open `Prism.exe` inside the new `dist-native/Prism-<version>-win32-x64` folder. Keep that folder together. Local builds are unsigned; Windows may warn or block them.

Prism uses **Tauri + Rust** with plain HTML, CSS and JavaScript. The native app ships without Electron or Node. Electron remains in the development tools for isolated UI checks and the older host.

## Help shape Prism

Tell us which look you would use, what feels unclear, or what you would like next. [Share an idea or report a problem](https://github.com/kalelooz/Prism/issues). For a bug, include the Prism version, Codex version and visible error; leave out conversations, personal images and credentials.

Small fixes, theme ideas and clear bug reports are welcome. [Development notes](docs/DEVELOPMENT.md) explain how to run the checks. Please discuss bigger changes in an issue first.

If you would like to support the work, [buy Prism a coffee](https://buymeacoffee.com/prismcodex). Tips are optional. Every feature works without one.

## Yours to tinker with

Prism's original source code is [MIT licensed](LICENSE). Use it, change it, make something with it—just keep the license notice. [Third-party notices](THIRD_PARTY_NOTICES.txt) and [photo credits](docs/IMAGE-CREDITS.md) cover the assets and dependencies that keep their own terms.

---

<p align="center"><sub>Made by <a href="https://github.com/kalelooz">Mohamed</a> · <a href="docs/IMAGE-CREDITS.md">Image credits</a><br>Prism is an independent project and is not affiliated with OpenAI. Codex is a product of OpenAI.</sub></p>
