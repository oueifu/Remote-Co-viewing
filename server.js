const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const axios = require("axios");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 5050);
const PUBLIC_DIR = path.join(__dirname, "public");
const AXIOS_TIMEOUT = 5000;
const BILIBILI_UA = "Mozilla/5.0 (Linux; Android 12; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0";

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

function sendText(res, statusCode, contentType, body) {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(body);
}

function countXmlDanmaku(xmlText) {
  const matches = String(xmlText || "").match(/<d\b/g);
  return matches ? matches.length : 0;
}

function parseCid(value) {
  const cid = String(value || "").trim();
  return /^\d{1,20}$/.test(cid) ? cid : "";
}

async function serveBilibiliDanmaku(req, res, url) {
  const cid = parseCid(url.searchParams.get("cid"));
  if (!cid) {
    sendText(res, 400, "application/json; charset=utf-8", JSON.stringify({ error: "Missing or invalid cid." }));
    return;
  }

  try {
    const response = await axios.get(`https://comment.bilibili.com/${cid}.xml`, {
      headers: {
        "User-Agent": BILIBILI_UA,
        "Referer": "https://www.bilibili.com/",
        "Accept": "application/xml,text/xml,*/*"
      },
      responseType: "text",
      timeout: AXIOS_TIMEOUT
    });

    const count = countXmlDanmaku(response.data);
    console.log(`[danmaku] cid=${cid} count=${count}`);
    res.writeHead(200, {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "X-Danmaku-Count": String(count)
    });
    res.end(response.data);
  } catch (error) {
    const statusCode = error.response?.status || 502;
    sendText(res, statusCode, "application/json; charset=utf-8", JSON.stringify({
      error: error.message || "Failed to fetch Bilibili danmaku."
    }));
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/bilibili-danmaku" || url.pathname === "/api/danmaku") {
    serveBilibiliDanmaku(req, res, url);
    return;
  }

  const decodedPath = decodeURIComponent(url.pathname);
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

  ws.on("message", async (raw) => {
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

    if (message.type === "chat") {
      const text = String(message.text || "").trim().slice(0, 240);
      if (!text) return;
      const id = String(message.id || "").trim().slice(0, 120);
      broadcast(room, {
        type: "chat",
        id,
        sender: {
          id: client.id,
          name: client.name
        },
        text,
        timestamp: Date.now()
      });
      return;
    }

    if (message.type === "load_video_request") {
      const videoUrl = String(message.url || "").trim();
      const title = String(message.title || "网络视频流").trim() || "网络视频流";
      const cid = parseCid(message.cid);
      if (!videoUrl) return;
      broadcast(room, {
        type: "load_video",
        url: videoUrl,
        title,
        cid
      });
      return;
    }

    if (typeof message.type === "string" && ["rtc_offer", "rtc_answer", "rtc_ice", "rtc_hangup"].includes(message.type)) {
      const payload = {
        type: message.type,
        sender: {
          id: client.id,
          name: client.name
        }
      };

      if (message.type === "rtc_offer" && message.offer) payload.offer = message.offer;
      if (message.type === "rtc_answer" && message.answer) payload.answer = message.answer;
      if (message.type === "rtc_ice" && message.candidate) payload.candidate = message.candidate;

      broadcast(room, payload, ws);
      return;
    }

    if (message.type === "resolve_bilibili") {
      const videoUrl = String(message.url || "").trim();
      if (!videoUrl) return;

      const bvMatch = videoUrl.match(/(BV[0-9A-Za-z]{10})/);
      if (!bvMatch) {
        send(ws, { type: "chat", sender: { id: "system", name: "系统提示" }, text: "未识别到有效的 B 站 BV 号，请检查链接。" });
        return;
      }

      const bvid = bvMatch[1];
      const viewUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;

      try {
        const viewRes = await axios.get(viewUrl, {
          headers: {
            "User-Agent": BILIBILI_UA,
            "Accept": "application/json, text/plain, */*"
          },
          timeout: AXIOS_TIMEOUT
        });

        if (!viewRes.data || viewRes.data.code !== 0) {
          throw new Error(viewRes.data?.message || "B 站视频信息获取失败");
        }

        const title = String(viewRes.data.data.title || "B 站视频");
        const cid = viewRes.data.data.cid;
        if (!cid) throw new Error("未获取到 cid");

        const qnCandidates = [64, 32, 16];
        let playRes = null;
        let lastError = null;

        for (const qn of qnCandidates) {
          try {
            const url = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=${qn}&fnver=0&fnval=0&otype=json`;
            const res = await axios.get(url, {
              headers: {
                "User-Agent": BILIBILI_UA,
                "Accept": "application/json, text/plain, */*"
              },
              timeout: AXIOS_TIMEOUT
            });
            if (res.data && res.data.code === 0 && res.data.data) {
              playRes = res;
              break;
            }
            lastError = new Error(res.data?.message || `qn=${qn} 请求失败`);
          } catch (err) {
            lastError = err;
          }
        }

        if (!playRes) throw lastError || new Error("未能获取播放地址");

        const data = playRes.data.data;
        let resolvedUrl = "";

        if (Array.isArray(data.durl) && data.durl.length > 0) {
          resolvedUrl = data.durl[0].url || data.durl[0].backup_url?.[0] || data.durl[0].backupUrl?.[0] || "";
        } else if (data.dash && Array.isArray(data.dash.video) && data.dash.video.length > 0) {
          throw new Error("B站返回的是音视频分离的 DASH 流，浏览器直链播放会只有画面没有声音。请改用 MP4/m3u8 直链或 mpv 模式。");
        }

        if (!resolvedUrl) {
          throw new Error("未解析到有效视频直链");
        }

        broadcast(room, {
          type: "load_video",
          url: resolvedUrl,
          title: `[B站] ${title}`,
          cid: String(cid)
        });
      } catch (error) {
        const isTimeout = error && error.code === "ECONNABORTED";
        const reason = isTimeout
          ? "B站解析请求超时，可能被风控限流。请稍后重试或改用手动直链。"
          : error.message || "B站解析出现未知错误。";

        send(ws, {
          type: "chat",
          sender: { id: "system", name: "系统提示" },
          text: `自动解析 B 站失败：${reason}`
        });
      }
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
    broadcast(room, {
      type: "rtc_peer_left",
      sender: {
        id: client.id,
        name: client.name
      }
    });
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
