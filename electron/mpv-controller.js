const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const LOG_PREFIX = "[desktop-mpv-controller]";
const DEFAULT_CONNECT_RETRIES = 60;
const DEFAULT_CONNECT_INTERVAL_MS = 250;
const DEFAULT_COMMAND_TIMEOUT_MS = 5_000;

function log(message) {
  process.stdout.write(`${LOG_PREFIX} ${message}\n`);
}

function logError(message) {
  process.stderr.write(`${LOG_PREFIX} ${message}\n`);
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

function resolveMpvPath(configuredPath = process.env.SYNC_CINEMA_MPV_PATH || "mpv") {
  const configuredValue = String(configuredPath || "").trim();
  if (!configuredValue) return "";

  if (path.isAbsolute(configuredValue) && fs.existsSync(configuredValue)) {
    log(`resolved mpv path from absolute config: ${configuredValue}`);
    return configuredValue;
  }

  const preferredNames = process.platform === "win32"
    ? [configuredValue, `${configuredValue}.exe`]
    : [configuredValue];

  for (const name of preferredNames) {
    const resolved = findExecutableInPath(name);
    if (resolved) {
      log(`resolved mpv path from PATH: ${resolved}`);
      return resolved;
    }
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
      if (candidate && fs.existsSync(candidate)) {
        log(`resolved mpv path from Windows candidates: ${candidate}`);
        return candidate;
      }
    }
  }

  logError("mpv executable not found");
  return "";
}

function createPipePath() {
  const randomId = crypto.randomUUID().replace(/-/g, "");
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\remote-sync-movie-mpv-${randomId}`;
  }
  return path.join(process.env.TMPDIR || "/tmp", `remote-sync-movie-mpv-${randomId}.sock`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class MpvController {
  constructor(options = {}) {
    this.mpvPath = options.mpvPath || "";
    this.connectRetries = options.connectRetries || DEFAULT_CONNECT_RETRIES;
    this.connectIntervalMs = options.connectIntervalMs || DEFAULT_CONNECT_INTERVAL_MS;
    this.commandTimeoutMs = options.commandTimeoutMs || DEFAULT_COMMAND_TIMEOUT_MS;
    this.process = null;
    this.socket = null;
    this.pipePath = "";
    this.buffer = "";
    this.nextRequestId = 1;
    this.pendingRequests = new Map();
  }

  static resolveMpvPath(configuredPath) {
    return resolveMpvPath(configuredPath);
  }

  async start(filePath) {
    const targetPath = String(filePath || "").trim();
    if (!targetPath) throw new Error("Missing file path for controlled mpv.");
    if (!fs.existsSync(targetPath)) throw new Error(`File does not exist: ${targetPath}`);

    if (this.process || this.socket) {
      await this.stop();
    }

    const resolvedMpvPath = resolveMpvPath(this.mpvPath);
    if (!resolvedMpvPath) {
      throw new Error("mpv executable not found. Set SYNC_CINEMA_MPV_PATH or add mpv.exe to PATH.");
    }

    this.pipePath = createPipePath();
    // Conservative startup params for mpv.
    const args = [
      `--input-ipc-server=${this.pipePath}`,
      "--idle=no",
      "--force-window=yes",
      // Optimize default UI: change to a modern bottom-bar layout
      "--script-opts=osc-layout=bottombar,osc-seekbarstyle=bar",
      targetPath
    ];

    log(`starting mpv path=${resolvedMpvPath}`);
    log(`pipe path=${this.pipePath}`);
    log(`spawn args=${JSON.stringify(args)}`);

    this.process = spawn(resolvedMpvPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: false
    });

    this.process.stdout.on("data", (chunk) => {
      log(`stdout ${chunk.toString("utf8").trim()}`);
    });

    this.process.stderr.on("data", (chunk) => {
      logError(`stderr ${chunk.toString("utf8").trim()}`);
    });

    this.process.once("error", (error) => {
      logError(`spawn error=${error.message}`);
      this.rejectAllPending(error);
    });

    this.process.once("exit", (code, signal) => {
      log(`mpv exited code=${code ?? ""} signal=${signal || ""}`);
      this.rejectAllPending(new Error("mpv exited"));
      this.process = null;
      this.destroySocket();
    });

    await this.connectPipeWithRetry();
    return {
      ok: true,
      mpvPath: resolvedMpvPath,
      pipePath: this.pipePath
    };
  }

  async connectPipeWithRetry() {
    let lastError = null;

    for (let attempt = 1; attempt <= this.connectRetries; attempt += 1) {
      try {
        await this.connectPipeOnce();
        log(`pipe connected path=${this.pipePath}`);
        return;
      } catch (error) {
        lastError = error;
        log(`pipe connect retry ${attempt}/${this.connectRetries}: ${error.message}`);
        await wait(this.connectIntervalMs);
      }
    }

    throw new Error(`Unable to connect mpv IPC pipe: ${lastError?.message || "unknown error"}`);
  }

  connectPipeOnce() {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.pipePath);
      let settled = false;

      socket.once("connect", () => {
        settled = true;
        this.socket = socket;
        this.installSocketHandlers(socket);
        resolve();
      });

      socket.once("error", (error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(error);
      });
    });
  }

  installSocketHandlers(socket) {
    socket.on("data", (chunk) => {
      this.buffer += chunk.toString("utf8");
      let newlineIndex = this.buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = this.buffer.slice(0, newlineIndex).trim();
        this.buffer = this.buffer.slice(newlineIndex + 1);
        if (line) this.handleIpcLine(line);
        newlineIndex = this.buffer.indexOf("\n");
      }
    });

    socket.on("error", (error) => {
      logError(`pipe error=${error.message}`);
      this.rejectAllPending(error);
    });

    socket.on("close", () => {
      log("pipe closed");
      if (this.socket === socket) this.socket = null;
    });
  }

  handleIpcLine(line) {
    log(`ipc recv=${line}`);
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      logError(`invalid ipc json=${error.message}`);
      return;
    }

    const requestId = message.request_id;
    if (!requestId || !this.pendingRequests.has(requestId)) return;

    const pending = this.pendingRequests.get(requestId);
    this.pendingRequests.delete(requestId);
    clearTimeout(pending.timer);

    if (message.error && message.error !== "success") {
      pending.reject(new Error(message.error));
      return;
    }

    pending.resolve(message.data);
  }

  command(command) {
    if (!this.socket || this.socket.destroyed) {
      return Promise.reject(new Error("mpv IPC pipe is not connected."));
    }

    const requestId = this.nextRequestId;
    this.nextRequestId += 1;

    const payload = {
      command,
      request_id: requestId
    };
    const line = `${JSON.stringify(payload)}\n`;

    log(`ipc send=${line.trim()}`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`mpv IPC command timed out: ${JSON.stringify(command)}`));
      }, this.commandTimeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timer });
      this.socket.write(line, "utf8", (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        reject(error);
      });
    });
  }

  play() {
    return this.command(["set_property", "pause", false]);
  }

  pause() {
    return this.command(["set_property", "pause", true]);
  }

  seekTo(seconds) {
    const target = Number(seconds);
    if (!Number.isFinite(target)) {
      return Promise.reject(new Error(`Invalid seek target: ${seconds}`));
    }
    return this.command(["set_property", "time-pos", Math.max(0, target)]);
  }

  getTimePos() {
    return this.command(["get_property", "time-pos"]);
  }

  getDuration() {
    return this.command(["get_property", "duration"]);
  }

  getPauseState() {
    return this.command(["get_property", "pause"]);
  }

  async stop() {
    log("stopping controlled mpv");
    this.rejectAllPending(new Error("mpv controller stopped"));
    this.destroySocket();

    if (this.process && !this.process.killed) {
      const child = this.process;
      this.process = null;
      child.kill();
    }
  }

  destroySocket() {
    if (this.socket && !this.socket.destroyed) {
      this.socket.destroy();
    }
    this.socket = null;
    this.buffer = "";
  }

  rejectAllPending(error) {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}

module.exports = {
  MpvController,
  resolveMpvPath
};
