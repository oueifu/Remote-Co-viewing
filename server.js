const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 5050);
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

const rooms = new Map();

function roomState() {
  return {
    paused: true,
    time: 0,
    rate: 1,
    updatedAt: Date.now(),
    lastActionBy: null,
    clients: new Map()
  };
}

function getRoom(roomId) {
  const cleanId = String(roomId || "default").trim().slice(0, 80) || "default";
  if (!rooms.has(cleanId)) rooms.set(cleanId, roomState());
  return { id: cleanId, room: rooms.get(cleanId) };
}

function currentPlaybackState(room) {
  const now = Date.now();
  if (room.paused) {
    return { paused: true, time: room.time, rate: room.rate, updatedAt: now };
  }

  const elapsed = Math.max(0, (now - room.updatedAt) / 1000);
  return {
    paused: false,
    time: Math.max(0, room.time + elapsed * room.rate),
    rate: room.rate,
    updatedAt: now
  };
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(room, payload, except = null) {
  const encoded = JSON.stringify(payload);
  for (const client of room.clients.values()) {
    if (client.ws !== except && client.ws.readyState === client.ws.OPEN) {
      client.ws.send(encoded);
    }
  }
}

function clientsSnapshot(room) {
  return Array.from(room.clients.values()).map((client) => ({
    id: client.id,
    name: client.name,
    file: client.file,
    duration: client.duration,
    connectedAt: client.connectedAt
  }));
}

function updateRoomPlayback(room, payload, client) {
  const now = Date.now();
  const state = currentPlaybackState(room);
  const time = Number.isFinite(payload.time) ? Number(payload.time) : state.time;
  const rate = Number.isFinite(payload.rate) && payload.rate > 0 ? Number(payload.rate) : state.rate;

  room.paused = Boolean(payload.paused);
  room.time = Math.max(0, time);
  room.rate = rate;
  room.updatedAt = now;
  room.lastActionBy = client.id;

  return {
    type: "state",
    reason: payload.reason || "update",
    state: currentPlaybackState(room),
    actor: {
      id: client.id,
      name: client.name
    },
    serverTime: now
  };
}

function cleanupRoom(roomId, room) {
  if (room.clients.size === 0) {
    rooms.delete(roomId);
  }
}

function serveStatic(req, res) {
  const requestedPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  const decodedPath = decodeURIComponent(requestedPath);
  const relativePath = decodedPath === "/"
    ? "index.html"
    : path.normalize(decodedPath.replace(/^[/\\]+/, ""));

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const filePath = path.join(PUBLIC_DIR, relativePath);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackErr, fallback) => {
          if (fallbackErr) {
            res.writeHead(404);
            res.end("Not found");
            return;
          }
          res.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
          res.end(fallback);
        });
        return;
      }
      res.writeHead(500);
      res.end("Server error");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(content);
  });
}

const server = http.createServer(serveStatic);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  const client = {
    id: crypto.randomUUID(),
    name: "Viewer",
    roomId: null,
    file: null,
    duration: null,
    connectedAt: Date.now(),
    ws
  };

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "error", message: "Bad JSON message." });
      return;
    }

    if (message.type === "join") {
      const { id: roomId, room } = getRoom(message.room);
      client.roomId = roomId;
      client.name = String(message.name || "Viewer").trim().slice(0, 40) || "Viewer";
      room.clients.set(client.id, client);

      send(ws, {
        type: "joined",
        clientId: client.id,
        room: roomId,
        state: currentPlaybackState(room),
        clients: clientsSnapshot(room),
        serverTime: Date.now()
      });
      broadcast(room, { type: "clients", clients: clientsSnapshot(room) }, ws);
      return;
    }

    if (!client.roomId || !rooms.has(client.roomId)) {
      send(ws, { type: "error", message: "Join a room first." });
      return;
    }

    const room = rooms.get(client.roomId);

    if (message.type === "file") {
      client.file = String(message.name || "").slice(0, 260);
      client.duration = Number.isFinite(message.duration) ? Number(message.duration) : null;
      broadcast(room, { type: "clients", clients: clientsSnapshot(room) });
      return;
    }

    if (message.type === "control") {
      const payload = updateRoomPlayback(room, message, client);
      broadcast(room, payload);
      return;
    }

    if (message.type === "request-state") {
      send(ws, {
        type: "state",
        reason: "request",
        state: currentPlaybackState(room),
        actor: null,
        serverTime: Date.now()
      });
      return;
    }
  });

  ws.on("close", () => {
    if (!client.roomId || !rooms.has(client.roomId)) return;
    const room = rooms.get(client.roomId);
    room.clients.delete(client.id);
    broadcast(room, { type: "clients", clients: clientsSnapshot(room) });
    cleanupRoom(client.roomId, room);
  });
});

setInterval(() => {
  for (const [roomId, room] of rooms) {
    const payload = {
      type: "state",
      reason: "tick",
      state: currentPlaybackState(room),
      actor: null,
      serverTime: Date.now()
    };
    broadcast(room, payload);
    cleanupRoom(roomId, room);
  }
}, 5000).unref();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Sync movie server listening on http://localhost:${PORT}`);
});
