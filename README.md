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

## 🎬 关于 MPV 模式 (高级用户)

如果你要观看的本地电影是 `mkv`, `hevc`, `H.265`, `10bit` 或带有复杂杜比音轨的极客级视频，浏览器的原生解码器可能会出现无画面或无声音。此时你可以使用 `mpv` 模式。

1. **下载 mpv**: 本源码不包含庞大的 `mpv.exe`。请前往 [mpv 官网](https://mpv.io/) 下载，并将其解压路径配置到系统环境变量 `PATH` 中。
2. **启动模式**: 在应用内遇到解码失败提示时，请按提示操作或在命令行中手动启动 mpv 客户端模式。

## 🔒 隐私与安全性申明

1. **零文件上传**：你加载的所有本地视频仅在你本机的内存中解析，绝不会通过网络传输给对方。
2. **P2P 连麦**：音视频流由浏览器直连（WebRTC），服务端仅作中转红娘，不留存任何音视频数据。
3. **严格鉴权**：房间采用房主审核制与严格的 2 人限制，未审批人员无法截获或发送任何房间指令。

## License

This project is licensed under the GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later).

You may use, study, modify, and distribute this project under the terms of the AGPL. If you distribute a modified version, or run a modified version as a network service for users, you must provide the corresponding source code under the same license.

Copyright (C) 2026 Q Credit.
