# 🎬 WatchTogether

A Chrome Extension that lets you watch Netflix, Amazon Prime, YouTube, and Disney+ in sync with your partner — with a live chat sidebar.

---

## How it works

The extension injects a sidebar into any supported streaming page. When you play, pause, or seek, it sends that event via WebSocket to your server, which relays it to your partner's browser. No player API needed — it hooks into native browser video events.

---

## Project Structure

```
watchtogether/
├── extension/          ← Chrome Extension (load this in Chrome)
│   ├── manifest.json
│   ├── popup.html
│   ├── icons/          ← Add icon files here (see below)
│   └── src/
│       ├── popup.js
│       ├── content.js
│       ├── background.js
│       └── sidebar.css
└── server/             ← Node.js backend (deploy to your domain)
    ├── package.json
    └── src/
        └── index.js
```

---

## Setup

### Step 1 — Server

```bash
cd server
npm install
npm start
```

The server runs on port `3000` by default.

**Environment variables:**
```
PORT=3000
```

### Step 2 — Deploy server to your domain

Deploy to any VPS (Hetzner, DigitalOcean etc.) or Railway/Render.

Make sure port 3000 is accessible and set up a reverse proxy (nginx) with HTTPS:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### Step 3 — Update extension with your domain

In `extension/src/popup.js`, change line 2:

```js
const SERVER_URL = 'https://your-domain.com'; // ← your actual domain here
```

### Step 4 — Add icons

Create simple PNG icons (or use any emoji-to-PNG converter) and place in `extension/icons/`:
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

Quick way — run this in terminal to generate simple colored icons:
```bash
# requires ImageMagick
convert -size 128x128 xc:#c084fc -font Arial -pointsize 70 -fill white -gravity center -annotate 0 '🎬' extension/icons/icon128.png
```

Or just use any 128x128 PNG for now — Chrome doesn't require icons to load unpacked extensions.

### Step 5 — Load extension in Chrome

1. Open Chrome → `chrome://extensions`
2. Enable **Developer Mode** (top right toggle)
3. Click **"Load unpacked"**
4. Select the `extension/` folder

---

## Usage

1. Both of you install the extension
2. Open the same show on Netflix/Prime/YouTube/Disney+
3. Click the extension icon (🎬 in toolbar)
4. One person clicks **"Create Room"** → shares the 6-character code
5. Other person enters the code and clicks **"Join Room"**
6. The sidebar appears — play/pause/seek syncs automatically
7. Chat, send reactions, toggle sidebar with the ‹ button

---

## Features

- ✅ Play / Pause sync
- ✅ Seek sync (with debounce)
- ✅ Live chat with avatars
- ✅ Emoji reactions (float up on screen)
- ✅ Room participants display
- ✅ Sound notifications
- ✅ Collapsible sidebar
- ✅ Works on Netflix, Prime Video, YouTube, Disney+

---

## Notes

- Both users need the extension installed
- Both need their own accounts on the streaming service
- The extension doesn't bypass DRM or ToS — it just syncs timing
- Rooms auto-clean after 4 hours of inactivity

---

## Tech Stack

- **Extension:** Chrome MV3, Vanilla JS, CSS
- **Backend:** Node.js, Express, Socket.io
- **No database needed** — rooms are in-memory
