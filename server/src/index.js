// server/src/index.js
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const httpServer = createServer(app);

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*'; // Set to your domain in production

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

// ─── Socket.io ───────────────────────────────────────────────────────────────

const io = new Server(httpServer, {
  cors: {
    origin: '*', // Extension can connect from any origin
    methods: ['GET', 'POST']
  }
});

// ─── Room Storage (in-memory) ─────────────────────────────────────────────────

// rooms: Map<roomCode, { users: Map<socketId, UserInfo>, createdAt: Date }>
const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function createRoom() {
  let code;
  do { code = generateCode(); } while (rooms.has(code));
  rooms.set(code, { users: new Map(), createdAt: new Date() });
  return code;
}

function getRoomUsers(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return [];
  return Array.from(room.users.values()).map(u => ({
    name: u.name,
    avatar: u.avatar,
    platform: u.platform
  }));
}

function cleanupEmptyRooms() {
  const cutoff = Date.now() - 4 * 60 * 60 * 1000; // 4 hours
  for (const [code, room] of rooms.entries()) {
    if (room.users.size === 0 && room.createdAt < cutoff) {
      rooms.delete(code);
    }
  }
}

setInterval(cleanupEmptyRooms, 30 * 60 * 1000);

// ─── REST Endpoints ───────────────────────────────────────────────────────────

// Create a room (called from popup before socket join)
app.post('/create-room', (req, res) => {
  const { username, avatar } = req.body;
  if (!username) return res.status(400).json({ error: 'username required' });

  const roomCode = createRoom();
  console.log(`Room created: ${roomCode} by ${username}`);
  res.json({ roomCode });
});

// Check if a room exists
app.get('/check-room/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  if (rooms.has(code)) {
    res.json({ exists: true, users: getRoomUsers(code) });
  } else {
    res.status(404).json({ exists: false });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    rooms: rooms.size,
    uptime: process.uptime()
  });
});

// ─── Socket Events ────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  let currentRoom = null;
  let currentUser = null;

  // Join room
  socket.on('join', ({ roomCode, username, avatar, platform }) => {
    if (!roomCode || !username) return;

    // Create room if it doesn't exist (in case REST wasn't called)
    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, { users: new Map(), createdAt: new Date() });
    }

    const room = rooms.get(roomCode);
    currentRoom = roomCode;
    currentUser = { name: username, avatar, platform, socketId: socket.id };

    room.users.set(socket.id, currentUser);
    socket.join(roomCode);

    console.log(`${username} joined room ${roomCode} (${platform})`);

    // Notify everyone in the room
    io.to(roomCode).emit('room_users', { users: getRoomUsers(roomCode) });

    // Send welcome system message
    socket.to(roomCode).emit('chat', {
      system: true,
      text: `${avatar || '👤'} ${username} joined`,
      timestamp: Date.now()
    });
  });

  // Play event
  socket.on('play', ({ roomCode, time, from }) => {
    socket.to(roomCode).emit('play', { time, from });
    console.log(`[${roomCode}] ${from} played at ${time.toFixed(1)}s`);
  });

  // Pause event
  socket.on('pause', ({ roomCode, time, from }) => {
    socket.to(roomCode).emit('pause', { time, from });
    console.log(`[${roomCode}] ${from} paused at ${time.toFixed(1)}s`);
  });

  // Seek event
  socket.on('seek', ({ roomCode, time, from }) => {
    socket.to(roomCode).emit('seek', { time, from });
    console.log(`[${roomCode}] ${from} seeked to ${time.toFixed(1)}s`);
  });

  // Chat message
  socket.on('chat', ({ roomCode, from, fromAvatar, text, timestamp }) => {
    // Relay to everyone else
    socket.to(roomCode).emit('chat', { from, fromAvatar, text, timestamp });
    console.log(`[${roomCode}] ${from}: ${text}`);
  });

  // Reaction
  socket.on('reaction', ({ roomCode, from, emoji }) => {
    socket.to(roomCode).emit('reaction', { from, emoji });
  });

  // Sync check (host pings to verify others are in sync)
  socket.on('sync_check', ({ roomCode, time }) => {
    socket.to(roomCode).emit('sync_check', { time });
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (!currentRoom || !currentUser) return;

    const room = rooms.get(currentRoom);
    if (room) {
      room.users.delete(socket.id);

      io.to(currentRoom).emit('room_users', { users: getRoomUsers(currentRoom) });
      io.to(currentRoom).emit('chat', {
        system: true,
        text: `${currentUser.avatar || '👤'} ${currentUser.name} left`,
        timestamp: Date.now()
      });

      console.log(`${currentUser.name} left room ${currentRoom}`);
    }
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║     WatchTogether Server             ║
║     Running on port ${PORT}             ║
╚══════════════════════════════════════╝
  `);
});
