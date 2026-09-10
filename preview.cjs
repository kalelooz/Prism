// Same frontend as the desktop app; development preview only, bound to loopback.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = new Set(['index.html', 'app.mjs', 'theme.mjs', 'wallpaper.mjs', 'style.css', 'icon.svg', 'assets/copy-import.gif', 'assets/copy-import-poster.png']);
http.createServer((req, res) => {
  const name = req.url === '/' ? 'index.html' : req.url.slice(1);
  if (!files.has(name)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.png': 'image/png' })[path.extname(name)]);
  fs.createReadStream(path.join(__dirname, name)).pipe(res);
}).listen(4173, '127.0.0.1', () => console.log('Prism preview: http://127.0.0.1:4173'));
