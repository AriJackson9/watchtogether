// content.js - injected into streaming pages
// Handles: video sync detection, sidebar UI, socket connection

let socket = null;
let roomCode = null;
let username = null;
let avatar = null;
let isSyncing = false;
let lastSentTime = 0;
let sidebarVisible = true;

// ─── Video Detection ───────────────────────────────────────────────────────────

function getVideoElement() {
  return document.querySelector('video');
}

function detectPlatform() {
  const host = location.hostname;
  if (host.includes('netflix')) return 'netflix';
  if (host.includes('amazon') || host.includes('primevideo')) return 'prime';
  if (host.includes('youtube')) return 'youtube';
  if (host.includes('disney')) return 'disney';
  return 'unknown';
}

// ─── Socket Connection ─────────────────────────────────────────────────────────

function connectSocket(serverUrl) {
  // Dynamically inject Socket.io client
  if (window.__wtSocket) {
    window.__wtSocket.disconnect();
  }

  const script = document.createElement('script');
  script.src = `${serverUrl}/socket.io/socket.io.js`;
  script.onload = () => {
    const io = window.io;
    const s = io(serverUrl, { transports: ['websocket'] });
    window.__wtSocket = s;

    s.on('connect', () => {
      s.emit('join', { roomCode, username, avatar, platform: detectPlatform() });
      updateSyncStatus('🟢 Connected — syncing enabled');
      chrome.runtime.sendMessage({ type: 'SYNC_STATUS', text: '🟢 Connected' });
    });

    s.on('disconnect', () => {
      updateSyncStatus('🔴 Disconnected');
    });

    // Another user played
    s.on('play', ({ time, from }) => {
      const video = getVideoElement();
      if (!video) return;
      isSyncing = true;
      video.currentTime = time;
      video.play().catch(() => {});
      addChatMessage({ system: true, text: `▶ ${from} played` });
      setTimeout(() => { isSyncing = false; }, 500);
    });

    // Another user paused
    s.on('pause', ({ time, from }) => {
      const video = getVideoElement();
      if (!video) return;
      isSyncing = true;
      video.currentTime = time;
      video.pause();
      addChatMessage({ system: true, text: `⏸ ${from} paused` });
      setTimeout(() => { isSyncing = false; }, 500);
    });

    // Another user seeked
    s.on('seek', ({ time, from }) => {
      const video = getVideoElement();
      if (!video) return;
      isSyncing = true;
      video.currentTime = time;
      addChatMessage({ system: true, text: `⏩ ${from} skipped` });
      setTimeout(() => { isSyncing = false; }, 500);
    });

    // Chat message received
    s.on('chat', ({ from, fromAvatar, text, timestamp }) => {
      addChatMessage({ from, fromAvatar, text, timestamp, self: from === username });
    });

    // Reaction received
    s.on('reaction', ({ from, emoji }) => {
      showFloatingReaction(emoji);
    });

    // Room users update
    s.on('room_users', ({ users }) => {
      chrome.runtime.sendMessage({ type: 'ROOM_USERS', users });
      updateParticipants(users);
    });

    // Sync check from host
    s.on('sync_check', ({ time }) => {
      const video = getVideoElement();
      if (!video) return;
      const diff = Math.abs(video.currentTime - time);
      if (diff > 2) {
        isSyncing = true;
        video.currentTime = time;
        setTimeout(() => { isSyncing = false; }, 500);
      }
    });

    // Chat notification
    s.on('chat', () => {
      playNotificationSound();
    });

    socket = s;
    attachVideoListeners();
  };
  document.head.appendChild(script);
}

function attachVideoListeners() {
  // Poll for video since streaming sites load it dynamically
  const interval = setInterval(() => {
    const video = getVideoElement();
    if (!video) return;

    clearInterval(interval);
    updateSyncStatus('🎬 Video found — watching together');

    video.addEventListener('play', () => {
      if (isSyncing || !socket) return;
      socket.emit('play', { roomCode, time: video.currentTime, from: username });
    });

    video.addEventListener('pause', () => {
      if (isSyncing || !socket) return;
      socket.emit('pause', { roomCode, time: video.currentTime, from: username });
    });

    video.addEventListener('seeked', () => {
      if (isSyncing || !socket) return;
      const now = Date.now();
      if (now - lastSentTime < 300) return; // debounce
      lastSentTime = now;
      socket.emit('seek', { roomCode, time: video.currentTime, from: username });
    });

  }, 1000);
}

// ─── Sidebar UI ────────────────────────────────────────────────────────────────

function createSidebar() {
  if (document.getElementById('wt-sidebar')) return;

  const sidebar = document.createElement('div');
  sidebar.id = 'wt-sidebar';
  sidebar.innerHTML = `
    <div class="wt-header">
      <div class="wt-title">🎬 WatchTogether</div>
      <div class="wt-actions">
        <button class="wt-btn-icon" id="wt-toggle-btn" title="Hide sidebar">‹</button>
      </div>
    </div>

    <div class="wt-room-badge">
      <span class="wt-badge-label">Room</span>
      <span class="wt-badge-code" id="wt-room-code-badge">------</span>
    </div>

    <div class="wt-participants" id="wt-participants"></div>

    <div class="wt-sync-bar" id="wt-sync-bar">
      Waiting for video...
    </div>

    <div class="wt-reactions-bar">
      <button class="wt-reaction-btn" data-emoji="❤️">❤️</button>
      <button class="wt-reaction-btn" data-emoji="😂">😂</button>
      <button class="wt-reaction-btn" data-emoji="😮">😮</button>
      <button class="wt-reaction-btn" data-emoji="👍">👍</button>
      <button class="wt-reaction-btn" data-emoji="🔥">🔥</button>
      <button class="wt-reaction-btn" data-emoji="💀">💀</button>
    </div>

    <div class="wt-chat" id="wt-chat">
      <div class="wt-messages" id="wt-messages"></div>
      <div class="wt-input-row">
        <input class="wt-input" id="wt-input" type="text" placeholder="Say something..." maxlength="200" />
        <button class="wt-send-btn" id="wt-send-btn">↑</button>
      </div>
    </div>

    <div class="wt-floating-reactions" id="wt-floating-reactions"></div>
  `;

  document.body.appendChild(sidebar);

  // Minimized tab
  const tab = document.createElement('div');
  tab.id = 'wt-tab';
  tab.innerHTML = '🎬';
  tab.title = 'Show WatchTogether';
  document.body.appendChild(tab);

  // Toggle sidebar
  document.getElementById('wt-toggle-btn').addEventListener('click', () => toggleSidebar(false));
  tab.addEventListener('click', () => toggleSidebar(true));

  // Send message
  document.getElementById('wt-send-btn').addEventListener('click', sendChat);
  document.getElementById('wt-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });

  // Reactions
  sidebar.querySelectorAll('.wt-reaction-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.dataset.emoji;
      showFloatingReaction(emoji);
      if (socket) socket.emit('reaction', { roomCode, from: username, emoji });
    });
  });
}

function toggleSidebar(show) {
  const sidebar = document.getElementById('wt-sidebar');
  const tab = document.getElementById('wt-tab');
  if (!sidebar) return;

  sidebarVisible = show;
  sidebar.style.transform = show ? 'translateX(0)' : 'translateX(100%)';
  tab.style.opacity = show ? '0' : '1';
  tab.style.pointerEvents = show ? 'none' : 'all';

  chrome.runtime.sendMessage({ type: 'TOGGLE_CHAT', visible: show });
}

function sendChat() {
  const input = document.getElementById('wt-input');
  const text = input.value.trim();
  if (!text || !socket) return;

  socket.emit('chat', {
    roomCode,
    from: username,
    fromAvatar: avatar,
    text,
    timestamp: Date.now()
  });

  addChatMessage({ from: username, fromAvatar: avatar, text, timestamp: Date.now(), self: true });
  input.value = '';
}

function addChatMessage({ system, from, fromAvatar, text, timestamp, self }) {
  const messages = document.getElementById('wt-messages');
  if (!messages) return;

  const msg = document.createElement('div');

  if (system) {
    msg.className = 'wt-msg-system';
    msg.textContent = text;
  } else {
    msg.className = `wt-msg ${self ? 'wt-msg-self' : 'wt-msg-other'}`;
    msg.innerHTML = `
      ${!self ? `<div class="wt-msg-avatar">${fromAvatar || '👤'}</div>` : ''}
      <div class="wt-msg-bubble">
        ${!self ? `<div class="wt-msg-name">${from}</div>` : ''}
        <div class="wt-msg-text">${escapeHtml(text)}</div>
      </div>
    `;
  }

  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
}

function updateSyncStatus(text) {
  const el = document.getElementById('wt-sync-bar');
  if (el) el.textContent = text;
}

function updateParticipants(users) {
  const el = document.getElementById('wt-participants');
  if (!el) return;
  el.innerHTML = users.map(u =>
    `<div class="wt-participant" title="${u.name}">${u.avatar || '👤'}</div>`
  ).join('');
}

function showFloatingReaction(emoji) {
  const container = document.getElementById('wt-floating-reactions');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'wt-float-emoji';
  el.textContent = emoji;
  el.style.left = (20 + Math.random() * 60) + '%';
  container.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function playNotificationSound() {
  chrome.storage.local.get(['soundsEnabled'], ({ soundsEnabled }) => {
    if (soundsEnabled === false) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Message Listener (from popup) ────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'JOIN_ROOM') {
    roomCode = msg.roomCode;
    username = msg.username;
    avatar = msg.avatar;

    createSidebar();
    document.getElementById('wt-room-code-badge').textContent = roomCode;

    connectSocket(msg.serverUrl);
  }

  if (msg.type === 'RECONNECT') {
    roomCode = msg.roomCode;
    username = msg.username;
    avatar = msg.avatar;

    chrome.storage.local.get(['serverUrl'], ({ serverUrl }) => {
      createSidebar();
      document.getElementById('wt-room-code-badge').textContent = roomCode;
      if (serverUrl) connectSocket(serverUrl);
    });
  }

  if (msg.type === 'LEAVE_ROOM') {
    if (socket) { socket.disconnect(); socket = null; }
    const sidebar = document.getElementById('wt-sidebar');
    const tab = document.getElementById('wt-tab');
    if (sidebar) sidebar.remove();
    if (tab) tab.remove();
    roomCode = null;
  }

  if (msg.type === 'TOGGLE_CHAT') {
    toggleSidebar(msg.visible);
  }
});
