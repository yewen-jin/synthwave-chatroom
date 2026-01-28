# Void Space Chatroom

Lightweight retro / synthwave chatroom with p5.js visuals, Socket.IO realtime, and an MSN-style UI. Built with Vite for frontend development and Express + Socket.IO for the backend. Ready for local dev and Render deployment.

## Key features
- Real-time chat with Socket.IO
- p5.js synthwave / glitch visuals
- Classic MSN-style chat UI with toolbar
- Multi-page build (index / control / room1 / room2)
- Production build via Vite, served by Express
- Optional story integration (Twine iframe or inkjs)

## Tech stack
- Frontend: Vite, vanilla JS, p5.js
- Backend: Node.js, Express, Socket.IO
- Build/test: Vite (dev server: 5173), Node server (3000)
- Deployment: Render (recommended)

## Project layout
- src/
  - index.html, control.html, room1.html, room2.html
  - style.css
  - assets/ (fonts, images)
  - js/ (main.js, socket.js, chatUI.js, visuals.js, chatDrag.js)
- dist/ (generated build output — do not commit)
- server.js (Express + Socket.IO)
- vite.config.js
- package.json
- .gitignore
- .gitattributes
- render.yaml (optional)

## Quickstart (Windows)
1. Install deps:
   npm install

2. Dev (two terminals):
   - Frontend (Vite): npm run vite:dev  -> browse http://localhost:5173
   - Backend (Express/Socket.IO): npm run dev  -> server on http://localhost:3000

3. Build production:
   npm run build
   npm start
   -> browse http://localhost:3000

Notes:
- To remove old build folder (Windows CMD): rd /s /q dist
- PowerShell: Remove-Item -Path dist -Recurse -Force
- Git Bash: rm -rf dist

## Socket.IO client config (recommended)
Use runtime detection so same code works in dev/prod:

const socket = io(
  window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : window.location.origin,
  { withCredentials: true, transports: ['websocket','polling'] }
);

If deploying to a custom domain on Render, add that domain to server CORS config or use an env var (CUSTOM_DOMAIN) in server.js.

## Fonts & assets
- Place static assets under `public/assets` (dev) or ensure build copies to `dist/assets`.
- Use absolute paths in CSS/HTML, e.g. `/assets/fonts/Windows-Regular.ttf`
- Add preload in index.html for critical fonts:
  <link rel="preload" href="/assets/fonts/Windows-Regular.ttf" as="font" type="font/ttf" crossorigin>

## Building & Deployment to Render
- Add `render.yaml` or configure the Render web service:
  - Build command: npm install && npm run build
  - Start command: node server.js
  - Set NODE_ENV=production on Render
- Ensure server.js CORS origin includes your Render domain or uses process.env.CUSTOM_DOMAIN

## Git workflow (recommended)
- Develop on feature/dev branch (e.g. `vite-switch`).
- Merge into `production` as target branch:
  git checkout production
  git pull origin production
  git merge vite-switch
- Keep `dist/` and `node_modules/` in .gitignore.
- Use `.gitattributes` to protect config files (vite.config.js, server.js, render.yaml) with merge=ours if you want to keep production-specific config.

Example .gitignore essentials:
```
node_modules/
dist/
build/
.env
*.log
.vscode/
```

To stop tracking previously committed folders:
git rm -r --cached node_modules dist
git commit -m "Remove tracked build / deps"
git push

## Common issues & fixes
- "require is not defined" — server.js must use ES module imports when package.json contains "type":"module".
- Minified React error (#130) — remove React-specific plugins or ensure no React devtools injection; check vite.config.js optimizeDeps / plugins.
- Terser missing — install terser as dev dependency for Vite minify: npm install --save-dev terser
- CORS errors in production — verify client connects to correct server URL and server CORS origins include the deployed domain.
- Large chunk warnings — add manualChunks in vite.config.js or use dynamic import() to split code.
- Chrome extension errors (chrome-extension://...) — usually caused by extensions; test in incognito / disable extensions.

## Story/branching integration options
- Twine iframe + postMessage: easiest; story runs isolated, communicates via postMessage.
- Embed Twine runtime: heavier, format-dependent.
- Recommended for inline chat-based branching: Ink + inkjs — author in Ink, load JSON with inkjs, render passages as chat messages and choices as inline buttons; easy to sync via Socket.IO.

## Where to change visuals and UI
- visuals.js: p5 sketch, adjust gradient rect translation/size:
  - translate(x, y, z) controls position
  - p.rect(...) width/height control size
- Toolbar markup: src/room1.html (toolbar markup & class names), CSS in src/style.css to adjust size/spacing

## Helpful commands
- Install deps: npm install
- Dev Vite: npm run vite:dev
- Dev server: npm run dev
- Build: npm run build
- Start prod server: npm start
- Clean dist (Win CMD): rd /s /q dist

