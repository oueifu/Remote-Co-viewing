// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Q Credit
const { contextBridge, ipcRenderer } = require("electron");

const PORT = Number(process.env.SYNC_CINEMA_PORT || 5050);
const HTTP_BASE_URL = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;

contextBridge.exposeInMainWorld("syncCinemaDesktop", {
  mode: "desktop",
  isDesktop: true,
  port: PORT,
  httpBaseUrl: HTTP_BASE_URL,
  wsUrl: WS_URL,
  chooseLocalVideo: () => ipcRenderer.invoke("desktop:choose-local-video"),
  openInMpv: (filePath) => ipcRenderer.invoke("desktop:open-in-mpv", filePath),
  openInControlledMpv: (filePath) => ipcRenderer.invoke("desktop:open-in-controlled-mpv", filePath),
  controlledMpvCommand: (command, value) => ipcRenderer.invoke("desktop:controlled-mpv-command", command, value),
  stopControlledMpv: () => ipcRenderer.invoke("desktop:stop-controlled-mpv"),
  setControllerMode: (enabled) => ipcRenderer.invoke("desktop:set-controller-mode", enabled),
  toggleDevTools: () => ipcRenderer.invoke("desktop:toggle-devtools")
});

