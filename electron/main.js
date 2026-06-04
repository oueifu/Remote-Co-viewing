// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Q Credit
const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, dialog, ipcMain, protocol, session, net } = require("electron");
const { MpvController } = require("./mpv-controller");

const PORT = Number(process.env.SYNC_CINEMA_PORT || 5050);
const SERVER_URL = `http://127.0.0.1:${PORT}`;
const SERVER_ENTRY = path.resolve(__dirname, "..", "server.js");
const PRELOAD_ENTRY = path.resolve(__dirname, "preload.js");
const SERVER_READY_TIMEOUT_MS = 15_000;
const SERVER_READY_RETRY_MS = 250;
const LOCAL_MOVIE_PROTOCOL = "local-movie";
const MPV_BINARY = process.env.SYNC_CINEMA_MPV_PATH || "mpv";
const localMovieFiles = new Map();

let mainWindow = null;
let serverProcess = null;
let ownsServerProcess = false;
let missingMpvWarningShown = false;
let controlledMpv = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: LOCAL_MOVIE_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function probeServer(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });

    req.on("error", () => resolve(false));
    req.setTimeout(1_500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServerReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeServer(url)) return true;
    await wait(SERVER_READY_RETRY_MS);
  }
  return false;
}

function launchLocalServer() {
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(PORT),
      ELECTRON_RUN_AS_NODE: "1"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[desktop-server] ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[desktop-server] ${chunk}`);
  });

  child.on("exit", (code, signal) => {
    if (!ownsServerProcess) return;
    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    process.stderr.write(`[desktop-server] exited with ${reason}\n`);
    if (!app.isQuitting) {
      dialog.showErrorBox("SyncCinema Server Stopped", `The local sync server exited unexpectedly (${reason}).`);
    }
  });

  return child;
}

async function ensureLocalServer() {
  if (await probeServer(SERVER_URL)) {
    ownsServerProcess = false;
    return;
  }

  serverProcess = launchLocalServer();
  ownsServerProcess = true;

  const ready = await waitForServerReady(SERVER_URL, SERVER_READY_TIMEOUT_MS);
  if (ready) return;

  throw new Error(`Local sync server did not become ready within ${SERVER_READY_TIMEOUT_MS}ms.`);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#07080d",
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      autoplayPolicy: "no-user-gesture-required"
    }
  });

  mainWindow.loadURL(SERVER_URL);
  configureDevelopmentDevTools(mainWindow);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function configureDevelopmentDevTools(window) {
  if (app.isPackaged) return;

  window.webContents.once("did-finish-load", () => {
    // window.webContents.openDevTools({ mode: "detach" });
  });

  window.webContents.on("before-input-event", (event, input) => {
    const isToggleDevTools = input.key === "F12"
      || ((input.control || input.meta) && input.shift && String(input.key || "").toLowerCase() === "i");

    if (!isToggleDevTools) return;

    event.preventDefault();
    if (window.webContents.isDevToolsOpened()) {
      window.webContents.closeDevTools();
    } else {
      window.webContents.openDevTools({ mode: "detach" });
    }
  });
}

function findExecutableInPath(executableName) {
  const pathEntries = String(process.env.PATH || "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of pathEntries) {
    const candidate = path.join(entry, executableName);
    if (fs.existsSync(candidate)) return candidate;
  }

  return "";
}

function resolveMpvBinary() {
  const configuredValue = String(MPV_BINARY || "").trim();
  if (!configuredValue) return "";

  if (path.isAbsolute(configuredValue) && fs.existsSync(configuredValue)) {
    return configuredValue;
  }

  const preferredNames = process.platform === "win32"
    ? [configuredValue, `${configuredValue}.exe`]
    : [configuredValue];

  for (const name of preferredNames) {
    const resolved = findExecutableInPath(name);
    if (resolved) return resolved;
  }

  if (process.platform === "win32") {
    const windowsCandidates = [
      "C:\\Program Files\\mpv\\mpv.exe",
      "C:\\Program Files (x86)\\mpv\\mpv.exe",
      path.join(String(process.env.LOCALAPPDATA || ""), "Programs", "mpv", "mpv.exe"),
      path.join(String(process.env.USERPROFILE || ""), "scoop", "apps", "mpv", "current", "mpv.exe"),
      path.join(String(process.env.CHOCOLATEYINSTALL || "C:\\ProgramData\\chocolatey"), "bin", "mpv.exe")
    ].filter(Boolean);

    for (const candidate of windowsCandidates) {
      if (candidate && fs.existsSync(candidate)) return candidate;
    }
  }

  return "";
}

function launchDetachedProcess(binaryPath, args, options = {}) {
  return new Promise((resolve) => {
    let settled = false;

    try {
      const child = spawn(binaryPath, args, {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
        ...options
      });

      child.once("spawn", () => {
        if (settled) return;
        settled = true;
        child.unref();
        resolve({ ok: true });
      });

      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        resolve({
          ok: false,
          message: error.message || `无法启动 ${binaryPath}`
        });
      });
    } catch (error) {
      resolve({
        ok: false,
        message: error.message || `无法启动 ${binaryPath}`
      });
    }
  });
}

function registerLocalMovieProtocol() {
  protocol.handle(LOCAL_MOVIE_PROTOCOL, async (request) => {
    process.stdout.write(`[desktop-protocol] request.url=${request.url}\n`);

    let parsedUrl;
    try {
      parsedUrl = new URL(request.url);
    } catch (error) {
      process.stderr.write(`[desktop-protocol] 404 invalid-url reason=${error.message}\n`);
      return new Response("Invalid local movie URL", { status: 404 });
    }

    if (parsedUrl.hostname !== "movie") {
      process.stderr.write(`[desktop-protocol] 404 invalid-host hostname=${parsedUrl.hostname}\n`);
      return new Response("Invalid local movie host", { status: 404 });
    }

    const movieId = parsedUrl.pathname.replace(/^\/+/, "").trim();
    if (!movieId) {
      process.stderr.write("[desktop-protocol] 404 missing-id\n");
      return new Response("Missing local movie id", { status: 404 });
    }

    const filePath = localMovieFiles.get(movieId);
    if (!filePath) {
      process.stderr.write(`[desktop-protocol] 404 unknown-id id=${movieId}\n`);
      return new Response("Unknown local movie id", { status: 404 });
    }

    process.stdout.write(`[desktop-protocol] resolved filePath=${filePath}\n`);
    if (!fs.existsSync(filePath)) {
      process.stderr.write(`[desktop-protocol] 404 missing-file id=${movieId} filePath=${filePath}\n`);
      return new Response("Missing local movie file", { status: 404 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function registerDesktopIpc() {
  ipcMain.handle("desktop:choose-local-video", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择本地电影文件",
      properties: ["openFile"],
      filters: [
        {
          name: "Videos",
          extensions: ["mp4", "mkv", "avi", "mov", "webm", "m4v", "flv", "rmvb"]
        }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    const stats = fs.statSync(filePath);
    const movieId = crypto.randomUUID();
    const movieUrl = `${LOCAL_MOVIE_PROTOCOL}://movie/${movieId}`;
    localMovieFiles.set(movieId, filePath);
    process.stdout.write(`[desktop-protocol] registered url=${movieUrl} filePath=${filePath}\n`);

    return {
      path: filePath,
      name: path.basename(filePath),
      size: Number.isFinite(stats.size) ? stats.size : null,
      url: movieUrl
    };
  });

  ipcMain.handle("desktop:open-in-mpv", async (_event, filePath) => {
    const targetPath = String(filePath || "").trim();
    if (!targetPath) {
      return { ok: false, message: "缺少本地视频路径，无法唤�?mpv�? };
    }

    const resolvedBinary = resolveMpvBinary();
    if (!resolvedBinary) {
      if (!missingMpvWarningShown) {
        missingMpvWarningShown = true;
        process.stderr.write("[desktop-mpv] mpv executable not found. Set SYNC_CINEMA_MPV_PATH or add mpv.exe to PATH.\n");
      }
      return {
        ok: false,
        message: "未找�?mpv.exe。请安装 mpv，或通过 SYNC_CINEMA_MPV_PATH 指定其绝对路径�?
      };
    }

    const result = await launchDetachedProcess(resolvedBinary, [targetPath]);
    if (!result.ok) {
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "MPV 启动失败",
        message: "无法启动 mpv 播放�?,
        detail: `${result.message}\n\n当前解析路径�?{resolvedBinary}`
      }).catch(() => {});
      return result;
    }

    return { ok: true, binaryPath: resolvedBinary };
  });

  ipcMain.handle("desktop:open-in-controlled-mpv", async (_event, filePath) => {
    try {
      if (controlledMpv) {
        await controlledMpv.stop();
      }

      controlledMpv = new MpvController({
        mpvPath: MPV_BINARY
      });

      const started = await controlledMpv.start(filePath);
      const timePos = await controlledMpv.getTimePos().catch(() => null);
      const duration = await controlledMpv.getDuration().catch(() => null);
      const paused = await controlledMpv.getPauseState().catch(() => null);
      process.stdout.write(`[desktop-mpv-controller] smoke started time-pos=${timePos ?? ""} duration=${duration ?? ""} paused=${paused ?? ""}\n`);
      return {
        ok: true,
        ...started,
        timePos,
        duration,
        paused
      };
    } catch (error) {
      process.stderr.write(`[desktop-mpv-controller] open failed=${error.message}\n`);
      return {
        ok: false,
        message: error.message || "受控 mpv 启动失败"
      };
    }
  });

  ipcMain.handle("desktop:controlled-mpv-command", async (_event, command, value) => {
    if (!controlledMpv) {
      return { ok: false, message: "受控 mpv 尚未启动�? };
    }

    try {
      let data = null;
      if (command === "play") {
        data = await controlledMpv.play();
      } else if (command === "pause") {
        data = await controlledMpv.pause();
      } else if (command === "seekTo") {
        data = await controlledMpv.seekTo(value);
      } else if (command === "getTimePos") {
        data = await controlledMpv.getTimePos();
      } else if (command === "getDuration") {
        data = await controlledMpv.getDuration();
      } else if (command === "isPaused" || command === "getPauseState") {
        data = await controlledMpv.getPauseState();
      } else {
        return { ok: false, message: `未知受控 mpv 命令�?{command}` };
      }

      process.stdout.write(`[desktop-mpv-controller] command=${command} result=${data ?? ""}\n`);
      return { ok: true, data };
    } catch (error) {
      process.stderr.write(`[desktop-mpv-controller] command=${command} failed=${error.message}\n`);
      return {
        ok: false,
        message: error.message || "受控 mpv 命令失败"
      };
    }
  });

  ipcMain.handle("desktop:stop-controlled-mpv", async () => {
    if (!controlledMpv) return { ok: true };
    try {
      await controlledMpv.stop();
      controlledMpv = null;
      return { ok: true };
    } catch (error) {
      process.stderr.write(`[desktop-mpv-controller] stop failed=${error.message}\n`);
      return {
        ok: false,
        message: error.message || "停止受控 mpv 失败"
      };
    }
  });

  // Resize the Electron window when entering/exiting external player controller mode.
  ipcMain.handle("desktop:set-controller-mode", (_event, enabled) => {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
    if (enabled) {
      mainWindow.setMinimumSize(300, 200);
      mainWindow.setSize(520, 310, true);
      mainWindow.setAlwaysOnTop(true, "floating");
    } else {
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setMinimumSize(1100, 720);
      mainWindow.setSize(1440, 920, true);
    }
    return { ok: true };
  });

  ipcMain.handle("desktop:toggle-devtools", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    } else {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
    return { ok: true };
  });
}

function configureDesktopSession() {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media" || permission === "fullscreen");
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === "media" || permission === "fullscreen";
  });
}

async function bootstrap() {
  try {
    await ensureLocalServer();
    registerLocalMovieProtocol();
    registerDesktopIpc();
    configureDesktopSession();
    createMainWindow();
  } catch (error) {
    dialog.showErrorBox("SyncCinema Startup Failed", error.message || "Unknown startup error.");
    app.quit();
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  app.isQuitting = true;
  if (controlledMpv) {
    controlledMpv.stop().catch(() => {});
    controlledMpv = null;
  }
  if (ownsServerProcess && serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
});

app.whenReady().then(bootstrap);

