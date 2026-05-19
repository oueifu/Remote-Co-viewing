const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const WebSocket = require("ws");

const options = parseArgs(process.argv.slice(2));
const serverUrl = options.server || "ws://localhost:5050/ws";
const room = options.room || "movie-room";
const name = options.name || os.userInfo().username || "Viewer";
const file = options.file || options._[0];
const mpvPath = options.mpv || "mpv";

if (!file) {
  console.error("缺少电影文件。用法：npm run mpv -- --server ws://服务器:5050/ws --room movie-room --file \"D:\\movie.mkv\"");
  process.exit(1);
}

const ipcPath = makeIpcPath();
let ws = null;
let mpv = null;
let ipc = null;
let clientId = null;
let joined = false;
let ipcReady = false;
let pendingRemoteState = null;
let paused = true;
let position = 0;
let speed = 1;
let lastPositionAt = Date.now();
let lastSeekSentAt = 0;
let applyingRemoteUntil = 0;
let buffer = "";

start();

function parseArgs(args) {
  const parsed = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      parsed._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith("--")) {
      parsed[key] = next;
      i += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

function makeIpcPath() {
  const id = `remote-sync-movie-${process.pid}-${Date.now()}`;
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\${id}`;
  }
  return path.join(os.tmpdir(), `${id}.sock`);
}

function start() {
  launchMpv();
  connectIpcWithRetry(40);
  connectServer();
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function launchMpv() {
  const args = [
    `--input-ipc-server=${ipcPath}`,
    "--force-window=yes",
    "--idle=yes",
    "--keep-open=yes",
    "--pause=yes",
    file
  ];

  mpv = spawn(mpvPath, args, { stdio: "inherit" });
  mpv.on("exit", (code) => {
    console.log(`mpv 已退出：${code ?? 0}`);
    shutdown();
  });
}

function connectIpcWithRetry(remaining) {
  ipc = net.createConnection(ipcPath);

  ipc.on("connect", () => {
    console.log("已连接 mpv IPC");
    ipcReady = true;
    observeMpv();
    announceFile();
    if (pendingRemoteState) {
      applyRemoteState(pendingRemoteState.state, pendingRemoteState.serverTime);
      pendingRemoteState = null;
    }
  });

  ipc.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) handleMpvMessage(line);
      newlineIndex = buffer.indexOf("\n");
    }
  });

  ipc.on("error", () => {
    ipcReady = false;
    ipc.destroy();
    if (remaining <= 0) {
      console.error("无法连接 mpv IPC，请确认 mpv 已安装并可在命令行运行。");
      shutdown();
      return;
    }
    setTimeout(() => connectIpcWithRetry(remaining - 1), 250);
  });

  ipc.on("close", () => {
    ipcReady = false;
  });
}

function observeMpv() {
  sendMpv(["observe_property", 1, "pause"]);
  sendMpv(["observe_property", 2, "time-pos"]);
  sendMpv(["observe_property", 3, "speed"]);
  sendMpv(["observe_property", 4, "duration"]);
}

function connectServer() {
  ws = new WebSocket(serverUrl);

  ws.on("open", () => {
    ws.send(JSON.stringify({ type: "join", room, name }));
  });

  ws.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    handleServerMessage(message);
  });

  ws.on("close", () => {
    joined = false;
    console.log("服务器连接已断开，2.5 秒后重连");
    setTimeout(connectServer, 2500);
  });

  ws.on("error", (error) => {
    console.error(`服务器连接错误：${error.message}`);
  });
}

function handleServerMessage(message) {
  if (message.type === "joined") {
    joined = true;
    clientId = message.clientId;
    console.log(`已进入房间：${message.room}`);
    announceFile();
    applyRemoteState(message.state, message.serverTime);
    return;
  }

  if (message.type === "state") {
    if (message.actor && message.actor.id === clientId) return;
    applyRemoteState(message.state, message.serverTime);
    if (message.actor) {
      console.log(`${message.actor.name} ${message.state.paused ? "暂停" : "播放"} ${formatSeconds(message.state.time)}`);
    }
    return;
  }

  if (message.type === "error") {
    console.error(message.message || "服务器错误");
  }
}

function handleMpvMessage(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  if (message.event !== "property-change") return;

  const isRemoteChange = Date.now() < applyingRemoteUntil;

  if (message.name === "pause" && typeof message.data === "boolean") {
    paused = message.data;
    if (!isRemoteChange) sendControl(paused ? "pause" : "play");
    return;
  }

  if (message.name === "speed" && Number.isFinite(message.data)) {
    speed = message.data;
    if (!isRemoteChange) sendControl("rate");
    return;
  }

  if (message.name === "time-pos" && Number.isFinite(message.data)) {
    const now = Date.now();
    const expected = paused ? position : position + ((now - lastPositionAt) / 1000) * speed;
    const jump = Math.abs(message.data - expected);
    position = message.data;
    lastPositionAt = now;

    if (!isRemoteChange && jump > 1.2 && now - lastSeekSentAt > 500) {
      lastSeekSentAt = now;
      sendControl("seek");
    }
  }

  if (message.name === "duration" && Number.isFinite(message.data)) {
    announceFile(message.data);
  }
}

function applyRemoteState(state, serverTime) {
  if (!state) return;
  if (!ipcReady || !ipc || ipc.destroyed) {
    pendingRemoteState = { state, serverTime };
    return;
  }

  applyingRemoteUntil = Date.now() + 900;

  const target = targetTimeFromState(state, serverTime);
  paused = Boolean(state.paused);
  position = target;
  speed = state.rate || 1;
  lastPositionAt = Date.now();

  sendMpv(["set_property", "speed", speed]);
  sendMpv(["set_property", "time-pos", target]);
  sendMpv(["set_property", "pause", paused]);
}

function targetTimeFromState(state, serverTime) {
  if (state.paused) return state.time || 0;
  const age = Math.max(0, (Date.now() - Number(serverTime || Date.now())) / 1000);
  return Math.max(0, (state.time || 0) + age * (state.rate || 1));
}

function sendControl(reason) {
  sendServer({
    type: "control",
    reason,
    paused,
    time: position,
    rate: speed
  });
}

function announceFile(duration = null) {
  sendServer({
    type: "file",
    name: path.basename(file),
    duration: Number.isFinite(duration) ? duration : null
  });
}

function sendServer(payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !joined) return;
  ws.send(JSON.stringify(payload));
}

function sendMpv(command) {
  if (!ipc || ipc.destroyed) return;
  ipc.write(`${JSON.stringify({ command })}\n`);
}

function formatSeconds(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = value % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function shutdown() {
  if (ws) ws.close();
  if (ipc && !ipc.destroyed) ipc.destroy();
  if (mpv && !mpv.killed) mpv.kill();
  if (process.platform !== "win32" && fs.existsSync(ipcPath)) {
    fs.rmSync(ipcPath, { force: true });
  }
  process.exit(0);
}
