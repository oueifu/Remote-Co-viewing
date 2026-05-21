const $ = (selector) => document.querySelector(selector);

const video = $("#video-player");
const emptyState = $("#video-placeholder");
const fileInput = $("#local-file-input");
const serverUrlInput = $("#server-input");
const roomInput = $("#room-input");
const nameInput = $("#name-input");
const networkUrlInput = $("#network-url-input");
const loadUrlButton = $("#load-url-btn");
const inviteBtn = $("#invite-btn");
const inviteText = $("#invite-text");
const connectButton = $("#connect-btn");
const statusIndicator = $("#room-connection-indicator");
const clientsEl = $("#member-list");
const chatMessagesEl = $("#chat-messages");
const chatForm = $("#chat-form");
const chatInput = $("#chat-input");
const logEl = $("#log-box");
const timeDisplay = $("#time-display");
const playPauseButton = $("#play-pause-btn");
const syncNowButton = $("#syncNow");
const chooseLocalButton = $("#choose-local-btn");
const videoTitleEl = $("#current-video-title");
const syncStatusBadge = $("#sync-status");
const progressContainer = $("#progress-container");
const progressBar = $("#progress-bar");
const danmakuStage = $("#danmaku-stage");
const danmakuToggleButton = $("#danmaku-toggle-btn");
const fullscreenBtn = $("#fullscreen-btn");
const muteButton = $("#mute-btn");
const volumeSlider = $("#volume-slider");
const appContainer = $(".app-container");
const mainContent = $(".main-content");
const controlsBar = $(".controls-bar");
const sidebar = $(".sidebar");
const voicePanel = $(".voice-panel");
const audioStatusText = $("#audio-status-text");
const fullscreenStatus = $("#fullscreen-status");
const localCallVideo = $("#local-video");
const remoteCallVideo = $("#remote-video");
const localCallLabel = $("#local-call-label");
const remoteCallLabel = $("#remote-call-label");
const callButton = $("#call-btn");
const micToggleButton = $("#mic-toggle-btn");
const cameraToggleButton = $("#camera-toggle-btn");

let socket = null;
let clientId = null;
let room = "";
let displayName = "";
let isRemoteAction = false;
let isRemoteActionTimeout = null;
let joined = false;
let reconnectTimer = null;
let connectAttempt = 0;
let lastRemoteState = null;
let lastSeekSentAt = 0;
let remoteSeekTarget = null;
let objectUrl = null;
let currentDanmakuCid = "";
let historyDanmakus = [];
let historyDanmakuIndex = 0;
let lastDanmakuTime = 0;
let pendingVideoBroadcast = null;
let currentVideoSignature = "";
let autoPlayAfterLoad = false;
let controlsHideTimer = null;
let chatPanelHideTimer = null;
let lastControlsMouseX = 0;
let lastControlsMouseY = 0;
let localCallStream = null;
let peerConnection = null;
let callActive = false;
let makingOffer = false;
let remoteCallPeerName = "";
let pendingRtcCandidates = [];
let movieVolumeBeforeCallDucking = null;
let suppressVolumeStorage = false;
const renderedChatIds = new Set();
const LOG_RETENTION_MS = 60 * 1000;
const DEFAULT_VOLUME = 0.7;
const CONTROLS_HIDE_DELAY_MS = 2500;
const CHAT_PANEL_HIDE_DELAY_MS = 650;
const MOVIE_DUCK_VOLUME = 0.2;
const CALL_AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
};
const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

const URL_PARAMS = new URLSearchParams(location.search);
const PRESET_ROOM = URL_PARAMS.get("room")?.trim();
const PRESET_NAME = URL_PARAMS.get("name")?.trim();
const PRESET_SERVER = URL_PARAMS.get("server")?.trim();
const AUTO_CONNECT = Boolean(PRESET_ROOM || PRESET_SERVER || URL_PARAMS.get("autoconnect") === "1");
const SAVED_VOLUME_VALUE = localStorage.getItem("sync-volume");
const SAVED_VOLUME = SAVED_VOLUME_VALUE === null ? NaN : Number(SAVED_VOLUME_VALUE);
const SAVED_MUTED = localStorage.getItem("sync-muted") === "true";
let danmakuVisible = localStorage.getItem("sync-danmaku-visible") !== "false";

const DEFAULT_ROOM = PRESET_ROOM || localStorage.getItem("sync-room") || "movie-room";
const DEFAULT_NAME = PRESET_NAME || localStorage.getItem("sync-name") || `用户${Math.floor(Math.random() * 900 + 100)}`;

roomInput.value = DEFAULT_ROOM;
nameInput.value = DEFAULT_NAME;
serverUrlInput.value = PRESET_SERVER || buildDefaultWsUrl();
video.volume = Number.isFinite(SAVED_VOLUME) && SAVED_VOLUME > 0
  ? Math.min(1, Math.max(0, SAVED_VOLUME))
  : DEFAULT_VOLUME;
video.muted = SAVED_MUTED;
updateInviteLink();

function buildDefaultWsUrl() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws`;
}

function log(message) {
  const line = document.createElement("div");
  const now = Date.now();
  line.dataset.timestamp = String(now);
  line.textContent = `${new Date(now).toLocaleTimeString()} ${message}`;
  logEl.prepend(line);
  pruneLogs();
}

function pruneLogs() {
  if (!logEl) return;
  const cutoff = Date.now() - LOG_RETENTION_MS;
  for (const line of Array.from(logEl.children)) {
    const timestamp = Number(line.dataset.timestamp);
    if (Number.isFinite(timestamp) && timestamp < cutoff) line.remove();
  }
}

function setStatus(text, online) {
  if (!statusIndicator) return;
  statusIndicator.textContent = text;
  statusIndicator.style.color = online ? "#10b981" : "#ef4444";
  if (syncStatusBadge) {
    syncStatusBadge.textContent = online ? "房间已连接，等待同步观影" : "等待加入房间...";
    syncStatusBadge.classList.toggle("is-online", online);
  }
}

function updateDanmakuToggle() {
  if (danmakuStage) danmakuStage.classList.toggle("hidden-danmaku", !danmakuVisible);
  if (danmakuToggleButton) {
    danmakuToggleButton.classList.toggle("is-off", !danmakuVisible);
    danmakuToggleButton.textContent = danmakuVisible ? "👁" : "⊘";
    danmakuToggleButton.title = danmakuVisible ? "隐藏弹幕（D）" : "显示弹幕（D）";
  }
}

function toggleDanmaku() {
  danmakuVisible = !danmakuVisible;
  localStorage.setItem("sync-danmaku-visible", String(danmakuVisible));
  updateDanmakuToggle();
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

function buildInviteLink(roomId) {
  const baseUrl = `${location.origin}${location.pathname}`;
  return `${baseUrl}?room=${encodeURIComponent(roomId || roomInput.value.trim() || "movie-room")}`;
}

function updateInviteLink() {
  if (!inviteText) return;
  inviteText.textContent = buildInviteLink(roomInput.value.trim() || "movie-room");
}

function isBilibiliLink(url) {
  return /(?:bilibili\.com|b23\.tv)/i.test(String(url));
}

function normalizeVideoTitle(url) {
  if (!url) return "网络视频流";
  try {
    const parsed = new URL(url);
    return parsed.pathname.split("/").filter(Boolean).pop() || "网络视频流";
  } catch {
    return "网络视频流";
  }
}

function normalizeCid(cid) {
  const value = String(cid || "").trim();
  return /^\d{1,20}$/.test(value) ? value : "";
}

function buildVideoSignature(url, cid = "") {
  return `${normalizeCid(cid) || "no-cid"}|${String(url || "").trim()}`;
}

function executeLoadVideo(url, title, isRemote = false, cid = "") {
  if (!url) return false;
  const cleanCid = normalizeCid(cid);
  const signature = buildVideoSignature(url, cleanCid);
  if (signature === currentVideoSignature && video.src === url) return false;

  currentVideoSignature = signature;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  video.src = url;
  video.load();
  emptyState.classList.add("hidden");
  if (videoTitleEl) videoTitleEl.textContent = title || normalizeVideoTitle(url);
  log(`加载视频：${title || normalizeVideoTitle(url)}`);
  resetDanmaku();
  if (cleanCid) loadBilibiliDanmaku(cleanCid);
  if (!isRemote) {
    send({ type: "load_video_request", url, title: title || normalizeVideoTitle(url), cid: cleanCid });
  }
  return true;
}

function send(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN || !joined) return false;
  socket.send(JSON.stringify(payload));
  return true;
}

function broadcastVideoWhenReady(videoPayload) {
  if (!videoPayload) return;
  const payload = {
    type: "load_video_request",
    url: videoPayload.url,
    title: videoPayload.title || normalizeVideoTitle(videoPayload.url),
    cid: normalizeCid(videoPayload.cid)
  };

  if (send(payload)) {
    pendingVideoBroadcast = null;
    return;
  }

  pendingVideoBroadcast = payload;
  if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
    connect();
  }
}

async function tryAutoPlayLoadedVideo() {
  if (!autoPlayAfterLoad || !video.src || !video.paused) return;
  try {
    await video.play();
    autoPlayAfterLoad = false;
    sendControl("auto-play");
  } catch {
    log("浏览器阻止自动播放，请手动点一次播放");
  }
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

  let activeSocket;
  try {
    activeSocket = new WebSocket(url);
  } catch {
    connectButton.disabled = false;
    setStatus("连接失败", false);
    log("服务器地址无效，请填写 ws:// 或 wss:// 开头的地址");
    return;
  }

  socket = activeSocket;

  activeSocket.addEventListener("open", () => {
    if (attempt !== connectAttempt || activeSocket !== socket) return;
    activeSocket.send(JSON.stringify({ type: "join", room, name: displayName }));
  });

  activeSocket.addEventListener("message", (event) => {
    if (attempt !== connectAttempt || activeSocket !== socket) return;
    try {
      const message = JSON.parse(event.data);
      handleMessage(message).catch((error) => {
        log(`消息处理失败：${error.message || "未知错误"}`);
      });
    } catch {
      log("收到无法解析的服务器消息");
    }
  });

  activeSocket.addEventListener("close", () => {
    if (attempt !== connectAttempt || activeSocket !== socket) return;
    joined = false;
    clientId = null;
    socket = null;
    endRtcCall(false);
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

async function handleMessage(message) {
  if (message.type === "joined") {
    joined = true;
    clientId = message.clientId;
    connectButton.disabled = false;
    setStatus("已连接", true);
    renderClients(message.clients || []);
    applyRemoteState(message.state, message.serverTime, "join");
    announceFile();
    if (pendingVideoBroadcast) {
      send(pendingVideoBroadcast);
      pendingVideoBroadcast = null;
    }
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

  if (message.type === "chat") {
    const alreadyRendered = message.id && renderedChatIds.has(message.id);
    renderChatMessage(message);
    if (!alreadyRendered) {
      shootPrivateDanmaku(message.text, message.sender?.id === clientId, message.sender?.name);
    }
    return;
  }

  if (message.type === "load_video") {
    const loaded = executeLoadVideo(message.url, message.title || "网络视频流", true, message.cid);
    if (loaded) log(`已同步加载视频：${message.title || "网络视频流"}`);
    return;
  }

  if (message.type === "rtc_offer" || message.type === "rtc_answer" || message.type === "rtc_ice" || message.type === "rtc_hangup" || message.type === "rtc_peer_left") {
    await handleRtcSignal(message);
    return;
  }

  if (message.type === "error") {
    log(message.message || "服务端错误");
  }
}

function renderClients(clients) {
  clientsEl.replaceChildren();

  if (!clients || clients.length === 0) {
    clientsEl.textContent = "暂无成员";
    return;
  }

  for (const client of clients) {
    const item = document.createElement("div");
    item.className = "member-item";
    item.textContent = `${client.name}${client.id === clientId ? "（我）" : ""}`;
    if (client.file) {
      const meta = document.createElement("div");
      meta.style.fontSize = "12px";
      meta.style.color = "#8b8b9b";
      meta.textContent = `${client.file}${Number.isFinite(client.duration) ? ` · ${formatTime(client.duration)}` : ""}`;
      item.appendChild(meta);
    }
    clientsEl.append(item);
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

  isRemoteAction = true;
  if (isRemoteActionTimeout) {
    clearTimeout(isRemoteActionTimeout);
    isRemoteActionTimeout = null;
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
    isRemoteActionTimeout = setTimeout(() => {
      isRemoteAction = false;
      isRemoteActionTimeout = null;
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

function resetDanmaku() {
  currentDanmakuCid = "";
  historyDanmakus = [];
  historyDanmakuIndex = 0;
  lastDanmakuTime = 0;
  if (!danmakuStage) return;
  danmakuStage.replaceChildren();
}

function findDanmakuStartIndex(time) {
  let low = 0;
  let high = historyDanmakus.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (historyDanmakus[mid].time < time) low = mid + 1;
    else high = mid;
  }
  return low;
}

function emitDanmaku(comment, privateStyle = false, privateTone = "") {
  if (!danmakuStage || !comment?.text) return;

  const item = document.createElement("div");
  item.className = privateStyle ? "private-danmaku" : "history-danmaku";
  if (privateStyle) {
    item.classList.add(privateTone === "me" ? "private-danmaku-me" : "private-danmaku-peer");
  }
  item.textContent = comment.text;
  item.style.position = "absolute";
  item.style.willChange = "transform";

  const stageHeight = danmakuStage.clientHeight || video.clientHeight || 360;
  const stageWidth = danmakuStage.clientWidth || video.clientWidth || 640;
  const laneHeight = privateStyle ? 34 : 28;
  const maxLane = Math.max(1, Math.floor((stageHeight * 0.72) / laneHeight));
  const lane = Math.floor(Math.random() * maxLane);
  const mode = comment.mode || "rtl";

  if (mode === "top" || mode === "bottom") {
    item.style.left = "50%";
    item.style.transform = "translateX(-50%)";
    item.style.top = mode === "top" ? `${12 + lane * laneHeight}px` : "auto";
    item.style.bottom = mode === "bottom" ? `${54 + lane * laneHeight}px` : "auto";
    danmakuStage.append(item);
    setTimeout(() => item.remove(), privateStyle ? 5600 : 4400);
    return;
  }

  item.style.top = `${12 + lane * laneHeight}px`;
  item.style.left = `${stageWidth}px`;
  danmakuStage.append(item);

  const distance = stageWidth + item.offsetWidth + 80;
  const duration = privateStyle ? 9000 : 8200;
  item.animate(
    [
      { transform: "translateX(0)" },
      { transform: `translateX(-${distance}px)` }
    ],
    { duration, easing: "linear" }
  ).onfinish = () => item.remove();
}

function flushHistoryDanmaku() {
  if (!historyDanmakus.length || video.paused) return;

  const current = video.currentTime || 0;
  if (current + 0.5 < lastDanmakuTime || current - lastDanmakuTime > 5) {
    historyDanmakuIndex = findDanmakuStartIndex(Math.max(0, current - 0.2));
  }

  let emitted = 0;
  while (
    historyDanmakuIndex < historyDanmakus.length
    && historyDanmakus[historyDanmakuIndex].time <= current + 0.25
    && emitted < 28
  ) {
    const comment = historyDanmakus[historyDanmakuIndex];
    if (comment.time >= current - 0.35) {
      emitDanmaku(comment, false);
      emitted += 1;
    }
    historyDanmakuIndex += 1;
  }

  lastDanmakuTime = current;
}

async function loadBilibiliDanmaku(cid) {
  const cleanCid = normalizeCid(cid);
  if (!cleanCid) {
    log("未收到有效 cid，跳过 B 站历史弹幕");
    return;
  }
  if (cleanCid === currentDanmakuCid) return;
  currentDanmakuCid = cleanCid;

  try {
    const response = await fetch(`/api/danmaku?cid=${encodeURIComponent(cleanCid)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const xmlText = await response.text();
    const xmlDoc = new DOMParser().parseFromString(xmlText, "text/xml");
    if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
      throw new Error("Invalid XML");
    }

    const dmElements = Array.from(xmlDoc.getElementsByTagName("d"));
    historyDanmakus = dmElements.map((element) => {
      const params = String(element.getAttribute("p") || "").split(",");
      const type = params[1];
      return {
        text: element.textContent || "",
        time: Number(params[0]) || 0,
        mode: type === "4" ? "bottom" : type === "5" ? "top" : "rtl"
      };
    }).filter((comment) => comment.text && Number.isFinite(comment.time))
      .sort((a, b) => a.time - b.time);

    historyDanmakuIndex = findDanmakuStartIndex(video.currentTime || 0);
    lastDanmakuTime = video.currentTime || 0;
    log(`成功载入 ${historyDanmakus.length} 条 B 站原版弹幕`);
    if (historyDanmakus.length === 0) {
      log(`cid=${cleanCid} 没有返回弹幕，可能是 cid 未更新或该视频无历史弹幕`);
    }
  } catch (error) {
    log(`B 站历史弹幕加载失败：${error.message || "代理请求失败"}`);
  }
}

function shootPrivateDanmaku(text, isMe, senderName = "") {
  const cleanText = String(text || "").trim();
  if (!cleanText || senderName === "系统提示") return;
  const label = isMe ? "我" : (senderName || "好友");
  emitDanmaku({ text: `${label}：${cleanText}`, mode: "rtl" }, true, isMe ? "me" : "peer");
}

function sendChatMessage(text) {
  const cleanText = String(text || "").trim().slice(0, 240);
  if (!cleanText) return false;
  if (!joined || !socket || socket.readyState !== WebSocket.OPEN) {
    log("请先连接房间，再发送弹幕/消息");
    return false;
  }

  const messageId = `${clientId || "local"}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const localMessage = {
    id: messageId,
    type: "chat",
    sender: { id: clientId, name: displayName || nameInput.value.trim() || "我" },
    text: cleanText,
    timestamp: Date.now()
  };

  if (!send({ type: "chat", id: messageId, text: cleanText })) return false;
  renderChatMessage(localMessage);
  shootPrivateDanmaku(cleanText, true, localMessage.sender.name);
  return true;
}

function renderChatMessage(message) {
  if (!chatMessagesEl) return;
  if (message.id && renderedChatIds.has(message.id)) return;
  if (message.id) {
    renderedChatIds.add(message.id);
    if (renderedChatIds.size > 100) {
      const [oldest] = renderedChatIds;
      renderedChatIds.delete(oldest);
    }
  }

  const item = document.createElement("div");
  item.className = "chat-message";
  if (message.sender?.id === clientId) item.classList.add("me");
  if (message.sender?.id === "system") item.classList.add("system");
  const header = document.createElement("div");
  header.className = "chat-message-header";
  header.textContent = message.sender?.name || message.sender?.id || "系统";
  if (message.sender?.id === clientId) header.textContent += "（我）";
  const body = document.createElement("div");
  body.className = "chat-message-body";
  body.textContent = message.text || "";
  item.append(header, body);
  chatMessagesEl.append(item);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function updatePlayIcon() {
  if (!playPauseButton) return;
  playPauseButton.textContent = video.paused ? "▶ 播放" : "❚❚ 暂停";
}

function updateTimeReadout() {
  if (!timeDisplay) return;
  timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
}

function updateProgressBar() {
  if (!progressBar) return;
  const duration = video.duration;
  const progress = Number.isFinite(duration) && duration > 0
    ? Math.min(100, Math.max(0, (video.currentTime / duration) * 100))
    : 0;
  progressBar.style.width = `${progress}%`;
}

function updateVolumeControls() {
  const volume = Math.round(video.volume * 100);
  if (volumeSlider) volumeSlider.value = String(volume);
  const silent = video.muted || video.volume === 0;
  if (muteButton) {
    muteButton.textContent = silent ? "🔇" : "🔊";
    muteButton.title = silent ? "取消静音" : "静音";
    muteButton.setAttribute("aria-label", silent ? "取消静音" : "静音");
  }
  if (audioStatusText) {
    audioStatusText.textContent = silent ? "🔇 静音" : `🔊 音频 ${volume}%`;
  }
  document.querySelector(".playback-status")?.classList.toggle("is-muted", silent);
}

function setVolumeFromSlider() {
  if (!volumeSlider) return;
  const nextVolume = Math.min(1, Math.max(0, Number(volumeSlider.value) / 100));
  const cleanVolume = Number.isFinite(nextVolume) ? nextVolume : DEFAULT_VOLUME;
  if (movieVolumeBeforeCallDucking !== null) {
    movieVolumeBeforeCallDucking = cleanVolume;
    localStorage.setItem("sync-volume", String(cleanVolume));
    setMovieVolumeWithoutSaving(Math.min(cleanVolume, MOVIE_DUCK_VOLUME));
  } else {
    video.volume = cleanVolume;
  }
  video.muted = video.volume === 0;
}

function toggleMute() {
  if (video.muted || video.volume === 0) {
    if (video.volume === 0) video.volume = DEFAULT_VOLUME;
    video.muted = false;
    if (movieVolumeBeforeCallDucking !== null) duckMovieAudioForCall();
  } else {
    video.muted = true;
  }
}

function setMovieVolumeWithoutSaving(volume) {
  suppressVolumeStorage = true;
  video.volume = Math.min(1, Math.max(0, volume));
  updateVolumeControls();
  setTimeout(() => {
    suppressVolumeStorage = false;
  }, 0);
}

function duckMovieAudioForCall() {
  if (!video || video.muted) return;
  if (movieVolumeBeforeCallDucking === null) {
    movieVolumeBeforeCallDucking = video.volume || DEFAULT_VOLUME;
    log("连麦中已自动压低电影音量，减少回声干扰");
  }
  const duckedVolume = Math.min(movieVolumeBeforeCallDucking, MOVIE_DUCK_VOLUME);
  if (Math.abs(video.volume - duckedVolume) > 0.01) {
    setMovieVolumeWithoutSaving(duckedVolume);
  }
}

function restoreMovieAudioAfterCall() {
  if (movieVolumeBeforeCallDucking === null) return;
  const restoreVolume = movieVolumeBeforeCallDucking;
  movieVolumeBeforeCallDucking = null;
  if (!video.muted) setMovieVolumeWithoutSaving(restoreVolume);
}

function fullscreenElement() {
  return document.fullscreenElement
    || document.webkitFullscreenElement
    || document.mozFullScreenElement
    || document.msFullscreenElement
    || null;
}

function requestFullscreen(element) {
  const request = element.requestFullscreen
    || element.webkitRequestFullscreen
    || element.mozRequestFullScreen
    || element.msRequestFullscreen;
  if (request) return request.call(element);
  if (video.webkitEnterFullscreen && video.src) {
    video.webkitEnterFullscreen();
    return Promise.resolve();
  }
  return Promise.reject(new Error("当前浏览器不支持页面全屏"));
}

function exitFullscreen() {
  const exit = document.exitFullscreen
    || document.webkitExitFullscreen
    || document.mozCancelFullScreen
    || document.msExitFullscreen;
  return exit ? exit.call(document) : Promise.resolve();
}

function updateFullscreenButton() {
  if (!fullscreenBtn) return;
  const active = Boolean(fullscreenElement());
  fullscreenBtn.textContent = active ? "退出全屏" : "⛶ 全屏";
  if (fullscreenStatus) {
    fullscreenStatus.textContent = active ? "● 已全屏" : "● 窗口模式";
    fullscreenStatus.classList.toggle("is-active", active);
  }
  if (!active) {
    appContainer?.classList.remove("show-chat-panel");
    keepPlaybackControlsVisible();
  } else {
    showPlaybackControls();
  }
}

async function toggleFullscreen() {
  const fullscreenTarget = appContainer || mainContent;
  if (!fullscreenTarget) return;
  if (fullscreenElement()) {
    await exitFullscreen();
  } else {
    await requestFullscreen(fullscreenTarget);
  }
  updateFullscreenButton();
}

function isControlsAutohideEnabled() {
  return Boolean(video.src && !video.paused);
}

function isTinyMouseJitter(event) {
  if (!event) return false;
  const isTinyMove = Math.abs(event.clientX - lastControlsMouseX) < 2
    && Math.abs(event.clientY - lastControlsMouseY) < 2;
  lastControlsMouseX = event.clientX;
  lastControlsMouseY = event.clientY;
  return isTinyMove;
}

function hidePlaybackControls() {
  if (!controlsBar || !appContainer || !isControlsAutohideEnabled() || controlsBar.matches(":hover")) return;
  controlsBar.classList.add("hide-controls");
  appContainer.classList.add("hide-cursor");
}

function scheduleControlsAutohide() {
  clearTimeout(controlsHideTimer);
  if (!isControlsAutohideEnabled() || (controlsBar && controlsBar.matches(":hover"))) return;
  controlsHideTimer = setTimeout(hidePlaybackControls, CONTROLS_HIDE_DELAY_MS);
}

function showPlaybackControls(event = null) {
  if (!controlsBar || !appContainer) return;
  if (isTinyMouseJitter(event)) return;
  controlsBar.classList.remove("hide-controls");
  appContainer.classList.remove("hide-cursor");
  scheduleControlsAutohide();
}

function keepPlaybackControlsVisible() {
  clearTimeout(controlsHideTimer);
  if (!controlsBar || !appContainer) return;
  controlsBar.classList.remove("hide-controls");
  appContainer.classList.remove("hide-cursor");
}

function hideFullscreenChatPanel() {
  if (!appContainer || !fullscreenElement()) return;
  appContainer.classList.remove("show-chat-panel");
}

function scheduleFullscreenChatPanelHide() {
  clearTimeout(chatPanelHideTimer);
  chatPanelHideTimer = setTimeout(hideFullscreenChatPanel, CHAT_PANEL_HIDE_DELAY_MS);
}

function showFullscreenChatPanel() {
  if (!appContainer || !fullscreenElement()) return;
  appContainer.classList.add("show-chat-panel");
  clearTimeout(chatPanelHideTimer);
}

function toggleFullscreenChatPanel() {
  if (!appContainer || !fullscreenElement()) return;
  if (appContainer.classList.contains("show-chat-panel")) {
    hideFullscreenChatPanel();
  } else {
    showFullscreenChatPanel();
  }
}

function initControlsAutohide() {
  if (!appContainer || !controlsBar) return;

  appContainer.addEventListener("mousemove", (event) => {
    showPlaybackControls(event);
    if (fullscreenElement() && event.clientX > window.innerWidth - 34) {
      showFullscreenChatPanel();
    } else if (fullscreenElement() && appContainer?.classList.contains("show-chat-panel")) {
      const panelWidth = sidebar?.getBoundingClientRect().width || 380;
      if (event.clientX < window.innerWidth - panelWidth - 48 && !sidebar?.matches(":hover")) {
        scheduleFullscreenChatPanelHide();
      }
    }
  });

  appContainer.addEventListener("mouseenter", showPlaybackControls);
  appContainer.addEventListener("mouseleave", () => {
    if (isControlsAutohideEnabled()) hidePlaybackControls();
  });

  controlsBar.addEventListener("mouseenter", keepPlaybackControlsVisible);
  controlsBar.addEventListener("mouseleave", scheduleControlsAutohide);
  controlsBar.addEventListener("focusin", keepPlaybackControlsVisible);
  controlsBar.addEventListener("focusout", scheduleControlsAutohide);

  if (sidebar) {
    sidebar.addEventListener("mouseenter", showFullscreenChatPanel);
    sidebar.addEventListener("mouseleave", scheduleFullscreenChatPanelHide);
  }
}

function canUseRtc() {
  return Boolean(window.RTCPeerConnection && navigator.mediaDevices?.getUserMedia);
}

function updateCallControls() {
  const hasLocalStream = Boolean(localCallStream);
  const audioTrack = localCallStream?.getAudioTracks()[0];
  const videoTrack = localCallStream?.getVideoTracks()[0];
  const isCalling = callActive || Boolean(peerConnection);

  if (localCallLabel) localCallLabel.textContent = displayName || nameInput.value.trim() || "我";
  if (remoteCallLabel) remoteCallLabel.textContent = remoteCallPeerName || "对方";

  if (callButton) {
    callButton.textContent = isCalling ? "挂断" : "📞 连麦";
    callButton.classList.toggle("is-active", isCalling);
  }

  if (voicePanel) voicePanel.classList.toggle("is-active", isCalling);

  if (micToggleButton) {
    micToggleButton.disabled = !hasLocalStream || !audioTrack;
    micToggleButton.textContent = !audioTrack || audioTrack.enabled ? "🎙" : "🔇";
    micToggleButton.classList.toggle("is-off", Boolean(audioTrack && !audioTrack.enabled));
  }

  if (cameraToggleButton) {
    cameraToggleButton.disabled = !hasLocalStream || !videoTrack;
    cameraToggleButton.textContent = !videoTrack || videoTrack.enabled ? "📷" : "▣";
    cameraToggleButton.classList.toggle("is-off", Boolean(videoTrack && !videoTrack.enabled));
  }
}

async function ensureLocalCallStream() {
  if (localCallStream) return localCallStream;
  if (!canUseRtc()) throw new Error("当前浏览器不支持 WebRTC 或媒体权限");

  localCallStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: CALL_AUDIO_CONSTRAINTS
  });
  if (localCallVideo) localCallVideo.srcObject = localCallStream;
  updateCallControls();
  return localCallStream;
}

function createPeerConnection() {
  if (peerConnection) return peerConnection;

  peerConnection = new RTCPeerConnection(RTC_CONFIG);

  peerConnection.ontrack = (event) => {
    const [stream] = event.streams;
    if (stream && remoteCallVideo) remoteCallVideo.srcObject = stream;
    callActive = true;
    duckMovieAudioForCall();
    updateCallControls();
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) send({ type: "rtc_ice", candidate: event.candidate });
  };

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection?.connectionState;
    if (state === "connected") {
      callActive = true;
      duckMovieAudioForCall();
      updateCallControls();
      log("连麦已建立");
    } else if (state === "failed" || state === "disconnected") {
      log("连麦连接不稳定，正在等待浏览器恢复");
    } else if (state === "closed") {
      callActive = false;
      updateCallControls();
    }
  };

  if (localCallStream) {
    localCallStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localCallStream);
    });
  }

  updateCallControls();
  return peerConnection;
}

async function flushPendingRtcCandidates() {
  if (!peerConnection || !peerConnection.remoteDescription) return;
  const candidates = pendingRtcCandidates;
  pendingRtcCandidates = [];
  for (const candidate of candidates) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      log(`连麦候选地址添加失败：${error.message || "ICE 错误"}`);
    }
  }
}

async function startRtcCall() {
  if (!joined || !socket || socket.readyState !== WebSocket.OPEN) {
    log("请先连接房间，再发起连麦");
    return;
  }

  try {
    await ensureLocalCallStream();
    const pc = createPeerConnection();
    callActive = true;
    makingOffer = true;
    duckMovieAudioForCall();
    updateCallControls();
    await pc.setLocalDescription(await pc.createOffer());
    send({ type: "rtc_offer", offer: pc.localDescription });
    log("已发起连麦邀请");
  } catch (error) {
    log(`连麦启动失败：${error.message || "无法获取摄像头/麦克风"}`);
    endRtcCall(false);
  } finally {
    makingOffer = false;
  }
}

function endRtcCall(notifyPeer = true) {
  if (notifyPeer && joined) send({ type: "rtc_hangup" });

  if (peerConnection) {
    peerConnection.ontrack = null;
    peerConnection.onicecandidate = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.close();
  }

  peerConnection = null;
  makingOffer = false;
  callActive = false;
  remoteCallPeerName = "";
  pendingRtcCandidates = [];

  if (localCallStream) {
    localCallStream.getTracks().forEach((track) => track.stop());
  }
  localCallStream = null;

  if (localCallVideo) localCallVideo.srcObject = null;
  if (remoteCallVideo) remoteCallVideo.srcObject = null;
  restoreMovieAudioAfterCall();
  updateCallControls();
}

async function handleRtcSignal(message) {
  if (message.sender?.id === clientId) return;

  if (message.sender?.name) {
    remoteCallPeerName = message.sender.name;
    updateCallControls();
  }

  if (message.type === "rtc_hangup" || message.type === "rtc_peer_left") {
    if (peerConnection || localCallStream) log("对方已结束连麦");
    endRtcCall(false);
    return;
  }

  if (message.type === "rtc_offer") {
    try {
      await ensureLocalCallStream();
      const pc = createPeerConnection();
      const offerCollision = makingOffer || pc.signalingState !== "stable";
      const polite = String(clientId || "") > String(message.sender?.id || "");

      if (offerCollision) {
        if (!polite) return;
        await pc.setLocalDescription({ type: "rollback" });
      }

      await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
      await flushPendingRtcCandidates();
      await pc.setLocalDescription(await pc.createAnswer());
      send({ type: "rtc_answer", answer: pc.localDescription });
      callActive = true;
      duckMovieAudioForCall();
      updateCallControls();
      log(`已接通 ${remoteCallPeerName || "对方"} 的连麦`);
    } catch (error) {
      log(`接听连麦失败：${error.message || "WebRTC 握手失败"}`);
      endRtcCall(false);
    }
    return;
  }

  if (message.type === "rtc_answer") {
    if (!peerConnection || peerConnection.signalingState === "stable") return;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
    await flushPendingRtcCandidates();
    callActive = true;
    duckMovieAudioForCall();
    updateCallControls();
    return;
  }

  if (message.type === "rtc_ice") {
    if (!message.candidate) return;
    if (!peerConnection || !peerConnection.remoteDescription) {
      pendingRtcCandidates.push(message.candidate);
      return;
    }
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
    } catch (error) {
      if (!makingOffer) log(`连麦候选地址添加失败：${error.message || "ICE 错误"}`);
    }
  }
}

function toggleMicTrack() {
  const track = localCallStream?.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  updateCallControls();
}

function toggleCameraTrack() {
  const track = localCallStream?.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  updateCallControls();
}

function seekFromPointer(event) {
  if (!progressContainer || !Number.isFinite(video.duration) || video.duration <= 0) return;
  const rect = progressContainer.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  video.currentTime = ratio * video.duration;
}

function openLocalFilePicker() {
  if (!fileInput) return;
  fileInput.value = "";
  if (typeof fileInput.showPicker === "function") {
    try {
      fileInput.showPicker();
      return;
    } catch {
      // Fall back to click below when showPicker is unavailable for this browser state.
    }
  }
  fileInput.click();
}

function loadBookmarkedVideo(data) {
  const url = String(data?.url || "").trim();
  if (!url) return;

  const title = String(data.title || normalizeVideoTitle(url)).trim() || normalizeVideoTitle(url);
  const cid = normalizeCid(data.cid);
  const signature = buildVideoSignature(url, cid);
  const isSameVideo = signature === currentVideoSignature && video.src === url;
  const pendingSignature = pendingVideoBroadcast
    ? buildVideoSignature(pendingVideoBroadcast.url, pendingVideoBroadcast.cid)
    : "";

  if (isSameVideo && (joined || pendingSignature === signature)) return;

  autoPlayAfterLoad = true;
  if (networkUrlInput) {
    networkUrlInput.value = url;
    networkUrlInput.dataset.cid = cid;
    networkUrlInput.dataset.title = title;
  }
  if (!isSameVideo) {
    log(`收到 B 站懒人同步：${title}`);
    if (loadUrlButton) {
      loadUrlButton.click();
    } else {
      executeLoadVideo(url, title, true, cid);
    }
  }
  broadcastVideoWhenReady({ url, title, cid });
}

if (connectButton) {
  connectButton.addEventListener("click", connect);
}

roomInput.addEventListener("input", () => {
  updateInviteLink();
});

if (inviteBtn) {
  inviteBtn.addEventListener("click", async () => {
    const link = buildInviteLink();
    try {
      await navigator.clipboard.writeText(link);
      log("已复制邀请链接");
    } catch {
      log("复制邀请链接失败，请手动复制链接");
    }
  });
}

if (chatForm) {
  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    if (sendChatMessage(text)) chatInput.value = "";
  });
}

if (loadUrlButton) {
  loadUrlButton.addEventListener("click", () => {
    const url = networkUrlInput.value.trim();
    const cid = normalizeCid(networkUrlInput.dataset.cid);
    const title = networkUrlInput.dataset.title || normalizeVideoTitle(url);
    delete networkUrlInput.dataset.cid;
    delete networkUrlInput.dataset.title;

    if (!url) {
      log("请先粘贴网络视频链接");
      return;
    }

    if (isBilibiliLink(url)) {
      if (!joined) {
        log("请先加入房间，再加载 B 站视频。");
        return;
      }
      send({ type: "resolve_bilibili", url });
      log("正在后台解析 B 站直链... 请稍候。");
      return;
    }

    if (!joined) {
      executeLoadVideo(url, title, false, cid);
      return;
    }

    send({ type: "load_video_request", url, title, cid });
  });
}

if (chooseLocalButton) {
  chooseLocalButton.addEventListener("click", openLocalFilePicker);
}

if (fileInput) {
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;
    video.load();
    emptyState.classList.add("hidden");
    resetDanmaku();
    if (videoTitleEl) videoTitleEl.textContent = file.name;
    log(`已选择 ${file.name}`);
  });
}

video.addEventListener("loadedmetadata", () => {
  updateTimeReadout();
  updateProgressBar();
  keepPlaybackControlsVisible();
  announceFile();
  if (lastRemoteState) {
    applyRemoteState(lastRemoteState.state, lastRemoteState.serverTime, "file-loaded");
  }
  tryAutoPlayLoadedVideo();
});

video.addEventListener("play", () => {
  updatePlayIcon();
  showPlaybackControls();
  if (!isRemoteAction) sendControl("play");
});

video.addEventListener("pause", () => {
  updatePlayIcon();
  keepPlaybackControlsVisible();
  if (!isRemoteAction) sendControl("pause");
});

video.addEventListener("ended", keepPlaybackControlsVisible);

video.addEventListener("seeked", () => {
  historyDanmakuIndex = findDanmakuStartIndex(video.currentTime || 0);
  lastDanmakuTime = video.currentTime || 0;
  if (remoteSeekTarget !== null) {
    const drift = Math.abs(video.currentTime - remoteSeekTarget);
    remoteSeekTarget = null;
    if (drift < 1.0) return;
  }
  if (isRemoteAction) return;
  const now = Date.now();
  if (now - lastSeekSentAt < 250) return;
  lastSeekSentAt = now;
  sendControl("seek");
});

video.addEventListener("ratechange", () => {
  if (!isRemoteAction) sendControl("rate");
});

video.addEventListener("timeupdate", () => {
  updateTimeReadout();
  updateProgressBar();
  flushHistoryDanmaku();
});

if (playPauseButton) {
  playPauseButton.addEventListener("click", async () => {
    if (!video.src) {
      log("请先选择本地电影或加载网络视频");
      return;
    }
    if (video.paused) {
      await video.play().catch(() => {
        log("浏览器暂时无法播放该视频，请检查格式或再点一次播放");
      });
    } else {
      video.pause();
    }
  });
}

if (syncNowButton) {
  syncNowButton.addEventListener("click", () => {
    if (lastRemoteState) {
      applyRemoteState(lastRemoteState.state, lastRemoteState.serverTime, "manual");
    } else if (!send({ type: "request-state" })) {
      log("请先连接房间，再进行对齐");
    }
  });
}

if (danmakuToggleButton) {
  danmakuToggleButton.addEventListener("click", toggleDanmaku);
}

if (muteButton) {
  muteButton.addEventListener("click", toggleMute);
}

if (volumeSlider) {
  volumeSlider.addEventListener("input", setVolumeFromSlider);
}

if (fullscreenBtn) {
  fullscreenBtn.addEventListener("click", async () => {
    try {
      await toggleFullscreen();
    } catch (err) {
      log(`无法进入全屏: ${err.message || "浏览器拒绝了全屏请求"}`);
    }
  });
}

if (callButton) {
  callButton.addEventListener("click", () => {
    if (peerConnection || localCallStream || callActive) {
      endRtcCall(true);
    } else {
      startRtcCall();
    }
  });
}

if (micToggleButton) {
  micToggleButton.addEventListener("click", toggleMicTrack);
}

if (cameraToggleButton) {
  cameraToggleButton.addEventListener("click", toggleCameraTrack);
}

if (progressContainer) {
  progressContainer.addEventListener("click", seekFromPointer);
}

video.addEventListener("volumechange", () => {
  if (!suppressVolumeStorage) {
    localStorage.setItem("sync-volume", String(video.volume));
    localStorage.setItem("sync-muted", String(video.muted));
  }
  updateVolumeControls();
});

document.addEventListener("fullscreenchange", updateFullscreenButton);
document.addEventListener("webkitfullscreenchange", updateFullscreenButton);
document.addEventListener("mozfullscreenchange", updateFullscreenButton);
document.addEventListener("MSFullscreenChange", updateFullscreenButton);

window.addEventListener("beforeunload", () => {
  endRtcCall(false);
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});

window.addEventListener("message", (event) => {
  if (event.origin !== location.origin && !/^https:\/\/([a-z0-9-]+\.)?bilibili\.com$/i.test(event.origin)) return;
  if (event.data?.type === "auto_load_url") loadBookmarkedVideo(event.data);
});

window.addEventListener("keydown", (event) => {
  const target = event.target;
  const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
  if (isTyping || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key.toLowerCase() === "d") {
    event.preventDefault();
    toggleDanmaku();
  } else if (event.key.toLowerCase() === "c" && fullscreenElement()) {
    event.preventDefault();
    toggleFullscreenChatPanel();
  }
});

setInterval(() => {
  send({ type: "request-state" });
  pruneLogs();
  flushHistoryDanmaku();
}, 15000);

setStatus("未连接", false);
updateDanmakuToggle();
updateVolumeControls();
updateFullscreenButton();
updateCallControls();
updatePlayIcon();
updateTimeReadout();
initControlsAutohide();

if (AUTO_CONNECT) {
  setTimeout(connect, 0);
}
