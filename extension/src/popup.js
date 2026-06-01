// popup.js
const SERVER_URL = 'https://habbix.de'; // Production server

const $ = id => document.getElementById(id);

let currentTab = null;
let currentRoom = null;

const SUPPORTED_HOSTS = [
  'netflix.com',
  'amazon.com',
  'primevideo.com',
  'youtube.com',
  'disneyplus.com'
];

function isSupported(url) {
  if (!url) return false;
  return SUPPORTED_HOSTS.some(h => url.includes(h));
}

function showError(msg) {
  $('error-msg').textContent = msg;
  setTimeout(() => { $('error-msg').textContent = ''; }, 3000);
}

function setStatus(type, text) {
  const dot = $('status-dot');
  dot.className = 'status-dot' + (type ? ` ${type}` : '');
  $('status-text').textContent = text;
}

function renderParticipants(users) {
  const list = $('participants-list');
  list.innerHTML = '';
  users.forEach(u => {
    const chip = document.createElement('div');
    chip.className = 'participant-chip';
    chip.innerHTML = `<div class="participant-avatar">${u.avatar || '👤'}</div><span>${u.name}</span>`;
    list.appendChild(chip);
  });
}

function showRoom(roomCode) {
  $('setup-screen').style.display = 'none';
  $('room-screen').style.display = 'flex';
  $('room-code-display').textContent = roomCode;
  setStatus('in-room', `In room ${roomCode}`);

  // Copy on click
  $('room-code-display').style.cursor = 'pointer';
  $('room-code-display').onclick = () => {
    navigator.clipboard.writeText(roomCode);
    $('copy-hint').textContent = '✓ Copied!';
    setTimeout(() => { $('copy-hint').textContent = 'Click to copy'; }, 2000);
  };
}

function showSetup() {
  $('setup-screen').style.display = 'flex';
  $('room-screen').style.display = 'none';
}

async function init() {
  // Load saved prefs
  const prefs = await chrome.storage.local.get(['username', 'avatar', 'roomCode', 'inRoom']);
  if (prefs.username) $('username').value = prefs.username;
  if (prefs.avatar) $('avatar').value = prefs.avatar;

  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  if (!isSupported(tab.url)) {
    $('not-supported').style.display = 'block';
    $('setup-screen').style.display = 'none';
    setStatus('', 'Not on a supported platform');
    return;
  }

  setStatus('connected', 'Ready on ' + new URL(tab.url).hostname.replace('www.', ''));

  // Check if already in a room
  if (prefs.inRoom && prefs.roomCode) {
    currentRoom = prefs.roomCode;
    showRoom(prefs.roomCode);
    // Tell content script to reconnect
    chrome.tabs.sendMessage(tab.id, {
      type: 'RECONNECT',
      roomCode: prefs.roomCode,
      username: prefs.username,
      avatar: prefs.avatar
    });
  }

  // Listen for updates from content script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'ROOM_USERS') {
      renderParticipants(msg.users);
    }
    if (msg.type === 'SYNC_STATUS') {
      $('sync-status-text').textContent = msg.text;
    }
  });
}

// Create room
$('create-btn').addEventListener('click', async () => {
  const username = $('username').value.trim();
  const avatar = $('avatar').value.trim() || '🎬';

  if (!username) { showError('Enter your name first'); return; }

  $('create-btn').innerHTML = '<span class="spinner"></span>Creating...';
  $('create-btn').classList.add('loading');

  try {
    const res = await fetch(`${SERVER_URL}/create-room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, avatar })
    });
    const { roomCode } = await res.json();

    await chrome.storage.local.set({ username, avatar, roomCode, inRoom: true });

    // Tell content script to join
    chrome.tabs.sendMessage(currentTab.id, {
      type: 'JOIN_ROOM',
      roomCode,
      username,
      avatar,
      serverUrl: SERVER_URL
    });

    currentRoom = roomCode;
    showRoom(roomCode);
  } catch (e) {
    showError('Could not connect to server');
  } finally {
    $('create-btn').innerHTML = '✨ Create Room';
    $('create-btn').classList.remove('loading');
  }
});

// Join room
$('join-btn').addEventListener('click', async () => {
  const username = $('username').value.trim();
  const avatar = $('avatar').value.trim() || '🎬';
  const code = $('join-code').value.trim().toUpperCase();

  if (!username) { showError('Enter your name first'); return; }
  if (code.length !== 6) { showError('Room code must be 6 characters'); return; }

  $('join-btn').innerHTML = '<span class="spinner"></span>Joining...';
  $('join-btn').classList.add('loading');

  try {
    const res = await fetch(`${SERVER_URL}/check-room/${code}`);
    if (!res.ok) throw new Error('Room not found');

    await chrome.storage.local.set({ username, avatar, roomCode: code, inRoom: true });

    chrome.tabs.sendMessage(currentTab.id, {
      type: 'JOIN_ROOM',
      roomCode: code,
      username,
      avatar,
      serverUrl: SERVER_URL
    });

    currentRoom = code;
    showRoom(code);
  } catch (e) {
    showError('Room not found. Check the code.');
  } finally {
    $('join-btn').innerHTML = '→ Join Room';
    $('join-btn').classList.remove('loading');
  }
});

// Leave room
$('leave-btn').addEventListener('click', async () => {
  await chrome.storage.local.set({ inRoom: false, roomCode: null });
  chrome.tabs.sendMessage(currentTab.id, { type: 'LEAVE_ROOM' });
  currentRoom = null;
  showSetup();
  setStatus('connected', 'Ready');
});

// Toggle chat
$('toggle-chat').addEventListener('change', (e) => {
  chrome.tabs.sendMessage(currentTab.id, { type: 'TOGGLE_CHAT', visible: e.target.checked });
});

// Toggle sounds
$('toggle-sounds').addEventListener('change', (e) => {
  chrome.storage.local.set({ soundsEnabled: e.target.checked });
});

// Format room code input
$('join-code').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

init();
