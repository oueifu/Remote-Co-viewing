// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Q Credit
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
const inviteCopyLabel = inviteBtn?.querySelector(".invite-copy") || null;
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
const langSwitch = $("#lang-switch");
const helpBtn = $("#help-btn");
const guideModal = $("#guide-modal");
const guideCloseBtn = $("#guide-close-btn");
const sponsorBtn = $("#sponsor-btn");
const devtoolsBtn = $("#devtools-btn");
const sponsorModal = $("#sponsor-modal");
const sponsorCloseBtn = $("#sponsor-close-btn");
const desktopBridge = window.syncCinemaDesktop || null;
const isDesktopApp = Boolean(desktopBridge?.isDesktop);
const localVideoCard = chooseLocalButton?.closest(".glass-card") || null;

let controlledMpvButton = null;
let externalMpvButton = null;
let restoreWindowButton = null;
let mpvModeHintEl = null;
let controlledMpvUiTimer = null;
let isSwitchingToMpv = false;

let socket = null;
let clientId = null;
let cachedPublicUrl = "";
let room = "";
let displayName = "";
let isHost = false;
let joinPending = false;
let suppressAutoReconnect = false;
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
let forceResetPlaybackOnLoad = false;
let pendingBilibiliResolve = false;
let pendingBilibiliResolveTimer = null;
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
let rtcStatsTimer = null;
let rtcVideoQualityLevel = 1;
let rtcWeakNetworkScore = 0;
let currentLang = localStorage.getItem("sync-lang") || "zh";
let currentLocalVideoPath = "";
let currentLocalVideoName = "";
let mpvFallbackAttemptedForCurrentSource = false;
let localCodecHintShownForCurrentSource = false;
let missingMpvWarningShown = false;
let suppressNextHtml5PauseSync = false;
let currentLocalVideoMeta = null;
let suppressRemoteEcho = false;
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
const CALL_VIDEO_CONSTRAINTS = {
  width: { ideal: 640, max: 960 },
  height: { ideal: 360, max: 540 },
  frameRate: { ideal: 15, max: 15 },
  facingMode: "user"
};
const DEFAULT_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.xten.com:3478" },
  { urls: "turn:your-turn.example.com:3478", username: "turn-user", credential: "turn-password" },
  { urls: "turns:your-turn.example.com:5349", username: "turn-user", credential: "turn-password" }
];
const RTC_CONFIG = {
  iceServers: DEFAULT_ICE_SERVERS
};
const RTC_QUALITY_PROFILES = [
  { name: "low", maxBitrate: 150_000, scaleResolutionDownBy: 3 },
  { name: "medium", maxBitrate: 320_000, scaleResolutionDownBy: 1.5 },
  { name: "high", maxBitrate: 700_000, scaleResolutionDownBy: 1 }
];
const RTC_STATS_INTERVAL_MS = 4000;
// Removed hardcoded DEFAULT_PUBLIC_WEB_URL and DEFAULT_REMOTE_WS_URL
const UNSUPPORTED_LOCAL_MEDIA_HINT = "该片源可能不�?Electron 内置播放器完整支持。如需播放，请使用 mpv 模式。当前普�?mpv 模式暂不参与同步�?;
const COMPLEX_LOCAL_MEDIA_PATTERN = /(?:\.mkv$|h\.?265|hevc|ddp|e-?ac3|atmos|dts|ac3)/i;

class Html5VideoAdapter {
  constructor(videoElement) {
    this.video = videoElement;
  }

  play() {
    return this.video.play();
  }

  pause() {
    this.video.pause();
  }

  seekTo(seconds) {
    this.video.currentTime = seconds;
  }

  getCurrentTime() {
    return this.video.currentTime || 0;
  }

  getDuration() {
    return this.video.duration;
  }

  isPaused() {
    return this.video.paused;
  }

  on(eventName, handler) {
    this.video.addEventListener(eventName, handler);
    return () => this.video.removeEventListener(eventName, handler);
  }
}

class MpvAdapter {
  constructor(bridge) {
    this.bridge = bridge;
    this.handlers = new Map();
    this.currentTime = 0;
    this.duration = 0;
    this.paused = true;
    this.pollTimer = null;
    this.pollInFlight = false;
    this.sourcePath = "";
    this.onStopped = null;
    this.lastDurationPollAt = 0;
    this.lastPausePollAt = 0;
    this.seekCooldownUntil = 0; // suppress polling misdetection after local seek
  }

  async open(filePath) {
    this.sourcePath = String(filePath || "").trim();
    log("[mpv-adapter] opening controlled mpv");
    const result = await this.bridge.openInControlledMpv(this.sourcePath);
    if (!result?.ok) return result;
    if (typeof result.timePos === "number") this.currentTime = Number(result.timePos) || 0;
    if (typeof result.duration === "number") this.duration = Number(result.duration) || 0;
    if (typeof result.paused === "boolean") this.paused = result.paused;
    await this.refreshState();
    this.emit("loadedmetadata");
    this.emit("timeupdate");
    this.startPolling();
    return result;
  }

  async sendCommand(command, value) {
    try {
      const result = await this.bridge.controlledMpvCommand(command, value);
      if (!result?.ok) {
        throw new Error(result?.message || `受控 mpv 命令失败�?{command}`);
      }
      return result.data;
    } catch (error) {
      log(`[mpv-adapter] command failed ${command}: ${error.message || "unknown error"}`);
      throw error;
    }
  }

  async refreshState(forceAll = false) {
    if (!this.sourcePath || this.pollInFlight) return;
    this.pollInFlight = true;
    try {
      const now = Date.now();
      const tasks = [
        this.sendCommand("getTimePos").then((value) => {
          if (Number.isFinite(Number(value))) this.currentTime = Number(value);
        })
      ];

      if (forceAll || now - this.lastDurationPollAt >= 2000) {
        tasks.push(this.sendCommand("getDuration").then((value) => {
          if (Number.isFinite(Number(value))) this.duration = Number(value);
          this.lastDurationPollAt = now;
        }));
      }

      if (forceAll || now - this.lastPausePollAt >= 1000) {
        tasks.push(this.sendCommand("getPauseState").then((value) => {
          this.paused = Boolean(value);
          this.lastPausePollAt = now;
        }));
      }

      await Promise.all(tasks);
      log(`[mpv-adapter] mpv state time=${this.currentTime} duration=${this.duration} paused=${this.paused}`);
    } catch (error) {
      this.handlePollingFailure(error);
      throw error;
    } finally {
      this.pollInFlight = false;
    }
  }

  startPolling() {
    this.stopPolling();
    this.lastDurationPollAt = 0;
    this.lastPausePollAt = 0;
    log("[mpv-adapter] polling started");
    this.pollTimer = setInterval(async () => {
      const previousTime = this.currentTime;
      await this.refreshState().catch(() => {});
      if (Math.abs(this.currentTime - previousTime) > 0.05) {
        this.emit("timeupdate");
      }
    }, 500);
  }

  stopPolling() {
    if (!this.pollTimer) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
    log("[mpv-adapter] polling stopped");
  }

  async stop() {
    this.stopPolling();
    this.sourcePath = "";
    this.currentTime = 0;
    this.duration = 0;
    this.paused = true;
    return this.bridge.stopControlledMpv();
  }

  handlePollingFailure(error) {
    const message = String(error?.message || "");
    if (!/尚未启动|mpv IPC pipe is not connected|mpv exited|mpv controller stopped|timed out/i.test(message)) {
      return;
    }
    this.stopPolling();
    if (typeof this.onStopped === "function") {
      void this.onStopped(error);
    }
  }

  play() {
    return this.sendCommand("play").then(() => {
      this.paused = false;
      this.emit("play");
      this.emit("timeupdate");
    });
  }

  pause() {
    void this.sendCommand("pause").then(() => {
      this.paused = true;
      this.emit("pause");
      this.emit("timeupdate");
    }).catch(() => {});
  }

  seekTo(seconds) {
    const target = Math.max(0, Number(seconds) || 0);
    this.currentTime = target;
    this.seekCooldownUntil = Date.now() + 1500; // suppress polling misdetection for 1.5s
    void this.sendCommand("seekTo", target).then(() => {
      this.currentTime = target;
      this.emit("seeked");
      this.emit("timeupdate");
    }).catch(() => {});
  }

  getCurrentTime() {
    return this.currentTime || 0;
  }

  getDuration() {
    return this.duration || 0;
  }

  isPaused() {
    return this.paused;
  }

  on(eventName, handler) {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, new Set());
    }
    const handlers = this.handlers.get(eventName);
    handlers.add(handler);
    return () => handlers.delete(handler);
  }

  emit(eventName, payload) {
    const handlers = this.handlers.get(eventName);
    if (!handlers) return;
    for (const handler of handlers) {
      handler(payload);
    }
  }
}

const html5Player = new Html5VideoAdapter(video);
const mpvPlayer = isDesktopApp ? new MpvAdapter(desktopBridge) : null;
let activePlayer = html5Player;
if (mpvPlayer) {
  mpvPlayer.onStopped = async () => {
    await handleControlledMpvStopped("受控 mpv 已关�?, false);
  };
}

const translations = {
  zh: {
    video_placeholder: "选择本地电影或粘贴网络视�?,
    sync_waiting: "等待加入房间...",
    play: "�?播放",
    pause: "❚❚ 暂停",
    fullscreen: "�?全屏",
    fullscreen_exit: "退出全�?,
    sync_now: "对齐",
    status_offline: "�?未连�?,
    call: "📞 连麦",
    hangup: "挂断",
    room_settings: "房间与配�?,
    connect: "连接",
    copy: "复制",
    network_video: "网络视频",
    load: "加载",
    network_hint: "支持直链�?B 站分享链接自动解析最高画质�?,
    local_video: "本地电影",
    choose_local: "📁 选择本地电影文件",
    use_controlled_mpv: "使用受控 mpv 同步模式（第一版）",
    use_external_mpv: "普�?mpv 外部播放（暂不同步）",
    controlled_mpv_hint: "复杂本地片源推荐使用「受�?mpv 同步模式（第一版）」以支持多人同步播放�?,
    room_members: "房间成员",
    no_members: "暂无成员",
    chatroom: "聊天�?,
    send: "发�?,
    connection_log: "连接记录",
    help: "�?,
    sponsor: "�?,
    guide_title: "使用说明",
    guide_step_1: "1. 第一个进入房间的人会成为管理员，之后的加入需要管理员同意�?,
    guide_step_2: "2. 首次打开会自动生成随机房间号；只有通过分享链接或手动输入相同房间号，才会进入同一个房间�?,
    guide_step_3: "3. 粘贴视频地址并点击加载，或双方各自选择同一个本地文件；当前每个房间最�?2 人，并支持聊天、同步播放和连麦�?,
    guide_close: "我知道了",
    sponsor_title: "支持开发�?�?,
    sponsor_desc: "如果这个小插件让你和朋友度过了愉快的时光，欢迎请我喝杯咖啡！你的支持将用于维持服务器的运转�?,
    close: "关闭"
  },
  en: {
    video_placeholder: "Choose a local video or paste a video URL",
    sync_waiting: "Waiting to join room...",
    play: "�?Play",
    pause: "❚❚ Pause",
    fullscreen: "�?Fullscreen",
    fullscreen_exit: "Exit Fullscreen",
    sync_now: "Sync",
    status_offline: "�?Offline",
    call: "📞 Call",
    hangup: "Hang Up",
    room_settings: "Room & Settings",
    connect: "Connect",
    copy: "Copy",
    network_video: "Online Video",
    load: "Load",
    network_hint: "Supports direct links and Bilibili share links with automatic best-quality parsing.",
    local_video: "Local Video",
    choose_local: "📁 Choose Local Video",
    use_controlled_mpv: "Use Controlled mpv (Experimental)",
    use_external_mpv: "Open in mpv (No Sync)",
    controlled_mpv_hint: "For complex local files, you can switch to controlled mpv manually. This experimental mode is local-only for now.",
    room_members: "Room Members",
    no_members: "No members",
    chatroom: "Chat",
    send: "Send",
    connection_log: "Connection Log",
    help: "�?,
    sponsor: "�?,
    guide_title: "Quick Guide",
    guide_step_1: "1. The first person in a room becomes the admin, and later joins must be approved by the admin.",
    guide_step_2: "2. On first open, a random room ID is generated automatically; only a shared link or the same room ID will bring people into the same room.",
    guide_step_3: "3. Paste a video URL and click Load, or both choose the same local file. Each room currently supports up to 2 people with chat, synced playback, and calls.",
    guide_close: "Got it",
    sponsor_title: "Support the Developer �?,
    sponsor_desc: "If this small app helped you and your friend enjoy a good time, feel free to buy me a coffee. Your support helps keep the server running.",
    close: "Close"
  },
  ja: {
    video_placeholder: "ローカル動画を選択するか、動画リンクを貼り付けてください",
    sync_waiting: "ルーム参加待機中...",
    play: "�?再生",
    pause: "❚❚ 一時停�?,
    fullscreen: "�?全画�?,
    fullscreen_exit: "全画面を終了",
    sync_now: "同期",
    status_offline: "�?未接�?,
    call: "📞 通話",
    hangup: "通話終了",
    room_settings: "ルームと設定",
    connect: "接続",
    copy: "コピ�?,
    network_video: "ネット動�?,
    load: "読み込み",
    network_hint: "直リンクまた�?Bilibili 共有リンクの高画質自動解析に対応しています�?,
    local_video: "ローカル動画",
    choose_local: "📁 ローカル動画を選�?,
    use_controlled_mpv: "制御付き mpv 同期モードを使う（第一版）",
    use_external_mpv: "通常�?mpv 外部再生（同期なし）",
    controlled_mpv_hint: "複雑なローカル動画は、多人同期再生に対応した「制御付�?mpv 同期モード（第一版）」の利用を推奨します�?,
    room_members: "ルームメンバ�?,
    no_members: "メンバーなし",
    chatroom: "チャット",
    send: "送信",
    connection_log: "接続ログ",
    help: "�?,
    sponsor: "�?,
    guide_title: "使い�?,
    guide_step_1: "1. 最初に入室した人が管理者になり、その後の参加は管理者の承認が必要です�?,
    guide_step_2: "2. 初回表示時にはランダムなルーム番号が自動生成されます。共有リンクを開くか、同じルーム番号を入力した場合だけ同じ部屋に入れます�?,
    guide_step_3: "3. 動画リンクを貼り付けて読み込むか、双方で同じローカルファイルを選びます。各ルームは最�?2 人までで、チャット、同期再生、通話に対応しています�?,
    guide_close: "わかりました",
    sponsor_title: "開発者を応援 �?,
    sponsor_desc: "この小さなアプリで楽しい時間を過ごせたなら、コーヒーをごちそうしてもらえるとうれしいです。ご支援はサーバー維持に使われます�?,
    close: "閉じ�?
  }
};

const URL_PARAMS = new URLSearchParams(location.search);
const PRESET_ROOM = URL_PARAMS.get("room")?.trim();
const PRESET_NAME = URL_PARAMS.get("name")?.trim();
const PRESET_SERVER = URL_PARAMS.get("server")?.trim();
const PRESET_ICE = URL_PARAMS.get("ice")?.trim();
const AUTO_JOIN_ROOM = PRESET_ROOM || "";
const AUTO_CONNECT = Boolean(PRESET_SERVER || (AUTO_JOIN_ROOM && URL_PARAMS.get("autoconnect") === "1"));
const SAVED_ICE_VALUE = localStorage.getItem("sync-ice-servers");
const SAVED_VOLUME_VALUE = localStorage.getItem("sync-volume");
const SAVED_VOLUME = SAVED_VOLUME_VALUE === null ? NaN : Number(SAVED_VOLUME_VALUE);
const SAVED_MUTED = localStorage.getItem("sync-muted") === "true";
let danmakuVisible = localStorage.getItem("sync-danmaku-visible") !== "false";
let shareUrlCleanupPending = Boolean(AUTO_JOIN_ROOM && URL_PARAMS.get("autoconnect") === "1");

const DEFAULT_ROOM = AUTO_JOIN_ROOM || localStorage.getItem("sync-room") || generateRoomId();
const DEFAULT_NAME = PRESET_NAME || localStorage.getItem("sync-name") || `用户${Math.floor(Math.random() * 900 + 100)}`;

roomInput.value = DEFAULT_ROOM;
nameInput.value = DEFAULT_NAME;
serverUrlInput.value = PRESET_SERVER || buildDefaultWsUrl();
video.volume = Number.isFinite(SAVED_VOLUME) && SAVED_VOLUME > 0
  ? Math.min(1, Math.max(0, SAVED_VOLUME))
  : DEFAULT_VOLUME;
video.muted = SAVED_MUTED;
updateInviteLink();
updateLanguage(currentLang);

function t(key, fallback = "") {
  return translations[currentLang]?.[key] || translations.zh?.[key] || fallback;
}

function updateLanguage(lang) {
  currentLang = translations[lang] ? lang : "zh";
  localStorage.setItem("sync-lang", currentLang);
  document.documentElement.lang = currentLang === "zh" ? "zh-CN" : currentLang;
  if (langSwitch) langSwitch.value = currentLang;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    const text = t(key, element.textContent || "");
    element.textContent = text;
  });
  updatePlayIcon();
  updateFullscreenButton();
  updateCallControls();
  updateMpvModeUiLabels();
}

function isUsingControlledMpv() {
  return activePlayer === mpvPlayer;
}

function setActivePlayer(nextPlayer) {
  activePlayer = nextPlayer || html5Player;
  updatePlayIcon();
  updateTimeReadout();
  updateProgressBar();
}

// Show/hide the video-placeholder with an mpv-controller message.
// When show=true: overlay placeholder to explain the black video area.
// When show=false: restore normal placeholder visibility rules.
function showMpvWindowPlaceholder(show) {
  if (!emptyState) return;
  if (show) {
    // Find or create the subtitle element inside placeholder-card
    let subtitleEl = emptyState.querySelector(".mpv-controller-hint");
    if (!subtitleEl) {
      subtitleEl = document.createElement("div");
      subtitleEl.className = "mpv-controller-hint";
      subtitleEl.style.cssText = "margin-top:10px;font-size:13px;color:#9ca3af;line-height:1.6;";
      const card = emptyState.querySelector(".placeholder-card");
      if (card) card.appendChild(subtitleEl);
    }
    subtitleEl.textContent = "外部 mpv 窗口同步中。请通过本页面控制播�?/ 暂停 / 进度。直接在 mpv 窗口操作第一版不保证同步�?;
    emptyState.classList.remove("hidden");
  } else {
    const subtitleEl = emptyState.querySelector(".mpv-controller-hint");
    if (subtitleEl) subtitleEl.textContent = "";
    // Only hide placeholder if a real video source is loaded
    if (video.src || video.currentSrc) {
      emptyState.classList.add("hidden");
    }
  }
}

async function handleControlledMpvStopped(reason = "受控 mpv 已关�?, stopProcess = false) {
  const wasUsingMpv = isUsingControlledMpv();
  stopControlledMpvUiRefresh();
  if (mpvPlayer) {
    mpvPlayer.stopPolling();
    if (stopProcess) {
      await mpvPlayer.stop().catch(() => {});
    } else {
      mpvPlayer.sourcePath = "";
      mpvPlayer.currentTime = 0;
      mpvPlayer.duration = 0;
      mpvPlayer.paused = true;
    }
  }
  if (currentLocalVideoMeta) {
    currentLocalVideoMeta.playerMode = "html5";
  }
  setActivePlayer(html5Player);
  if (wasUsingMpv) {
    showMpvWindowPlaceholder(false);
    document.body.classList.remove("mpv-controller-mode");
    if (desktopBridge?.setControllerMode) {
      void desktopBridge.setControllerMode(false).catch(() => {});
    }
    updateMpvModeUi();
    log("[mpv-adapter] external player sync mode stopped, fallback to html5");
    if (reason) log(reason);
    announceFile();
  }
}

let lastMpvPaused = true;
let lastMpvTime = 0;

function startControlledMpvUiRefresh() {
  stopControlledMpvUiRefresh();
  if (mpvPlayer) {
    lastMpvPaused = mpvPlayer.isPaused();
    lastMpvTime = mpvPlayer.getCurrentTime();
  }
  controlledMpvUiTimer = setInterval(() => {
    if (!isUsingControlledMpv()) return;
    updatePlayIcon();
    updateTimeReadout();
    updateProgressBar();

    if (mpvPlayer && !isRemoteAction && !suppressRemoteEcho) {
      const currentPaused = mpvPlayer.isPaused();
      const currentTime = mpvPlayer.getCurrentTime();

      // v1: do NOT broadcast play/pause or seeks detected from mpv window.
      // Only page-initiated controls are synced (via play/pause buttons and seekFromPointer).
      // mpv window keyboard shortcuts (Space, arrow keys) are intentionally not synced in v1.
      lastMpvPaused = currentPaused;
      lastMpvTime = currentTime;
    } else if (mpvPlayer) {
      lastMpvPaused = mpvPlayer.isPaused();
      lastMpvTime = mpvPlayer.getCurrentTime();
    }
  }, 500);
}

function stopControlledMpvUiRefresh() {
  if (!controlledMpvUiTimer) return;
  clearInterval(controlledMpvUiTimer);
  controlledMpvUiTimer = null;
}

async function switchBackToHtml5Player(stopControlledMpv = false) {
  if (!isUsingControlledMpv()) return;
  await handleControlledMpvStopped(stopControlledMpv ? "受控 mpv 已关�? : "", stopControlledMpv);
}

async function switchToControlledMpv() {
  if (isSwitchingToMpv) return { ok: false, message: "正在启动外部播放器，请稍�?.." };
  if (!isDesktopApp || !mpvPlayer || !currentLocalVideoPath) {
    return { ok: false, message: "缺少本地视频路径，无法启动外部播放器同步模式�? };
  }

  isSwitchingToMpv = true;
  try {
    // Always pause and clear HTML5 video before handing off to mpv
    suppressNextHtml5PauseSync = true;
    video.pause();
    video.removeAttribute("src");
    video.load();

    const result = await mpvPlayer.open(currentLocalVideoPath);
    if (!result?.ok) return result;

    if (currentLocalVideoMeta) {
      currentLocalVideoMeta.playerMode = "controlled-mpv";
      currentLocalVideoMeta.duration = mpvPlayer.getDuration() || null;
    }
    setActivePlayer(mpvPlayer);
    startControlledMpvUiRefresh();

    // Show placeholder and switch to controller layout
    showMpvWindowPlaceholder(true);
    document.body.classList.add("mpv-controller-mode");
    if (desktopBridge?.setControllerMode) {
      void desktopBridge.setControllerMode(true).catch(() => {});
    }
    // Update restore-window button visibility
    updateMpvModeUi();

    log("[mpv-adapter] switched activePlayer to mpv (external player sync mode)");
    log("外部播放器同步模式已启动。外�?mpv 窗口正在播放，请通过本页面控制播放。直接在 mpv 窗口中操作（如按空格键），第一版可能不会同步�?);
    announceFile();
    return result;
  } finally {
    isSwitchingToMpv = false;
  }
}

function ensureMpvModeUi() {
  if (!localVideoCard || controlledMpvButton) return;
  const actions = document.createElement("div");
  actions.style.display = "grid";
  actions.style.gap = "8px";
  actions.style.marginTop = "10px";

  controlledMpvButton = document.createElement("button");
  controlledMpvButton.type = "button";
  controlledMpvButton.className = "btn wide-btn btn-primary";
  controlledMpvButton.style.display = "none";
  controlledMpvButton.addEventListener("click", async () => {
    const result = await switchToControlledMpv();
    if (result?.ok) return;
    const message = result?.message || "外部播放器同步模式启动失败，请检�?mpv 配置�?;
    log(message);
    window.alert(message);
  });

  externalMpvButton = document.createElement("button");
  externalMpvButton.type = "button";
  externalMpvButton.className = "btn wide-btn";
  externalMpvButton.style.display = "none";
  externalMpvButton.addEventListener("click", () => {
    void launchLocalVideoInMpv("手动点击普�?mpv 外部播放入口");
  });

  // "恢复大窗�? button: visible only while in external player sync mode
  restoreWindowButton = document.createElement("button");
  restoreWindowButton.type = "button";
  restoreWindowButton.className = "btn wide-btn";
  restoreWindowButton.style.display = "none";
  restoreWindowButton.textContent = "�?恢复大窗�?/ 退出外部播放器模式";
  restoreWindowButton.addEventListener("click", () => {
    void handleControlledMpvStopped("用户手动退出外部播放器同步模式", true);
  });

  mpvModeHintEl = document.createElement("div");
  mpvModeHintEl.className = "hint";
  mpvModeHintEl.style.display = "none";
  mpvModeHintEl.style.marginTop = "2px";

  actions.append(controlledMpvButton, externalMpvButton, restoreWindowButton, mpvModeHintEl);
  localVideoCard.append(actions);
  updateMpvModeUiLabels();
}

function updateMpvModeUiLabels() {
  if (controlledMpvButton) controlledMpvButton.textContent = "🎬 外部播放器同步模�?;
  if (externalMpvButton) externalMpvButton.textContent = t("use_external_mpv", "普�?mpv 外部播放（不同步�?);
  if (mpvModeHintEl) mpvModeHintEl.textContent = "高码率本地视频将使用外部 mpv 播放。当前页面作为同步控制器，负责播放、暂停和进度同步�?;
}

function updateMpvModeUi() {
  ensureMpvModeUi();
  const usingMpv = isUsingControlledMpv();
  const shouldShow = isDesktopApp && isComplexLocalMediaSource();
  // Main "enter" button: show when complex source selected but not yet in mpv mode
  if (controlledMpvButton) controlledMpvButton.style.display = (shouldShow && !usingMpv) ? "" : "none";
  if (externalMpvButton) externalMpvButton.style.display = (shouldShow && !usingMpv) ? "" : "none";
  if (mpvModeHintEl) mpvModeHintEl.style.display = (shouldShow && !usingMpv) ? "block" : "none";
  // Restore button: show only while actively in mpv controller mode
  if (restoreWindowButton) restoreWindowButton.style.display = usingMpv ? "" : "none";
}

function buildDefaultWsUrl() {
  const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${location.host || "127.0.0.1:5050"}/ws`;
}

function buildDefaultPublicWebUrl() {
  return location.origin && location.origin !== "null" ? location.origin : "http://127.0.0.1:5050";
}

function showGuideModal() {
  if (guideModal) guideModal.style.display = "block";
}

function hideGuideModal() {
  if (guideModal) guideModal.style.display = "none";
}

function showSponsorModal() {
  if (sponsorModal) sponsorModal.style.display = "block";
}

function hideSponsorModal() {
  if (sponsorModal) sponsorModal.style.display = "none";
}

function generateRoomId() {
  return `room-${Math.random().toString(36).slice(2, 8)}`;
}

function showCallFailureAlert(error, fallbackMessage = "连麦失败，请检查麦克风权限和网络连接�?) {
  const detail = error?.message || fallbackMessage;
  if (error?.name === "NotFoundError") {
    window.alert("连麦失败：未检测到麦克风，请检查设备连接！");
    return;
  }
  if (error?.name === "NotAllowedError") {
    window.alert("连麦失败：麦克风权限被拒绝，请点击地址栏左侧图标允许授权�?);
    return;
  }
  window.alert(`连麦失败�?{detail}`);
}

function buildHostStorageKey(roomId) {
  return `sync-host-token:${String(roomId || "").trim().toLowerCase() || "movie-room"}`;
}

function getOrCreateHostToken(roomId) {
  const key = buildHostStorageKey(roomId);
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const generated = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `host-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(key, generated);
  return generated;
}

function parseIceServersValue(value) {
  if (!value) return [];
  const text = String(value).trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => {
          if (typeof entry === "string") return { urls: entry };
          if (entry && (typeof entry.urls === "string" || Array.isArray(entry.urls))) {
            return entry;
          }
          return null;
        })
        .filter(Boolean);
    }
  } catch {
    // Fall back to comma-separated STUN/TURN URLs.
  }

  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((urls) => ({ urls }));
}

function buildRtcConfig() {
  const configuredIceServers = parseIceServersValue(PRESET_ICE || SAVED_ICE_VALUE);
  if (configuredIceServers.length > 0) {
    return { iceServers: configuredIceServers };
  }
  return RTC_CONFIG;
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

function setStatus(text, online, detailText = "") {
  if (!statusIndicator) return;
  statusIndicator.textContent = text;
  statusIndicator.style.color = online ? "#10b981" : "#ef4444";
  if (syncStatusBadge) {
    syncStatusBadge.textContent = detailText || (online ? "房间已连接，等待同步观影" : "等待加入房间...");
    syncStatusBadge.classList.toggle("is-online", online);
  }
}

function updateDanmakuToggle() {
  if (danmakuStage) danmakuStage.classList.toggle("hidden-danmaku", !danmakuVisible);
  if (danmakuToggleButton) {
    danmakuToggleButton.classList.toggle("is-off", !danmakuVisible);
    danmakuToggleButton.textContent = danmakuVisible ? "👁" : "�?;
    danmakuToggleButton.title = danmakuVisible ? "隐藏弹幕（D�? : "显示弹幕（D�?;
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
  const currentRoom = roomId || roomInput.value.trim() || "movie-room";
  const base = buildDefaultPublicWebUrl().replace(/\/$/, "");
  const currentServer = serverUrlInput?.value.trim() || "";
  
  const isLocalhost = /^(127\.0\.0\.1|localhost|0\.0\.0\.0|::1)$/.test(location.hostname);
  const isLan = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(location.hostname);
  
  let link = `${base}/?room=${encodeURIComponent(currentRoom)}&autoconnect=1`;
  
  if (currentServer && !currentServer.includes("127.0.0.1") && !currentServer.includes("localhost")) {
    link += `&server=${encodeURIComponent(currentServer)}`;
  }

  if (isLocalhost) {
    return `[该本地地址 ${location.hostname} 无法分享给异地朋友，请使用公网域名或局域网IP] ${link}`;
  }
  if (isLan) {
    return `[仅限同局域网内可用] ${link}`;
  }
  return link;
}

function updateInviteLink() {
  if (!inviteText) return;
  inviteText.textContent = buildInviteLink(roomInput?.value.trim() || "movie-room");
}

function isBilibiliLink(url) {
  return /(?:bilibili\.com|b23\.tv)/i.test(String(url));
}

function normalizeVideoTitle(url) {
  if (!url) return "网络视频�?;
  try {
    const parsed = new URL(url);
    return parsed.pathname.split("/").filter(Boolean).pop() || "网络视频�?;
  } catch {
    return "网络视频�?;
  }
}

function normalizeCid(cid) {
  const value = String(cid || "").trim();
  return /^\d{1,20}$/.test(value) ? value : "";
}

function buildVideoSignature(url, cid = "") {
  return `${normalizeCid(cid) || "no-cid"}|${String(url || "").trim()}`;
}

function shouldResetPlaybackForMedia(url, cid = "", resetPlayback = false) {
  const nextSignature = buildVideoSignature(url, cid);
  return Boolean(resetPlayback || (currentVideoSignature && nextSignature !== currentVideoSignature));
}

function hasActiveVideoSource() {
  return Boolean(video.src || currentVideoSignature);
}

function restoreSharedMediaIfNeeded(media, reason = "") {
  const url = String(media?.url || "").trim();
  if (!url || hasActiveVideoSource()) return false;
  const title = String(media?.title || "网络视频�?).trim() || "网络视频�?;
  const cid = normalizeCid(media?.cid);
  const loaded = executeLoadVideo(url, title, true, cid);
  if (loaded) log(`已恢复房间视频源${reason ? `�?{reason}` : ""}`);
  return loaded;
}

function getMediaErrorCode(name, fallback) {
  return typeof MediaError !== "undefined" ? MediaError[name] : fallback;
}

function friendlyMediaErrorMessage() {
  switch (video.error?.code) {
    case getMediaErrorCode("MEDIA_ERR_ABORTED", 1):
      return "视频加载已中止，请重新点击播放�?;
    case getMediaErrorCode("MEDIA_ERR_NETWORK", 2):
      return "视频加载失败，请检查网络连接后重试�?;
    case getMediaErrorCode("MEDIA_ERR_DECODE", 3):
      return "视频解码失败，建议换电脑播放、改�?mpv，或更换普�?MP4 链接�?;
    case getMediaErrorCode("MEDIA_ERR_SRC_NOT_SUPPORTED", 4):
      return "当前浏览器不支持该视频格式，建议换电脑播放、改�?mpv，或更换普�?MP4 链接�?;
    default:
      return "视频播放失败，请稍后重试�?;
  }
}

function localFileCodecHint() {
  if (isDesktopApp) {
    return UNSUPPORTED_LOCAL_MEDIA_HINT;
  }
  return "当前浏览器可能不支持该本地视频的音频/视频编码。请使用原生桌面客户端播放，以获得最佳解码支持。如果只是看 B�?网络视频，可忽略此提示�?;
}

function friendlyPlayErrorMessage(error) {
  if (error?.name === "NotAllowedError") {
    return "浏览器阻止了自动播放，请手动点一次播放�?;
  }
  if (video.error?.code === getMediaErrorCode("MEDIA_ERR_SRC_NOT_SUPPORTED", 4)) {
    return friendlyMediaErrorMessage();
  }
  return "浏览器暂时无法播放该视频，请检查格式，或改用电�?mpv/普�?MP4 链接�?;
}

function markLocalVideoSource(filePath = "", fileName = "") {
  currentLocalVideoPath = String(filePath || "").trim();
  currentLocalVideoName = String(fileName || "").trim();
  mpvFallbackAttemptedForCurrentSource = false;
  localCodecHintShownForCurrentSource = false;
  updateMpvModeUi();
}

function clearLocalVideoSource() {
  markLocalVideoSource("", "");
}

function isLocalDesktopVideoSource() {
  return Boolean(currentLocalVideoPath) && (video.currentSrc || video.src || "").startsWith("local-movie://");
}

function localMediaDescriptor(filePath = currentLocalVideoPath, fileName = currentLocalVideoName) {
  return `${fileName || ""} ${filePath || ""}`.trim();
}

function isComplexLocalMediaSource(filePath = currentLocalVideoPath, fileName = currentLocalVideoName) {
  return COMPLEX_LOCAL_MEDIA_PATTERN.test(localMediaDescriptor(filePath, fileName));
}

function showLocalMpvModeHint(reason = "") {
  if (!isDesktopApp || localCodecHintShownForCurrentSource) return;
  localCodecHintShownForCurrentSource = true;
  const detail = reason ? `${UNSUPPORTED_LOCAL_MEDIA_HINT}�?{reason}）` : UNSUPPORTED_LOCAL_MEDIA_HINT;
  log(detail);
  window.alert(UNSUPPORTED_LOCAL_MEDIA_HINT);
}

async function launchLocalVideoInMpv(reason = "") {
  if (!isDesktopApp || !currentLocalVideoPath || mpvFallbackAttemptedForCurrentSource) return false;
  mpvFallbackAttemptedForCurrentSource = true;
  const result = await desktopBridge.openInMpv(currentLocalVideoPath);
  if (result?.ok) {
    log(`已手动用 mpv 打开本地视频${reason ? `�?{reason}` : ""}。当�?mpv 外部播放暂不同步。`);
    window.alert(`已用 mpv 外部播放�?{currentLocalVideoName || currentLocalVideoPath}\n\n当前 mpv 外部播放暂不同步。`);
    return true;
  }
  const message = result?.message || "启动 mpv 失败，请确认 mpv 已安装并已加�?PATH�?;
  if (!missingMpvWarningShown || !/mpv/i.test(message)) {
    missingMpvWarningShown = true;
    log(`${message} 当前普�?mpv 模式暂不参与同步。`);
    window.alert(`${message}\n\n当前普�?mpv 模式暂不参与同步。`);
  }
  return false;
}

/*
 * Controlled mpv sync plan:
 * - Introduce PlayerAdapter with Html5VideoAdapter and MpvAdapter implementations.
 * - Keep renderer commands adapter-based; renderer calls main-process mpv IPC only through MpvAdapter.
 * - Main process owns MpvController: spawn mpv with --input-ipc-server, connect JSON IPC, observe pause/time-pos, and apply play/pause/seek.
 * - Suppress sync echo by marking remote-applied adapter changes so they are not rebroadcast as local user actions.
 * - Before entering mpv sync mode, verify both peers selected the same local file by at least filename and size, with hash as a later upgrade.
 */

async function loadDesktopLocalVideo() {
  if (!isDesktopApp) return false;
  const selected = await desktopBridge.chooseLocalVideo();
  if (!selected?.url || !selected?.path) return false;

  await switchBackToHtml5Player(true);

  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  markLocalVideoSource(selected.path, selected.name);
  currentLocalVideoMeta = {
    name: selected.name || "",
    size: selected.size || null,
    duration: null,
    playerMode: "html5"
  };
  emptyState.classList.add("hidden");
  resetDanmaku();
  currentVideoSignature = buildVideoSignature(selected.path);
  if (videoTitleEl) videoTitleEl.textContent = selected.name || "本地电影";
  log(`已选择 ${selected.name || selected.path}`);

  // 复杂片源（mkv/hevc/dts 等）跳过 HTML5 加载，直接引导到受控 mpv 同步模式
  if (isComplexLocalMediaSource(selected.path, selected.name)) {
    log("检测到复杂片源�?mkv / H.265 / HEVC / DTS 等），Electron 内置播放器可能无法解码。请点击「使用受�?mpv 同步模式（第一版）」按钮播放�?);
    updateMpvModeUi();
    return true;
  }

  log("桌面端本地文件不会自动共享给对方；如果出现有画面没声音，通常�?Chromium 不支持该音频编码。当前普�?mpv 模式暂不参与同步�?);
  video.src = selected.url;
  video.load();
  return true;
}

function clearPendingBilibiliResolve() {
  pendingBilibiliResolve = false;
  if (pendingBilibiliResolveTimer) {
    clearTimeout(pendingBilibiliResolveTimer);
    pendingBilibiliResolveTimer = null;
  }
}

function startPendingBilibiliResolve() {
  clearPendingBilibiliResolve();
  pendingBilibiliResolve = true;
  pendingBilibiliResolveTimer = setTimeout(() => {
    if (!pendingBilibiliResolve) return;
    clearPendingBilibiliResolve();
    log("B站解析超时，请检查链接或稍后重试");
  }, 20000);
}

function executeLoadVideo(url, title, isRemote = false, cid = "") {
  if (!url) return false;
  const cleanCid = normalizeCid(cid);
  const signature = buildVideoSignature(url, cleanCid);
  if (signature === currentVideoSignature && video.src === url) return false;

  currentVideoSignature = signature;
  void switchBackToHtml5Player(true);
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  clearLocalVideoSource();
  video.src = url;
  video.load();
  emptyState.classList.add("hidden");
  if (videoTitleEl) videoTitleEl.textContent = title || normalizeVideoTitle(url);
  log(`加载视频�?{title || normalizeVideoTitle(url)}`);
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

function sendOpen(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
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
  if (!autoPlayAfterLoad || !video.src || !activePlayer.isPaused()) return;
  try {
    await activePlayer.play();
    autoPlayAfterLoad = false;
    sendControl("auto-play");
  } catch (error) {
    log(friendlyPlayErrorMessage(error));
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

  if (isUsingControlledMpv()) {
    void handleControlledMpvStopped("受控 mpv 已关�?, true);
  }
  if (socket) socket.close();
  joined = false;
  joinPending = false;
  isHost = false;
  suppressAutoReconnect = false;
  setStatus("连接�?, false);
  connectButton.disabled = true;

  let activeSocket;
  try {
    activeSocket = new WebSocket(url);
  } catch {
    connectButton.disabled = false;
    setStatus("连接失败", false);
    log("服务器地址无效，请填写 ws:// �?wss:// 开头的地址");
    return;
  }

  socket = activeSocket;

  activeSocket.addEventListener("open", () => {
    if (attempt !== connectAttempt || activeSocket !== socket) return;
    activeSocket.send(JSON.stringify({
      type: "join",
      room,
      name: displayName,
      sessionToken: getOrCreateHostToken(room)
    }));
  });

  activeSocket.addEventListener("message", (event) => {
    if (attempt !== connectAttempt || activeSocket !== socket) return;
    try {
      const message = JSON.parse(event.data);
      handleMessage(message).catch((error) => {
        log(`消息处理失败�?{error.message || "未知错误"}`);
      });
    } catch {
      log("收到无法解析的服务器消息");
    }
  });

  activeSocket.addEventListener("close", () => {
    if (attempt !== connectAttempt || activeSocket !== socket) return;
    joined = false;
    joinPending = false;
    isHost = false;
    clientId = null;
    socket = null;
    endRtcCall(false);
    connectButton.disabled = false;
    setStatus("已断开", false, suppressAutoReconnect ? "连接已断开" : "连接已断开，正在尝试重�?..");
    log(suppressAutoReconnect ? "连接已断开�? : "连接已断开，正在尝试重�?..");
    if (!suppressAutoReconnect) {
      reconnectTimer = setTimeout(() => {
        if (document.visibilityState !== "hidden") connect();
      }, 2500);
    }
  });

  activeSocket.addEventListener("error", () => {
    if (attempt !== connectAttempt || activeSocket !== socket) return;
    setStatus("连接失败", false, "连接失败，请检查服务器地址或网�?);
    log("连接失败，请检查服务器地址或网络�?);
  });
}

async function handleMessage(message) {
  if (message.type === "joined") {
    joined = true;
    joinPending = false;
    clientId = message.clientId;
    isHost = Boolean(message.isHost);
    if (shareUrlCleanupPending) {
      window.history.replaceState({}, document.title, `${window.location.origin}${window.location.pathname}`);
      shareUrlCleanupPending = false;
    }
    if (message.publicUrl) {
      cachedPublicUrl = message.publicUrl;
      updateInviteLink();
    }
    connectButton.disabled = false;
    setStatus("已连�?, true);
    renderClients(message.clients || []);
    checkFileConsistency(message.clients || []);
    restoreSharedMediaIfNeeded(message.media, "joined");
    applyRemoteState(message.state, message.serverTime, "join");
    announceFile();
    if (pendingVideoBroadcast) {
      send(pendingVideoBroadcast);
      pendingVideoBroadcast = null;
    }
    log(`已进入房�?${message.room}${isHost ? "（房主）" : ""}`);
    if (isHost) {
      log("你是当前房间的房主，后续访客需要你审核后才能进入�?);
    }
    return;
  }

  if (message.type === "join_pending") {
    joined = false;
    joinPending = true;
    isHost = false;
    clientId = null;
    connectButton.disabled = false;
    setStatus("等待审核", false, "已向管理员发送加入申请，请等待房主开�?..");
    log(message.message || "已向管理员发送加入申请，请等待房主开�?..");
    return;
  }

  if (message.type === "join_rejected") {
    joined = false;
    joinPending = false;
    isHost = false;
    suppressAutoReconnect = true;
    connectButton.disabled = false;
    setStatus("加入被拒�?, false, "房主拒绝了本次加入申�?);
    log(message.message || "房主拒绝了你的加入申�?);
    if (socket && socket.readyState === WebSocket.OPEN) socket.close();
    return;
  }

  if (message.type === "join_request") {
    // 房主侧只�?join 阶段额外做审核；一旦批准，后续所有同步逻辑保持原样�?    const requesterName = message.requester?.name || "未知用户";
    const approved = window.confirm(`用户�?{requesterName}」正在申请加入房间，是否允许？`);
    sendOpen({
      type: "review_result",
      approved,
      targetId: message.requester?.id || ""
    });
    log(`${approved ? "已允�? : "已拒�?} ${requesterName} 加入房间`);
    return;
  }

  if (message.type === "clients") {
    renderClients(message.clients || []);
    checkFileConsistency(message.clients || []);
    return;
  }

  if (message.type === "state") {
    lastRemoteState = { state: message.state, serverTime: message.serverTime };
    restoreSharedMediaIfNeeded(message.media, message.reason || "state");
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
    clearPendingBilibiliResolve();
    const shouldResetPlayback = shouldResetPlaybackForMedia(message.url, message.cid, message.resetPlayback);
    if (shouldResetPlayback) {
      lastRemoteState = null;
      forceResetPlaybackOnLoad = true;
    }
    const loaded = executeLoadVideo(message.url, message.title || "网络视频�?, true, message.cid);
    if (!loaded && shouldResetPlayback) {
      activePlayer.seekTo(0);
      activePlayer.pause();
      updatePlayIcon();
    }
    if (loaded) log(`已同步加载视频：${message.title || "网络视频�?}`);
    return;
  }

  if (message.type === "resolve_bilibili_failed") {
    clearPendingBilibiliResolve();
    log(`B站解析失败：${message.reason || "未知错误"}${String(message.reason || "").includes("MP4") ? " 建议换电脑播放、改�?mpv，或更换普�?MP4 链接�? : ""}`);
    return;
  }

  if (message.type === "rtc_offer" || message.type === "rtc_answer" || message.type === "rtc_ice" || message.type === "rtc_hangup" || message.type === "rtc_peer_left") {
    await handleRtcSignal(message);
    return;
  }

  if (message.type === "error") {
    if (String(message.message || "").includes("房主暂不在线")) {
      suppressAutoReconnect = true;
      connectButton.disabled = false;
      setStatus("无法加入", false, "房主暂不在线，暂时无法审�?);
    }
    log(message.message || "服务端错�?);
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
    item.textContent = `${client.name}${client.id === clientId ? "（我�? : ""}`;
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

function targetTimeFromState(state) {
  if (!state) return 0;
  return state.time || 0;
}

async function applyRemoteState(state, serverTime, reason) {
  if (!state) return;
  // Allow controlled-mpv mode even though video.src is cleared.
  // Block only when neither html5 source nor controlled-mpv is active.
  if (!video.src && !isUsingControlledMpv()) return;
  if (state.playerMode === "controlled-mpv" && !isUsingControlledMpv()) {
    if (isDesktopApp && currentLocalVideoPath && !isSwitchingToMpv) {
      log("房主正在使用外部播放器同步模式，正在自动为您启动外部播放�?..");
      void switchToControlledMpv().then((res) => {
        if (res && !res.ok) {
          log(`自动启动失败: ${res.message} (如果对方未安�?mpv，请让房主切换回普通网页播�?`);
          window.alert(`自动启动 mpv 失败: ${res.message}\n请确保已正确安装 mpv 并配置了 SYNC_CINEMA_MPV_PATH 环境变量。`);
        }
      });
    } else if (!isSwitchingToMpv) {
      log("房主正在使用外部播放器同步模式，请选择相同本地视频�?);
    }
    return;
  }

  const target = targetTimeFromState(state);
  const drift = Math.abs(activePlayer.getCurrentTime() - target);
  // Relax the sync threshold during normal playback to prevent micro-stutters from minor buffering
  const shouldSeek = reason !== "tick" || drift > 2.5;

  console.log(`[mpv-sync] apply remote action=${reason} targetTime=${target} paused=${state.paused}`);

  suppressRemoteEcho = true;
  isRemoteAction = true;
  if (isRemoteActionTimeout) {
    clearTimeout(isRemoteActionTimeout);
    isRemoteActionTimeout = null;
  }

  try {
    if (!isUsingControlledMpv()) {
      video.playbackRate = state.rate || 1;
    }
    if (shouldSeek && Number.isFinite(target)) {
      remoteSeekTarget = target;
      activePlayer.seekTo(Math.min(target, activePlayer.getDuration() || target));
    }

    if (state.paused) {
      activePlayer.pause();
    } else if (activePlayer.isPaused()) {
      await activePlayer.play().catch((error) => {
        log(friendlyPlayErrorMessage(error));
      });
    }
  } finally {
    suppressRemoteEcho = false;
    const isMpv = isUsingControlledMpv();
    isRemoteActionTimeout = setTimeout(() => {
      isRemoteAction = false;
      isRemoteActionTimeout = null;
      updatePlayIcon();
    }, isMpv ? 1000 : 200);
  }
}

function announceFile() {
  if (!currentLocalVideoMeta || !currentLocalVideoMeta.name) return;
  send({
    type: "file",
    name: currentLocalVideoMeta.name,
    size: currentLocalVideoMeta.size,
    duration: currentLocalVideoMeta.duration || null,
    playerMode: currentLocalVideoMeta.playerMode || "html5"
  });
}

function sendControl(reason) {
  if (suppressRemoteEcho) return false;
  const isMpv = isUsingControlledMpv();
  const paused = activePlayer.isPaused();
  const time = activePlayer.getCurrentTime() || 0;
  const duration = activePlayer.getDuration() || (currentLocalVideoMeta ? currentLocalVideoMeta.duration : null);
  const rate = isMpv ? 1 : (video.playbackRate || 1);

  console.log(`[mpv-sync] local control action=${reason}`);
  console.log(`[mpv-sync] broadcast action=${reason} paused=${paused} time=${time} duration=${duration}`);

  send({
    type: "control",
    reason,
    paused,
    time,
    rate,
    playerMode: currentLocalVideoMeta ? currentLocalVideoMeta.playerMode : "html5"
  });
}

function checkFileConsistency(clients) {
  if (!currentLocalVideoMeta || !currentLocalVideoMeta.name || !clients || clients.length <= 1) return;

  for (const client of clients) {
    if (client.id === clientId) continue;
    if (client.file) {
      const localName = currentLocalVideoMeta.name;
      const remoteName = client.file;
      const localSize = currentLocalVideoMeta.size;
      const remoteSize = client.size !== undefined ? client.size : null;
      const localDuration = currentLocalVideoMeta.duration;
      const remoteDuration = client.duration;

      console.log(`[mpv-sync] file check local=${localName}:${localSize}:${localDuration} remote=${remoteName}:${remoteSize}:${remoteDuration}`);

      let inconsistent = false;
      if (localName !== remoteName) {
        inconsistent = true;
      }
      if (localSize !== null && remoteSize !== null && localSize !== remoteSize) {
        inconsistent = true;
      }
      if (localDuration !== null && remoteDuration !== null && Math.abs(localDuration - remoteDuration) > 2) {
        inconsistent = true;
      }

      if (inconsistent) {
        log("[警告] 双方文件可能不一致，可能无法同步�?);
      }
    }
  }
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
  if (!historyDanmakus.length || isUsingControlledMpv() || video.paused) return;

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
    log("未收到有�?cid，跳�?B 站历史弹�?);
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
    log(`成功载入 ${historyDanmakus.length} �?B 站原版弹幕`);
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
  const label = isMe ? "�? : (senderName || "好友");
  emitDanmaku({ text: `${label}�?{cleanText}`, mode: "rtl" }, true, isMe ? "me" : "peer");
}

function sendChatMessage(text) {
  const cleanText = String(text || "").trim().slice(0, 240);
  if (!cleanText) return false;
  if (!joined || !socket || socket.readyState !== WebSocket.OPEN) {
    log("请先连接房间，再发送弹�?消息");
    return false;
  }

  const messageId = `${clientId || "local"}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const localMessage = {
    id: messageId,
    type: "chat",
    sender: { id: clientId, name: displayName || nameInput.value.trim() || "�? },
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
  if (message.sender?.id === clientId) header.textContent += "（我�?;
  const body = document.createElement("div");
  body.className = "chat-message-body";
  body.textContent = message.text || "";
  item.append(header, body);
  chatMessagesEl.append(item);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function updatePlayIcon() {
  if (!playPauseButton) return;
  playPauseButton.textContent = activePlayer.isPaused() ? t("play", "�?播放") : t("pause", "❚❚ 暂停");
}

function updateTimeReadout() {
  if (!timeDisplay) return;
  timeDisplay.textContent = `${formatTime(activePlayer.getCurrentTime())} / ${formatTime(activePlayer.getDuration())}`;
}

function updateProgressBar() {
  if (!progressBar) return;
  const duration = activePlayer.getDuration();
  const progress = Number.isFinite(duration) && duration > 0
    ? Math.min(100, Math.max(0, (activePlayer.getCurrentTime() / duration) * 100))
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
    log("连麦中已自动压低电影音量，减少回声干�?);
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
  fullscreenBtn.textContent = active ? t("fullscreen_exit", "退出全�?) : t("fullscreen", "�?全屏");
  if (fullscreenStatus) {
    fullscreenStatus.textContent = active ? "�?已全�? : "�?窗口模式";
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
  return Boolean(video.src && !activePlayer.isPaused());
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

function getCallVideoSender() {
  if (!peerConnection) return null;
  return peerConnection.getSenders().find((sender) => sender.track?.kind === "video") || null;
}

async function applyRtcVideoQualityProfile(level, reason = "") {
  const sender = getCallVideoSender();
  const profile = RTC_QUALITY_PROFILES[level];
  if (!sender?.track || !profile) return;

  const params = sender.getParameters();
  params.degradationPreference = "balanced";
  params.encodings = Array.isArray(params.encodings) && params.encodings.length > 0 ? params.encodings : [{}];
  params.encodings[0] = {
    ...params.encodings[0],
    maxBitrate: profile.maxBitrate,
    scaleResolutionDownBy: profile.scaleResolutionDownBy
  };

  await sender.setParameters(params);
  if (rtcVideoQualityLevel !== level) {
    rtcVideoQualityLevel = level;
    log(`连麦画质已切换到${profile.name}�?{reason ? `�?{reason}` : ""}`);
  }
}

function stopRtcQualityMonitor() {
  if (rtcStatsTimer) clearInterval(rtcStatsTimer);
  rtcStatsTimer = null;
  rtcWeakNetworkScore = 0;
  rtcVideoQualityLevel = 1;
}

function startRtcQualityMonitor() {
  stopRtcQualityMonitor();
  rtcStatsTimer = setInterval(async () => {
    const sender = getCallVideoSender();
    if (!peerConnection || !sender?.track) return;

    try {
      const stats = await peerConnection.getStats();
      let packetsSent = 0;
      let packetsLost = 0;
      let rtt = 0;
      let availableOutgoingBitrate = 0;

      stats.forEach((report) => {
        if (report.type === "outbound-rtp" && report.kind === "video" && !report.isRemote) {
          packetsSent = Math.max(packetsSent, Number(report.packetsSent || 0));
        } else if (report.type === "remote-inbound-rtp" && report.kind === "video") {
          packetsLost = Math.max(packetsLost, Number(report.packetsLost || 0));
          rtt = Math.max(rtt, Number(report.roundTripTime || 0));
        } else if (report.type === "candidate-pair" && report.state === "succeeded" && (report.nominated || report.selected)) {
          availableOutgoingBitrate = Math.max(availableOutgoingBitrate, Number(report.availableOutgoingBitrate || 0));
          rtt = Math.max(rtt, Number(report.currentRoundTripTime || 0), rtt);
        }
      });

      const packetLossRate = packetsSent > 0 ? packetsLost / (packetsSent + packetsLost) : 0;
      const weakNetwork = packetLossRate > 0.08 || rtt > 0.8 || (availableOutgoingBitrate > 0 && availableOutgoingBitrate < 250_000);
      rtcWeakNetworkScore = weakNetwork ? Math.min(4, rtcWeakNetworkScore + 1) : Math.max(-2, rtcWeakNetworkScore - 1);

      if (rtcWeakNetworkScore >= 2 && rtcVideoQualityLevel > 0) {
        await applyRtcVideoQualityProfile(rtcVideoQualityLevel - 1, "弱网自动降级");
      } else if (rtcWeakNetworkScore <= -2 && rtcVideoQualityLevel < RTC_QUALITY_PROFILES.length - 1) {
        await applyRtcVideoQualityProfile(rtcVideoQualityLevel + 1, "网络恢复");
      }
    } catch {
      // Ignore transient getStats/setParameters failures while ICE is recovering.
    }
  }, RTC_STATS_INTERVAL_MS);
}

function updateCallControls() {
  const hasLocalStream = Boolean(localCallStream);
  const audioTrack = localCallStream?.getAudioTracks()[0];
  const videoTrack = localCallStream?.getVideoTracks()[0];
  const isCalling = callActive || Boolean(peerConnection);

  if (localCallLabel) localCallLabel.textContent = displayName || nameInput.value.trim() || "�?;
  if (remoteCallLabel) remoteCallLabel.textContent = remoteCallPeerName || "对方";

  if (callButton) {
    callButton.textContent = isCalling ? t("hangup", "挂断") : t("call", "📞 连麦");
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
    cameraToggleButton.textContent = !videoTrack || videoTrack.enabled ? "📷" : "�?;
    cameraToggleButton.classList.toggle("is-off", Boolean(videoTrack && !videoTrack.enabled));
  }
}

async function ensureLocalCallStream() {
  if (localCallStream) return localCallStream;
  if (!canUseRtc()) throw new Error("当前浏览器不支持 WebRTC 或媒体权�?);

  localCallStream = await navigator.mediaDevices.getUserMedia({
    video: CALL_VIDEO_CONSTRAINTS,
    audio: CALL_AUDIO_CONSTRAINTS
  });
  if (localCallVideo) localCallVideo.srcObject = localCallStream;
  if (peerConnection) {
    const senderKinds = new Set(peerConnection.getSenders().map((sender) => sender.track?.kind).filter(Boolean));
    localCallStream.getTracks().forEach((track) => {
      if (!senderKinds.has(track.kind)) peerConnection.addTrack(track, localCallStream);
    });
  }
  updateCallControls();
  return localCallStream;
}

function createPeerConnection() {
  if (peerConnection) return peerConnection;

  peerConnection = new RTCPeerConnection(buildRtcConfig());

  peerConnection.onnegotiationneeded = async () => {
    if (!joined || !socket || socket.readyState !== WebSocket.OPEN) return;
    try {
      makingOffer = true;
      await peerConnection.setLocalDescription(await peerConnection.createOffer());
      send({ type: "rtc_offer", offer: peerConnection.localDescription });
      log("检测到媒体状态变化，已发起重新协�?);
    } catch (error) {
      log(`重新协商失败�?{error.message || "未知错误"}`);
    } finally {
      makingOffer = false;
    }
  };

  peerConnection.ontrack = async (event) => {
    const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
    log("�?已收到对方音视频�?);
    console.log("�?已收到对方音视频�?, stream);
    if (stream && remoteCallVideo) {
      if (remoteCallVideo.srcObject !== stream) {
        remoteCallVideo.srcObject = stream;
      }
      remoteCallVideo.autoplay = true;
      remoteCallVideo.playsInline = true;
      const rect = remoteCallVideo.getBoundingClientRect();
      console.log(`🔍 播放器尺�? �?${rect.width}px, �?${rect.height}px。如果是 0，请检�?CSS！`);
      try {
        await remoteCallVideo.play();
        console.log("🔊 对方画面/声音已成功冲破阻碍开始播放！");
      } catch (error) {
        console.error("�?播放失败，浏览器不给放行:", error);
        window.alert("请点击一下页面任意位置，然后再试一次连麦，浏览器可能拦截了自动播放�?);
      }
    } else {
      console.error("�?严重错误：没在页面上找到 id 叫做 remote-video 的元素！");
    }
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
      startRtcQualityMonitor();
      applyRtcVideoQualityProfile(rtcVideoQualityLevel).catch(() => {});
      log("连麦已建�?);
    } else if (state === "failed" || state === "disconnected") {
      log("连麦连接不稳定，正在等待浏览器恢�?);
    } else if (state === "closed") {
      stopRtcQualityMonitor();
      callActive = false;
      updateCallControls();
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    log(`ICE 状态：${peerConnection?.iceConnectionState || "unknown"}`);
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
      log(`连麦候选地址添加失败�?{error.message || "ICE 错误"}`);
    }
  }
}

async function startRtcCall() {
  if (!joined || !socket || socket.readyState !== WebSocket.OPEN) {
    log("请先连接房间，再发起连麦");
    return;
  }

  try {
    const hasExistingPeerConnection = Boolean(peerConnection);
    await ensureLocalCallStream();
    const pc = createPeerConnection();
    callActive = true;
    duckMovieAudioForCall();
    updateCallControls();
    if (hasExistingPeerConnection) {
      log("本地音视频已加入，等待重新协�?);
      return;
    }
    makingOffer = true;
    await pc.setLocalDescription(await pc.createOffer());
    send({ type: "rtc_offer", offer: pc.localDescription });
    log("已发起连麦邀�?);
  } catch (error) {
    log(`连麦启动失败�?{error.message || "无法获取摄像�?麦克�?}`);
    showCallFailureAlert(error, "无法获取摄像�?麦克�?);
    endRtcCall(false);
  } finally {
    makingOffer = false;
  }
}

function endRtcCall(notifyPeer = true) {
  if (notifyPeer && joined) send({ type: "rtc_hangup" });
  stopRtcQualityMonitor();

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
    if (peerConnection || localCallStream) log("对方已结束连�?);
    endRtcCall(false);
    return;
  }

  if (message.type === "rtc_offer") {
    try {
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
      log(`已接�?${remoteCallPeerName || "对方"} 的连麦`);
    } catch (error) {
      log(`接听连麦失败�?{error.message || "WebRTC 握手失败"}`);
      showCallFailureAlert(error, "WebRTC 握手失败");
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
      if (!makingOffer) log(`连麦候选地址添加失败�?{error.message || "ICE 错误"}`);
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
  const duration = activePlayer.getDuration();
  if (!progressContainer || !Number.isFinite(duration) || duration <= 0) return;
  const rect = progressContainer.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  activePlayer.seekTo(ratio * duration);
  // For HTML5, sendControl("seek") fires via video.addEventListener("seeked").
  // For controlled mpv, video.seeked never fires, so broadcast explicitly here.
  if (isUsingControlledMpv() && !suppressRemoteEcho) {
    const now = Date.now();
    if (now - lastSeekSentAt > 250) {
      lastSeekSentAt = now;
      console.log("[mpv-sync] local control action=seek (page progress bar)");
      sendControl("seek");
    }
  }
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

if (langSwitch) {
  langSwitch.addEventListener("change", (event) => {
    updateLanguage(event.target.value);
  });
}

if (helpBtn) helpBtn.addEventListener("click", showGuideModal);
if (guideCloseBtn) guideCloseBtn.addEventListener("click", hideGuideModal);
if (sponsorBtn) sponsorBtn.addEventListener("click", showSponsorModal);
if (sponsorCloseBtn) sponsorCloseBtn.addEventListener("click", hideSponsorModal);

if (isDesktopApp && devtoolsBtn) {
  devtoolsBtn.style.display = "flex";
  devtoolsBtn.addEventListener("click", () => {
    if (desktopBridge && desktopBridge.toggleDevTools) {
      desktopBridge.toggleDevTools();
    }
  });
}
if (localStorage.getItem("has_seen_guide") !== "true") {
  showGuideModal();
  localStorage.setItem("has_seen_guide", "true");
}

roomInput.addEventListener("input", () => {
  updateInviteLink();
});

if (serverUrlInput) {
  serverUrlInput.addEventListener("input", () => {
    updateInviteLink();
  });
}

if (inviteBtn) {
  inviteBtn.addEventListener("click", async () => {
    const link = inviteText?.textContent || buildInviteLink();
    const originalCopyText = inviteCopyLabel?.textContent || t("copy", "复制");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(link).catch(fallbackCopy);
      } else {
        fallbackCopy();
      }
      
      function fallbackCopy() {
        const textArea = document.createElement("textarea");
        textArea.value = link;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const success = document.execCommand("copy");
        document.body.removeChild(textArea);
        if (!success) throw new Error("Copy failed");
      }

      if (inviteCopyLabel) inviteCopyLabel.textContent = "�?;
      log("已复制邀请链�?);
      setTimeout(() => {
        if (inviteCopyLabel) inviteCopyLabel.textContent = t("copy", "复制");
      }, 2000);
    } catch {
      if (inviteCopyLabel) inviteCopyLabel.textContent = "!";
      log("复制邀请链接失败，请手动选择文字并复�?);
      setTimeout(() => {
        if (inviteCopyLabel) inviteCopyLabel.textContent = originalCopyText;
      }, 2000);
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
        log("请先加入房间，再加载 B 站视频�?);
        return;
      }
      startPendingBilibiliResolve();
      send({ type: "resolve_bilibili", url });
      log("正在后台解析 B 站直�?.. 请稍候�?);
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
  chooseLocalButton.addEventListener("click", async () => {
    if (isDesktopApp) {
      await loadDesktopLocalVideo();
      return;
    }
    openLocalFilePicker();
  });
}

if (fileInput) {
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    await switchBackToHtml5Player(true);

    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    markLocalVideoSource(file.path || "", file.name || "");
    currentLocalVideoMeta = {
      name: file.name || "",
      size: file.size || null,
      duration: null,
      playerMode: "html5"
    };
    emptyState.classList.add("hidden");
    resetDanmaku();
    currentVideoSignature = buildVideoSignature(objectUrl);
    if (videoTitleEl) videoTitleEl.textContent = file.name;
    log(`已选择 ${file.name}`);
    log("本地文件不会自动共享，双方需要各自选择同一个文件�?);

    // 复杂片源跳过 HTML5 加载，引导到受控 mpv 同步模式（桌面端�?    if (isComplexLocalMediaSource(file.path || "", file.name || "")) {
      if (isDesktopApp) {
        log("检测到复杂片源�?mkv / H.265 / HEVC / DTS 等），Electron 内置播放器可能无法解码。请点击「使用受�?mpv 同步模式（第一版）」按钮播放�?);
        updateMpvModeUi();
      } else {
        log("检测到复杂片源，浏览器可能无法播放。如需完整支持，请使用桌面端受�?mpv 同步模式�?);
        video.src = objectUrl;
        video.load();
        showLocalMpvModeHint("检测到复杂本地片源文件名或扩展�?);
      }
      return;
    }

    log("本地文件不会自动共享给对方；如果有画面但没声音，通常是浏览器不支持该音频编码�?);
    video.src = objectUrl;
    video.load();
  });
}


video.addEventListener("loadedmetadata", () => {
  log(`video event: loadedmetadata readyState=${video.readyState} networkState=${video.networkState} currentSrc=${video.currentSrc || video.src || ""}`);
  updateTimeReadout();
  updateProgressBar();
  keepPlaybackControlsVisible();
  if (currentLocalVideoMeta) {
    currentLocalVideoMeta.duration = activePlayer.getDuration() || video.duration || null;
  }
  announceFile();
  if (forceResetPlaybackOnLoad) {
    forceResetPlaybackOnLoad = false;
    activePlayer.seekTo(0);
    activePlayer.pause();
    updatePlayIcon();
  } else if (lastRemoteState) {
    applyRemoteState(lastRemoteState.state, lastRemoteState.serverTime, "file-loaded");
  }
  tryAutoPlayLoadedVideo();
});

video.addEventListener("canplay", () => {
  log(`video event: canplay readyState=${video.readyState} networkState=${video.networkState} currentSrc=${video.currentSrc || video.src || ""}`);
});

video.addEventListener("stalled", () => {
  log(`video event: stalled readyState=${video.readyState} networkState=${video.networkState} currentSrc=${video.currentSrc || video.src || ""}`);
});

video.addEventListener("abort", () => {
  log(`video event: abort readyState=${video.readyState} networkState=${video.networkState} currentSrc=${video.currentSrc || video.src || ""}`);
});

video.addEventListener("error", () => {
  log(`video event: error code=${video.error?.code ?? ""} message=${video.error?.message || ""} networkState=${video.networkState} readyState=${video.readyState} currentSrc=${video.currentSrc || video.src || ""}`);
  log(friendlyMediaErrorMessage());
  const isLocalFileSource = (Boolean(objectUrl) && (video.currentSrc || video.src || "").startsWith("blob:")) || isLocalDesktopVideoSource();
  const errorCode = video.error?.code;
  const mediaErrorText = `${video.error?.message || ""} ${video.error?.code || ""}`;
  const isDecodeFailure = errorCode === getMediaErrorCode("MEDIA_ERR_DECODE", 3)
    || errorCode === getMediaErrorCode("MEDIA_ERR_SRC_NOT_SUPPORTED", 4)
    || /PIPELINE_ERROR_DECODE|MEDIA_ERR_DECODE|MEDIA_ERR_SRC_NOT_SUPPORTED/i.test(mediaErrorText);
  if (isLocalFileSource && isDecodeFailure) {
    if (isDesktopApp) {
      log("Electron 内置播放器无法解码该片源，请点击\u201c使用受控 mpv 同步模式（第一版）\u201d按钮播放�?);
      updateMpvModeUi();
    } else {
      log(localFileCodecHint());
    }
    showLocalMpvModeHint("HTML5 video 解码失败");
  }
});

video.addEventListener("play", () => {
  updatePlayIcon();
  showPlaybackControls();
  if (!isRemoteAction) sendControl("play");
});

video.addEventListener("pause", () => {
  updatePlayIcon();
  keepPlaybackControlsVisible();
  if (suppressNextHtml5PauseSync) {
    suppressNextHtml5PauseSync = false;
    return;
  }
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
      log("请先选择本地电影或加载网络视�?);
      return;
    }
    if (activePlayer.isPaused()) {
      await activePlayer.play().catch((error) => {
        log(friendlyPlayErrorMessage(error));
      });
    } else {
      activePlayer.pause();
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
  if (isUsingControlledMpv()) {
    void handleControlledMpvStopped("", true);
  } else if (mpvPlayer) {
    void mpvPlayer.stop().catch(() => {});
  }
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

setStatus("未连�?, false);
updateDanmakuToggle();
updateVolumeControls();
updateFullscreenButton();
updateCallControls();
updatePlayIcon();
updateTimeReadout();
updateMpvModeUi();
initControlsAutohide();

if (AUTO_CONNECT) {
  connect();
}

