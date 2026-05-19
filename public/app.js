const $ = (selector) => document.querySelector(selector);

const video = $("#video");
const emptyState = $("#emptyState");
const fileInput = $("#fileInput");
const joinForm = $("#joinForm");
const serverUrlInput = $("#serverUrl");
const roomInput = $("#room");
const nameInput = $("#name");
const connectButton = $("#connectButton");
const statusEl = $("#status");
const clientsEl = $("#clients");
const logEl = $("#log");
const currentTimeEl = $("#currentTime");
const durationEl = $("#duration");
const togglePlayButton = $("#togglePlay");
const syncNowButton = $("#syncNow");
const playIcon = $("#playIcon");
const pauseIcon = $("#pauseIcon");

let socket = null;
let clientId = null;
let room = "";
let displayName = "";
let applyingRemote = false;
let applyingRemoteTimeout = null;
let joined = false;
let reconnectTimer = null;
let connectAttempt = 0;
let lastRemoteState = null;
let lastSeekSentAt = 0;
let remoteSeekTarget = null;
let objectUrl = null;

const DEFAULT_ROOM = localStorage.getItem("sync-room") || "movie-room";
const DEFAULT_NAME = localStorage.getItem("sync-name") || `用户${Math.floor(Math.random() * 900 + 100)}`;

roomInput.value = DEFAULT_ROOM;
nameInput.value = DEFAULT_NAME;
serverUrlInput.value = buildDefaultWsUrl();

function buildDefaultWsUrl() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws`;
}

function log(message) {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString()} ${message}`;
  logEl.prepend(item);
  while (logEl.children.length > 12) logEl.lastChild.remove();
}

function setStatus(text, online) {
  statusEl.textContent = text;
  statusEl.classList.toggle("status-online", online);
  statusEl.classList.toggle("status-offline", !online);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const rounded = Math.floor(seconds);
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function send(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN || !joined) return false;
  socket.send(JSON.stringify(payload));
  return true;
}

function connect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  const attempt = ++connectAttempt;

  const url = serverUrlInput.value.trim() || buildDefaultWsUrl();
  room = roomInput.value.trim() || "movie-room";
  displayName = nameInput.value.trim() || "Viewer";
  localStorage.setItem("sync-room", room);
  localStorage.setItem("sync-name", displayName);

  if (socket) socket.close();
  joined = false;
  setStatus("连接中", false);
  connectButton.disabled = true;

  const activeSocket = new WebSocket(url);
  socket = activeSocket;

  activeSocket.addEventListener("open", () => {
    if (attempt !== connectAttempt || activeSocket !== socket) return;
    activeSocket.send(JSON.stringify({ type: "join", room, name: displayName }));
  });

  activeSocket.addEventListener("message", (event) => {
    if (attempt !== connectAttempt || activeSocket !== socket) return;
    try {
      const message = JSON.parse(event.data);
      handleMessage(message);
    } catch {
      log("收到无法解析的服务器消息");
    }
  });

  activeSocket.addEventListener("close", () => {
    if (attempt !== connectAttempt || activeSocket !== socket) return;
    joined = false;
    clientId = null;
    socket = null;
    connectButton.disabled = false;
    setStatus("已断开", false);
    reconnectTimer = setTimeout(() => {
      if (document.visibilityState !== "hidden") connect();
    }, 2500);
  });

  activeSocket.addEventListener("error", () => {
    if (attempt !== connectAttempt || activeSocket !== socket) return;
    setStatus("连接失败", false);
  });
}

function handleMessage(message) {
  if (message.type === "joined") {
    joined = true;
    clientId = message.clientId;
    connectButton.disabled = false;
    setStatus("已连接", true);
    renderClients(message.clients || []);
    applyRemoteState(message.state, message.serverTime, "join");
    announceFile();
    log(`已进入房间 ${message.room}`);
    return;
  }

  if (message.type === "clients") {
    renderClients(message.clients || []);
    return;
  }

  if (message.type === "state") {
    lastRemoteState = { state: message.state, serverTime: message.serverTime };
    if (message.actor && message.actor.id === clientId) return;
    applyRemoteState(message.state, message.serverTime, message.reason);
    if (message.actor) log(`${message.actor.name} ${message.state.paused ? "暂停" : "播放"}`);
    return;
  }

  if (message.type === "error") {
    log(message.message || "服务端错误");
  }
}

function renderClients(clients) {
  clientsEl.replaceChildren();

  for (const client of clients) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    const file = document.createElement("span");
    name.className = "client-name";
    file.className = "client-file";
    name.textContent = `${client.name}${client.id === clientId ? "（我）" : ""}`;
    file.textContent = client.file
      ? `${client.file}${Number.isFinite(client.duration) ? ` · ${formatTime(client.duration)}` : ""}`
      : "未选择文件";
    li.append(name, file);
    clientsEl.append(li);
  }
}

function targetTimeFromState(state, serverTime) {
  if (!state) return 0;
  if (state.paused) return state.time || 0;
  const age = Math.max(0, (Date.now() - Number(serverTime || Date.now())) / 1000);
  return Math.max(0, (state.time || 0) + age * (state.rate || 1));
}

async function applyRemoteState(state, serverTime, reason) {
  if (!state || !video.src) return;

  const target = targetTimeFromState(state, serverTime);
  const drift = Math.abs(video.currentTime - target);
  const shouldSeek = reason !== "tick" || drift > 1.2;

  applyingRemote = true;
  if (applyingRemoteTimeout) {
    clearTimeout(applyingRemoteTimeout);
    applyingRemoteTimeout = null;
  }

  try {
    video.playbackRate = state.rate || 1;
    if (shouldSeek && Number.isFinite(target)) {
      remoteSeekTarget = target;
      video.currentTime = Math.min(target, video.duration || target);
    }

    if (state.paused) {
      video.pause();
    } else if (video.paused) {
      await video.play().catch(() => {
        log("浏览器阻止自动播放，请手动点一次播放");
      });
    }
  } finally {
    applyingRemoteTimeout = setTimeout(() => {
      applyingRemote = false;
      applyingRemoteTimeout = null;
      updatePlayIcon();
    }, 200);
  }
}

function announceFile() {
  if (!fileInput.files || !fileInput.files[0]) return;
  send({
    type: "file",
    name: fileInput.files[0].name,
    duration: Number.isFinite(video.duration) ? video.duration : null
  });
}

function sendControl(reason) {
  send({
    type: "control",
    reason,
    paused: video.paused,
    time: video.currentTime || 0,
    rate: video.playbackRate || 1
  });
}

function updatePlayIcon() {
  playIcon.classList.toggle("hidden", !video.paused);
  pauseIcon.classList.toggle("hidden", video.paused);
}

function updateTimeReadout() {
  currentTimeEl.textContent = formatTime(video.currentTime);
  durationEl.textContent = formatTime(video.duration);
}

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  connect();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;

  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;
  video.load();
  emptyState.classList.add("hidden");
  log(`已选择 ${file.name}`);
});

video.addEventListener("loadedmetadata", () => {
  updateTimeReadout();
  announceFile();
  if (lastRemoteState) {
    applyRemoteState(lastRemoteState.state, lastRemoteState.serverTime, "file-loaded");
  }
});

video.addEventListener("play", () => {
  updatePlayIcon();
  if (!applyingRemote) sendControl("play");
});

video.addEventListener("pause", () => {
  updatePlayIcon();
  if (!applyingRemote) sendControl("pause");
});

video.addEventListener("seeked", () => {
  if (remoteSeekTarget !== null) {
    const drift = Math.abs(video.currentTime - remoteSeekTarget);
    remoteSeekTarget = null;
    if (drift < 1.0) return;
  }
  if (applyingRemote) return;
  const now = Date.now();
  if (now - lastSeekSentAt < 250) return;
  lastSeekSentAt = now;
  sendControl("seek");
});

video.addEventListener("ratechange", () => {
  if (!applyingRemote) sendControl("rate");
});

video.addEventListener("timeupdate", updateTimeReadout);

togglePlayButton.addEventListener("click", async () => {
  if (!video.src) return;
  if (video.paused) {
    await video.play();
  } else {
    video.pause();
  }
});

syncNowButton.addEventListener("click", () => {
  if (lastRemoteState) {
    applyRemoteState(lastRemoteState.state, lastRemoteState.serverTime, "manual");
  } else {
    send({ type: "request-state" });
  }
});

window.addEventListener("beforeunload", () => {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});

setInterval(() => {
  send({ type: "request-state" });
}, 15000);

setStatus("未连接", false);
updatePlayIcon();
updateTimeReadout();
