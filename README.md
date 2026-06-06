# Remote Co-viewing (远程同步看视频)

一个轻量级、高颜值的异地同步观影应用。它可以让两个人进入同一个房间，绝对精确地同步播放进度、发送聊天/弹幕、加载本地或网络视频，并通过 WebRTC 直接进行高清连麦通话。

本项目采用彻底去中心化的本地直连思路，**不上传任何本地文件**，服务端仅负责 WebSocket 状态同步和 WebRTC 信令转发，最大限度保护您的隐私。

## ✨ 核心特性

- **极致同步体验**：毫秒级时差对齐，播放、暂停、拖动进度、倍速均双向同步。
- **本地电影共享**：双方各自选择同一本地文件，即可同步观看（文件绝不上云）。
- **网络流与 B 站支持**：支持直链解析，支持 B 站链接加载及历史弹幕显示。
- **毛玻璃暗黑美学**：极具现代感的沉浸式全屏界面（Tailwind + Glassmorphism）。
- **防打扰 WebRTC 连麦**：原生点对点高清语音视频连麦，开启时自动压低电影音量。
- **弹幕与聊天**：实时文字聊天化作弹幕飘过，区分你我（紫色与蜜桃粉专属发光）。
- **双端播放引擎**：自带 HTML5 原生播放器，同时支持通过 IPC 挂载发烧级 `mpv` 播放器解决浏览器解码限制。
- **严格人数限制**：服务端硬件级校验，房间最多允许 2 人，房主拥有绝对控制与审核权，杜绝第三方偷窥。

## 🚀 快速开始

本项目自带原生的 Desktop App（桌面客户端），推荐使用桌面端以获得最佳的跨域权限和本地视频解码体验。

### 1. 环境准备
- 安装 [Node.js](https://nodejs.org/) (建议 18 或更高版本)

### 2. 获取代码与安装依赖
```bash
git clone https://github.com/your-username/remote-co-viewing.git
cd remote-co-viewing
npm install
```

### 3. 运行本地客户端
在 Windows 系统下，你可以直接双击目录中的：
`双击运行.bat`

或者在终端中运行：
```bash
npm run desktop:dev
```
这会同时启动本地同步服务端（默认 `5050` 端口）并弹出桌面应用程序窗口。

---

## 🌍 如何与异地朋友连接？

默认情况下，程序运行在你的本地 `127.0.0.1:5050`。**这个本地地址无法发给远方的朋友。**
要让异地朋友连上你的房间，你需要提供一个可公开访问的公网地址：

### 推荐方案（安全优先）
由于 WebRTC 连麦（麦克风/摄像头）在现代浏览器中**强制要求 HTTPS** 协议，强烈建议你使用以下带有 HTTPS 的内网穿透工具或组网方案：
- **Cloudflare Tunnel (推荐)**：免费、配置简单，提供稳定的 HTTPS 域名。
- **ngrok** 或 **cpolar**：快速映射本地 `5050` 端口到公网。
- **Tailscale / ZeroTier**：与朋友组建虚拟局域网。

### 配置公网地址
获得公网地址后（例如 `https://my-room.ngrok.app` 或 `wss://my-room.ngrok.app/ws`）：
1. 在右侧【房间与配置】栏中，将“服务器”输入框的值修改为你的公网地址。
2. 点击【复制】图标，将生成的邀请链接发给朋友。
3. 朋友在普通浏览器中打开链接，即可向你发送“敲门”请求。

*注：局域网内可直接使用你的局域网 IP（例如 `192.168.1.100:5050`）访问，无需穿透。*

---

## ⚙️ 项目配置 (.env)

项目支持通过根目录下的 `.env` 文件进行快速个性化配置。
1. 将项目根目录下的 `.env.example` 复制并重命名为 `.env`。
2. 根据需要修改以下配置项：
   * `PORT`：本地同步服务器运行的端口（默认 `5050`）。
   * `SYNC_CINEMA_MPV_PATH`：自定义 `mpv` 播放器可执行文件的绝对路径。

---

## 🎬 关于 MPV 模式 (高级视频解码)

如果您选择的本地电影是 `mkv`、`H.265 / HEVC` 视频或带有 `DTS` / `AC3` 复杂杜比音轨的极客级视频，由于 Electron 内置播放器（Chromium 核心）存在版权和解码限制，可能会出现**黑屏无画面**或**无声**。

为了完美解决此问题，本项目支持通过本地 IPC 管道直接挂载发烧级开源播放器 **`mpv`** 进行同步播放。

### 1. 下载并安装 mpv
本项目发布包不包含庞大的 `mpv` 播放器。请先安装它：
* **Windows 用户**：前往 [mpv.io 官网下载页](https://mpv.io/installation/)（或推荐 [shinchiro 编译版](https://sourceforge.net/projects/mpv-player-windows/files/)），下载后解压到本地任意文件夹（例如 `C:\Tools\mpv\`）。
* **Mac 用户**：可以使用 Homebrew 快速安装：`brew install mpv`
* **Linux 用户**：使用包管理器安装，例如：`sudo apt install mpv`

### 2. 配置应用关联 mpv（三种方案任选其一）
桌面端在启动 mpv 模式时会按照以下顺序自动检索 `mpv` 的路径：
* **方案 A（最推荐，免配环境变量）**：复制根目录的 `.env.example` 为 `.env`，然后在其中填写你的 `mpv.exe` 路径：
  ```ini
  SYNC_CINEMA_MPV_PATH=C:\Tools\mpv\mpv.exe
  ```
* **方案 B（配置系统 Path）**：将 `mpv` 所在的文件夹路径（例如 `C:\Tools\mpv\`）添加到系统的**环境变量 `PATH`** 中。
* **方案 C（默认自动搜索路径）**：直接将 `mpv.exe` 安装或放置在以下默认搜索路径中，程序会自动识别：
  * `C:\Program Files\mpv\mpv.exe`
  * `C:\Program Files (x86)\mpv\mpv.exe`
  * Scoop 默认安装路径、Chocolatey 默认安装路径等。

### 3. 如何使用
当您在桌面端加载 mkv 等复杂视频时，系统会自动检测并提示您。点击网页底部的**「使用受控 mpv 同步模式（第一版）」**按钮，程序便会为您和好友自动唤起 `mpv` 独立播放窗口，并使用当前网页作为遥控器同步两端的播放、暂停和进度拖拽。

## 🔒 隐私与安全性申明

1. **零文件上传**：你加载的所有本地视频仅在你本机的内存中解析，绝不会通过网络传输给对方。
2. **P2P 连麦**：音视频流由浏览器直连（WebRTC），服务端仅作中转红娘，不留存任何音视频数据。
3. **严格鉴权**：房间采用房主审核制与严格的 2 人限制，未审批人员无法截获或发送任何房间指令。

## License

This project is licensed under the GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later).

You may use, study, modify, and distribute this project under the terms of the AGPL. If you distribute a modified version, or run a modified version as a network service for users, you must provide the corresponding source code under the same license.

Copyright (C) 2026 Q Credit.
