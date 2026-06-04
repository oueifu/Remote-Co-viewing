// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Q Credit
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const axios = require("axios");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 5050);
let publicUrl = process.env.PUBLIC_URL || "";
const PUBLIC_DIR = path.join(__dirname, "public");
const AXIOS_TIMEOUT = 5000;
const MAX_ROOM_MEMBERS = 2;
const BILIBILI_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
const BILIBILI_ORIGIN = "https://www.bilibili.com";

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
    media: null,
    hostClientId: null,
    hostSessionToken: null,
    clients: new Map(),
    pendingClients: new Map()
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

function setRoomMedia(room, media) {
  if (!room || !media || !media.url) return;
  room.media = {
    url: String(media.url || "").trim(),
    title: String(media.title || "网络视频�?).trim() || "网络视频�?,
    cid: parseCid(media.cid),
    sourceType: String(media.sourceType || "remote").trim() || "remote"
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
    size: client.size !== undefined ? client.size : null,
    playerMode: client.playerMode !== undefined ? client.playerMode : "html5",
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
  if (payload.playerMode) {
    room.playerMode = payload.playerMode;
  }

  return {
    type: "state",
    reason: payload.reason || "update",
    state: {
      ...currentPlaybackState(room),
      playerMode: room.playerMode || "html5"
    },
    actor: {
      id: client.id,
      name: client.name
    },
    serverTime: now,
    media: room.media
  };
}

function cleanupRoom(roomId, room) {
  if (room.clients.size === 0 && room.pendingClients.size === 0) {
    rooms.delete(roomId);
  }
}

function isHostOnline(room) {
  return Boolean(room.hostClientId && room.clients.has(room.hostClientId));
}

function roomJoinCount(room) {
  return room.clients.size + room.pendingClients.size;
}

function joinedPayload(roomId, room, client) {
  return {
    type: "joined",
    clientId: client.id,
    room: roomId,
    state: {
      ...currentPlaybackState(room),
      playerMode: room.playerMode || "html5"
    },
    clients: clientsSnapshot(room),
    serverTime: Date.now(),
    isHost: room.hostClientId === client.id,
    publicUrl: publicUrl,
    media: room.media
  };
}

function approvePendingClient(roomId, room, pendingClient) {
  room.pendingClients.delete(pendingClient.id);
  room.clients.set(pendingClient.id, pendingClient);
  send(pendingClient.ws, joinedPayload(roomId, room, pendingClient));
  broadcast(room, { type: "clients", clients: clientsSnapshot(room) }, pendingClient.ws);
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

function mediaSignature(input) {
  const url = String(input?.url || "").trim();
  const cid = parseCid(input?.cid);
  return `${cid || "no-cid"}|${url}`;
}

function resetRoomPlayback(room, clientId = null) {
  room.paused = true;
  room.time = 0;
  room.rate = 1;
  room.updatedAt = Date.now();
  room.lastActionBy = clientId;
}

function updateRoomMedia(room, media, clientId = null) {
  const changed = mediaSignature(room.media) !== mediaSignature(media);
  setRoomMedia(room, media);
  if (changed) resetRoomPlayback(room, clientId);
  return changed;
}

function bilibiliHeaders(accept, referer = `${BILIBILI_ORIGIN}/`) {
  return {
    "User-Agent": BILIBILI_UA,
    "Accept": accept,
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Origin": BILIBILI_ORIGIN,
    "Referer": referer
  };
}

function supportsMp4Format(data) {
  const format = String(data?.format || "").toLowerCase();
  const acceptFormat = String(data?.accept_format || "").toLowerCase();
  const supportFormats = Array.isArray(data?.support_formats)
    ? data.support_formats.map((item) => String(item?.format || item?.new_description || item?.display_desc || "")).join(",").toLowerCase()
    : "";
  const isFlv = format.includes("flv") || acceptFormat.includes("flv");
  const hasMp4 = format.includes("mp4") || acceptFormat.includes("mp4") || supportFormats.includes("mp4");
  return hasMp4 && !isFlv;
}

async function serveBilibiliDanmaku(req, res, url) {
  const cid = parseCid(url.searchParams.get("cid"));
  if (!cid) {
    sendText(res, 400, "application/json; charset=utf-8", JSON.stringify({ error: "Missing or invalid cid." }));
    return;
  }

  try {
    const response = await axios.get(`https://comment.bilibili.com/${cid}.xml`, {
      headers: bilibiliHeaders("application/xml,text/xml,*/*"),
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

async function serveProxyVideo(req, res, url) {
  if (!["GET", "HEAD"].includes(req.method || "")) {
    sendText(res, 405, "application/json; charset=utf-8", JSON.stringify({ error: "Method not allowed." }));
    return;
  }

  const targetUrl = String(url.searchParams.get("url") || "").trim();
  if (!targetUrl) {
    sendText(res, 400, "application/json; charset=utf-8", JSON.stringify({ error: "Missing url parameter." }));
    return;
  }
  if (targetUrl.length > 4096) {
    sendText(res, 400, "application/json; charset=utf-8", JSON.stringify({ error: "Target url is too long." }));
    return;
  }

  let parsedTargetUrl;
  try {
    parsedTargetUrl = new URL(targetUrl);
  } catch {
    sendText(res, 400, "application/json; charset=utf-8", JSON.stringify({ error: "Invalid target url." }));
    return;
  }

  if (!["http:", "https:"].includes(parsedTargetUrl.protocol)) {
    sendText(res, 400, "application/json; charset=utf-8", JSON.stringify({ error: "Unsupported target protocol." }));
    return;
  }
  if (!(parsedTargetUrl.hostname === "bilivideo.com" || parsedTargetUrl.hostname.endsWith(".bilivideo.com"))) {
    sendText(res, 403, "application/json; charset=utf-8", JSON.stringify({ error: "Target host is not allowed." }));
    return;
  }

  const requestHeaders = {
    "User-Agent": BILIBILI_UA,
    "Referer": `${BILIBILI_ORIGIN}/`
  };
  const rangeHeader = req.headers.range;
  console.log(`[proxy-video] request method=${req.method} ua=${req.headers["user-agent"] || ""} range=${rangeHeader || ""} target=${parsedTargetUrl.hostname}`);
  if (rangeHeader) requestHeaders.Range = rangeHeader;

  try {
    const upstreamResponse = await axios.get(parsedTargetUrl.toString(), {
      headers: requestHeaders,
      responseType: "stream",
      decompress: false,
      timeout: AXIOS_TIMEOUT,
      validateStatus: () => true
    });
    console.log(`[proxy-video] upstream status=${upstreamResponse.status} content-type=${upstreamResponse.headers["content-type"] || ""} content-length=${upstreamResponse.headers["content-length"] || ""} content-range=${upstreamResponse.headers["content-range"] || ""} accept-ranges=${upstreamResponse.headers["accept-ranges"] || ""}`);

    if (![200, 206].includes(upstreamResponse.status)) {
      upstreamResponse.data.destroy();
      sendText(res, 502, "application/json; charset=utf-8", JSON.stringify({ error: "Upstream video responded with an invalid status." }));
      return;
    }

    const responseHeaders = {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    };
    const passthroughHeaders = ["content-type", "content-range", "accept-ranges"];
    for (const headerName of passthroughHeaders) {
      const headerValue = upstreamResponse.headers[headerName];
      if (headerValue) responseHeaders[headerName] = headerValue;
    }

    res.writeHead(upstreamResponse.status, responseHeaders);
    if (req.method === "HEAD") {
      upstreamResponse.data.destroy();
      res.end();
      return;
    }

    const destroyUpstream = () => {
      if (upstreamResponse.data && !upstreamResponse.data.destroyed) {
        upstreamResponse.data.destroy();
      }
    };

    req.on("close", destroyUpstream);
    res.on("close", destroyUpstream);

    upstreamResponse.data.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Upstream video stream error." }));
        return;
      }
      res.destroy();
    });
    upstreamResponse.data.pipe(res);
  } catch (error) {
    const statusCode = error.response?.status || 502;
    sendText(res, statusCode, "application/json; charset=utf-8", JSON.stringify({
      error: error.message || "Failed to proxy video stream."
    }));
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/bilibili-danmaku" || url.pathname === "/api/danmaku") {
    serveBilibiliDanmaku(req, res, url);
    return;
  }

  if (url.pathname === "/proxy-video") {
    serveProxyVideo(req, res, url);
    return;
  }

  if (url.pathname === "/api/set-public-url") {
    const newUrl = url.searchParams.get("url");
    if (newUrl) {
      publicUrl = newUrl;
      console.log(`[server] Public URL updated to: ${publicUrl}`);
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" });
      res.end("OK");
    } else {
      res.writeHead(400);
      res.end("Missing url parameter");
    }
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
    sessionToken: "",
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
      client.sessionToken = String(message.sessionToken || "").trim().slice(0, 120);

      // join 阶段改成“房主审核制”：只有房主本人或被房主批准的访客，才会进入正式 clients�?      const canClaimHost = !room.hostSessionToken || (client.sessionToken && client.sessionToken === room.hostSessionToken);
      if (room.clients.size === 0 && room.pendingClients.size === 0 && canClaimHost) {
        room.hostClientId = client.id;
        room.hostSessionToken = client.sessionToken || client.id;
        client.sessionToken = room.hostSessionToken;
        room.clients.set(client.id, client);
        send(ws, joinedPayload(roomId, room, client));
        return;
      }

      if (room.hostSessionToken && client.sessionToken && client.sessionToken === room.hostSessionToken) {
        room.hostClientId = client.id;
        room.clients.set(client.id, client);
        send(ws, joinedPayload(roomId, room, client));
        broadcast(room, { type: "clients", clients: clientsSnapshot(room) }, ws);
        return;
      }

      if (!isHostOnline(room)) {
        send(ws, { type: "error", message: "房主暂不在线，无法审�? });
        ws.close();
        return;
      }

      if (roomJoinCount(room) >= MAX_ROOM_MEMBERS) {
        send(ws, { type: "error", message: "房间人数已满，当前仅支持 2 人房间�? });
        ws.close();
        return;
      }

      room.pendingClients.set(client.id, client);
      send(ws, { type: "join_pending", room: roomId, message: "已向管理员发送加入申请，请等待房主开�?.." });

      const hostClient = room.clients.get(room.hostClientId);
      if (hostClient) {
        send(hostClient.ws, {
          type: "join_request",
          requester: {
            id: client.id,
            name: client.name
          }
        });
      }
      return;
    }

    if (!client.roomId || !rooms.has(client.roomId)) {
      send(ws, { type: "error", message: "Join a room first." });
      return;
    }

    const room = rooms.get(client.roomId);

    if (message.type === "review_result") {
      if (room.hostClientId !== client.id) {
        send(ws, { type: "error", message: "Only host can review join requests." });
        return;
      }

      const targetId = String(message.targetId || "").trim();
      const pendingClient = room.pendingClients.get(targetId);
      if (!pendingClient) {
        send(ws, { type: "error", message: "Join request not found or already handled." });
        return;
      }

      if (!message.approved) {
        room.pendingClients.delete(targetId);
        send(pendingClient.ws, { type: "join_rejected", message: "房主拒绝了你的加入申�? });
        pendingClient.ws.close();
        return;
      }

      if (room.clients.size >= MAX_ROOM_MEMBERS) {
        room.pendingClients.delete(targetId);
        send(pendingClient.ws, { type: "join_rejected", message: "房间人数已满，当前仅支持 2 人房间�? });
        pendingClient.ws.close();
        return;
      }

      approvePendingClient(client.roomId, room, pendingClient);
      return;
    }

    if (!room.clients.has(client.id)) {
      send(ws, { type: "error", message: "等待房主审核中，当前不能操作房间�? });
      return;
    }

    if (message.type === "file") {
      client.file = String(message.name || "").slice(0, 260);
      client.duration = Number.isFinite(message.duration) ? Number(message.duration) : null;
      client.size = Number.isFinite(message.size) ? Number(message.size) : null;
      client.playerMode = String(message.playerMode || "html5");
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
      const title = String(message.title || "网络视频�?).trim() || "网络视频�?;
      const cid = parseCid(message.cid);
      if (!videoUrl) return;
      if (/^(blob:|file:)/i.test(videoUrl)) {
        send(ws, { type: "error", message: "本地文件不会自动共享，双方需要各自选择同一个文件�? });
        return;
      }
      const resetPlayback = updateRoomMedia(room, {
        url: videoUrl,
        title,
        cid,
        sourceType: "remote"
      }, client.id);
      broadcast(room, {
        type: "load_video",
        url: videoUrl,
        title,
        cid,
        resetPlayback,
        state: resetPlayback ? currentPlaybackState(room) : null,
        serverTime: Date.now()
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
        send(ws, { type: "chat", sender: { id: "system", name: "系统提示" }, text: "未识别到有效�?B �?BV 号，请检查链接�? });
        return;
      }

      const bvid = bvMatch[1];
      const viewUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;

      try {
        const viewRes = await axios.get(viewUrl, {
          headers: bilibiliHeaders("application/json, text/plain, */*"),
          timeout: AXIOS_TIMEOUT
        });

        if (!viewRes.data || viewRes.data.code !== 0) {
          throw new Error(viewRes.data?.message || "B 站视频信息获取失�?);
        }

        const title = String(viewRes.data.data.title || "B 站视�?);
        const cid = viewRes.data.data.cid;
        if (!cid) throw new Error("未获取到 cid");

        const qnCandidates = [64, 32, 16, 6];
        let playRes = null;
        let lastError = null;
        let selectedQn = null;

        for (const qn of qnCandidates) {
          try {
            const url = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=${qn}&platform=html5&high_quality=1&fnver=0&fnval=1&otype=json`;
            const res = await axios.get(url, {
              headers: bilibiliHeaders("application/json, text/plain, */*"),
              timeout: AXIOS_TIMEOUT
            });
            if (res.data && res.data.code === 0 && res.data.data) {
              const candidate = res.data.data;
              const durlLength = Array.isArray(candidate.durl) ? candidate.durl.length : 0;
              const dashVideoLength = Array.isArray(candidate.dash?.video) ? candidate.dash.video.length : 0;
              const dashAudioLength = Array.isArray(candidate.dash?.audio) ? candidate.dash.audio.length : 0;
              console.log(`[bilibili] qn=${qn} quality=${candidate.quality ?? ""} format=${candidate.format ?? ""} video_codecid=${candidate.video_codecid ?? ""} accept_format=${candidate.accept_format ?? ""} durl_length=${durlLength} dash_video_length=${dashVideoLength} dash_audio_length=${dashAudioLength}`);
              if (durlLength > 0 && candidate.durl[0]) {
                let durlHostname = "";
                try {
                  durlHostname = new URL(candidate.durl[0].url || candidate.durl[0].backup_url?.[0] || candidate.durl[0].backupUrl?.[0] || "").hostname;
                } catch {
                  durlHostname = "";
                }
                console.log(`[bilibili] qn=${qn} durl0 hostname=${durlHostname} size=${candidate.durl[0].size ?? ""} length=${candidate.durl[0].length ?? ""} order=${candidate.durl[0].order ?? ""} backup_url_length=${Array.isArray(candidate.durl[0].backup_url) ? candidate.durl[0].backup_url.length : Array.isArray(candidate.durl[0].backupUrl) ? candidate.durl[0].backupUrl.length : 0}`);
              }
              const hasDurl = Array.isArray(candidate.durl) && candidate.durl.length > 0 && Boolean(candidate.durl[0].url);
              const hasDash = candidate.dash && Array.isArray(candidate.dash.video) && candidate.dash.video.length > 0;
              if (hasDurl && supportsMp4Format(candidate) && !hasDash) {
                playRes = res;
                selectedQn = qn;
                break;
              }
              const rejectReason = [
                !hasDurl ? "missing_durl" : "",
                !supportsMp4Format(candidate) ? "not_mp4_like" : "",
                hasDash ? "has_dash_video" : ""
              ].filter(Boolean).join(",");
              console.log(`[bilibili] qn=${qn} rejected reason=${rejectReason || "unknown"}`);
              lastError = new Error(`qn=${qn} 未返回可播放�?MP4 单文件流`);
              continue;
            }
            if (res.data?.data) {
              const candidate = res.data.data;
              const durlLength = Array.isArray(candidate.durl) ? candidate.durl.length : 0;
              const dashVideoLength = Array.isArray(candidate.dash?.video) ? candidate.dash.video.length : 0;
              const dashAudioLength = Array.isArray(candidate.dash?.audio) ? candidate.dash.audio.length : 0;
              console.log(`[bilibili] qn=${qn} quality=${candidate.quality ?? ""} format=${candidate.format ?? ""} video_codecid=${candidate.video_codecid ?? ""} accept_format=${candidate.accept_format ?? ""} durl_length=${durlLength} dash_video_length=${dashVideoLength} dash_audio_length=${dashAudioLength}`);
              if (durlLength > 0 && candidate.durl[0]) {
                let durlHostname = "";
                try {
                  durlHostname = new URL(candidate.durl[0].url || candidate.durl[0].backup_url?.[0] || candidate.durl[0].backupUrl?.[0] || "").hostname;
                } catch {
                  durlHostname = "";
                }
                console.log(`[bilibili] qn=${qn} durl0 hostname=${durlHostname} size=${candidate.durl[0].size ?? ""} length=${candidate.durl[0].length ?? ""} order=${candidate.durl[0].order ?? ""} backup_url_length=${Array.isArray(candidate.durl[0].backup_url) ? candidate.durl[0].backup_url.length : Array.isArray(candidate.durl[0].backupUrl) ? candidate.durl[0].backupUrl.length : 0}`);
              }
            }
            console.log(`[bilibili] qn=${qn} rejected reason=${res.data?.message || "playurl_request_failed"}`);
            lastError = new Error(res.data?.message || `qn=${qn} 请求失败`);
          } catch (err) {
            console.log(`[bilibili] qn=${qn} rejected reason=${err.message || "request_exception"}`);
            lastError = err;
          }
        }

        if (!playRes) {
          throw new Error("�?B站视频未返回手机可播放的 MP4 单文件流，手机浏览器可能无法播放�?);
        }

        const data = playRes.data.data;
        let resolvedUrl = "";

        if (Array.isArray(data.durl) && data.durl.length > 0 && supportsMp4Format(data)) {
          resolvedUrl = data.durl[0].url || data.durl[0].backup_url?.[0] || data.durl[0].backupUrl?.[0] || "";
        } else if (data.dash && Array.isArray(data.dash.video) && data.dash.video.length > 0) {
          throw new Error("�?B站视频未返回手机可播放的 MP4 单文件流，手机浏览器可能无法播放�?);
        }

        if (!resolvedUrl) {
          throw new Error("�?B站视频未返回手机可播放的 MP4 单文件流，手机浏览器可能无法播放�?);
        }

        let selectedHostname = "";
        try {
          selectedHostname = new URL(resolvedUrl).hostname;
        } catch {
          selectedHostname = "";
        }
        console.log(`[bilibili] selected qn=${selectedQn ?? ""} quality=${data.quality ?? ""} format=${data.format ?? ""} video_codecid=${data.video_codecid ?? ""} accept_format=${data.accept_format ?? ""} durl_hostname=${selectedHostname} dash_audio_length=${Array.isArray(data.dash?.audio) ? data.dash.audio.length : 0} dash_video_length=${Array.isArray(data.dash?.video) ? data.dash.video.length : 0}`);

        const proxiedVideoUrl = `/proxy-video?url=${encodeURIComponent(resolvedUrl)}`;
        const resetPlayback = updateRoomMedia(room, {
          url: proxiedVideoUrl,
          title: `[B站] ${title}`,
          cid: String(cid),
          sourceType: "bilibili"
        }, client.id);
        broadcast(room, {
          type: "load_video",
          url: proxiedVideoUrl,
          title: `[B站] ${title}`,
          cid: String(cid),
          resetPlayback,
          state: resetPlayback ? currentPlaybackState(room) : null,
          serverTime: Date.now()
        });
      } catch (error) {
        const isTimeout = error && error.code === "ECONNABORTED";
        const reason = isTimeout
          ? "B站解析请求超时，可能被风控限流。请稍后重试或改用手动直链�?
          : error.message || "B站解析出现未知错误�?;

        send(ws, {
          type: "chat",
          sender: { id: "system", name: "系统提示" },
          text: `自动解析 B 站失败：${reason}`
        });
        send(ws, {
          type: "resolve_bilibili_failed",
          reason
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
        state: {
          ...currentPlaybackState(room),
          playerMode: room.playerMode || "html5"
        },
        actor: null,
        serverTime: Date.now(),
        media: room.media
      });
      return;
    }
  });

  ws.on("close", () => {
    if (!client.roomId || !rooms.has(client.roomId)) return;
    const room = rooms.get(client.roomId);
    room.pendingClients.delete(client.id);
    room.clients.delete(client.id);
    if (room.hostClientId === client.id) {
      room.hostClientId = null;
    }
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
      state: {
        ...currentPlaybackState(room),
        playerMode: room.playerMode || "html5"
      },
      actor: null,
      serverTime: Date.now(),
      media: room.media
    };
    broadcast(room, payload);
    cleanupRoom(roomId, room);
  }
}, 5000).unref();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Sync movie server listening on http://localhost:${PORT}`);
});

