# Remote Co-viewing (远程同步看视频) `v0.9.0-beta.1 (Experimental Preview)`

一个轻量级、高颜值的异地双人协同观影应用。支持两人在专属房间内同步播放进度、发送实时弹幕/聊天、加载本地或网络片源，并通过 WebRTC 直连进行音视频连麦。

本项目采用本地零上传架构，**本地视频文件绝对不上传云端**，服务端仅负责信令与播放时钟状态分发，最大限度保护双方隐私。对部分受防盗链限制的第三方在线流，服务端仅提供实时无状态的 Header 转发代理，不落盘存储任何视频数据。

## ✨ 核心特性

- **平滑时钟同步**：基于多样本 NTP Ping-Pong 时钟偏差与 RTT 补偿算法，配合 `0.25s ~ 2.0s` 渐进式平滑追赶（1.04x/0.96x），在正常网络下提供毫秒级平滑校准，大幅降低硬 Seek 爆音。
- **本地电影零上传**：双方选择本地相同视频文件即可同步观看，视频内容绝不上云，保障隐私与零流量成本。
- **协同控制与版本仲裁**：单调递增 `stateVersion` 与 `roomEpoch` 机制，支持双方协同控制，自动拦截乱序与过期网络包。
- **4 位极简房间与一键分享**：默认生成 4 位简短数字房间码，支持 🎲 随机刷新与中文房间名，打开即连。
- **双端播放引擎**：内置原生 HTML5 播放器，并在桌面端通过 IPC 管道无缝挂载发烧级 `mpv` 播放器解决 H.265 / DTS 格式解码。
- **WebRTC 实时双向连麦**：集成 Google / Cloudflare / 小米等公共高可用 STUN 穿透，双向音视频对通，连麦时自动压低电影音量（Audio Ducking）。
- **运行边界物理隔离**：明确区分 `desktop-local`（本地回环安全模式）与 `hosted-relay`（公网安全中继模式），杜绝公网越权执行本地进程。

## 🚀 快速开始

本项目自带原生的 Desktop App（桌面客户端），推荐使用桌面端以获得最佳的跨域权限和本地视频解码体验。

### 1. 环境准备
- 安装 [Node.js](https://nodejs.org/) (建议 Node 22 或更高 LTS 版本)

### 2. 获取代码与安装依赖
```bash
git clone https://github.com/oueifu/Remote-Co-viewing.git
cd Remote-Co-viewing
npm install
```

### 3. 运行自动化测试与代码检查
```bash
npm test
npm run check
```

### 4. 运行本地客户端
在 Windows 系统下，你可以直接双击目录中的：
`双击运行.bat`

或者在终端中运行：
```bash
npm run desktop:dev
```
这会同时启动本地同步服务端（默认 `5050` 端口）并弹出桌面应用程序窗口。

---

## 🌍 如何与异地朋友连接？

默认情况下，程序运行在你的本地 `127.0.0.1:5050`。**这个本地地址无法直接发给公网远方朋友。**
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
3. 朋友在普通浏览器中打开链接，即可向你发送“敲门”申请。

*注：局域网内如需直接使用你的局域网 IP（例如 `192.168.1.100:5050`）访问，由于服务端默认仅绑定本地回环 `127.0.0.1`，请在 `.env` 中设置 `BIND_HOST=0.0.0.0`。*

---

## ⚙️ 项目配置 (.env)

项目支持通过根目录下的 `.env` 文件进行快速个性化配置。
1. 将项目根目录下的 `.env.example` 复制并重命名为 `.env`。
2. 根据需要修改以下配置项：
   * `PORT`：本地同步服务器运行端口（Node 独立运行模式，默认 `5050`）。
   * `SYNC_CINEMA_PORT`：桌面客户端（Electron 模式）运行端口（默认 `5050`，启动时会自动同步覆盖子进程 `PORT`）。
   * `BIND_HOST`：服务端监听 IP 地址（默认 `127.0.0.1`；局域网联机访问请设置为 `0.0.0.0`）。
   * `SYNC_CINEMA_MPV_PATH`：自定义 `mpv` 播放器可执行文件的绝对路径。

---

## 🎬 关于 MPV 模式 (高级视频解码)

如果您选择的本地电影是 `mkv`、`H.265 / HEVC` 视频或带有 `DTS` / `AC3` 复杂杜比音轨的极客级视频，由于 Electron 内置播放器（Chromium 核心）存在版权和解码限制，可能会出现**黑屏无画面**或**无声**。

为了解决此问题，本项目支持通过本地 IPC 管道直接挂载发烧级开源播放器 **`mpv`** 进行同步播放。

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

## 🔒 隐私与数据流申明

1. **本地视频模式（零上传、零中继）**：双方选择本地相同视频文件时，视频文件完全在你本机的本地进程中读取播放，绝不上云，视频二进制文件绝不会上传或中继给任何服务器。
2. **在线流媒体辅助模式（实时 Header 转发代理）**：对于 B 站等第三方公有在线流，由于浏览器端存在防盗链 Referer 限制，服务端仅作为无状态的实时请求头转发代理（`/proxy-video`），数据流直接透传给浏览器，绝不进行任何落盘存储或内容持久化。
3. **房间元数据交互**：为实现协同播放与连麦，经房主审批同意后，房内双方会互相共享：你的昵称、聊天消息、所选视频文件名/时长/文件大小（用于两端校验文件一致性）、播放进度时间戳以及 WebRTC ICE 连接候选。
4. **P2P 连麦**：音视频流由浏览器 P2P 直连传输（WebRTC），服务端仅作信令交换，不留存或录制任何音视频数据。
5. **房主审核与人数限制**：房间采用房主审核制与 2 人上限，未经批准的连接无法操作房间。

## ⚠️ 免责声明 (Disclaimer)

1. **用途限制**：本项目及其配套浏览器辅助扩展仅供技术研究、学习交流及合法授权的个人/双人私密同步观影使用。使用者应当严格遵守所在国家或地区的法律法规。
2. **零存储与零版权分发**：本项目服务端仅充当信令与播放时间戳同步中继，不存储、不提供、不抓取、亦不分发任何音视频资源文件。所有音视频内容均由用户本地提供或直接由第三方公有流媒体提供。
3. **第三方平台条款**：项目中的第三方平台辅助脚本（如 Bilibili 扩展）仅用于学习浏览器扩展与直链处理机制，不包含任何破解、解密（DRM Bypass）或绕过付费会员鉴权的功能。使用该功能时请尊重并遵守相关第三方的服务协议与版权声明。因使用不当而产生的任何法律责任均由使用者自行承担。

## 🤝 参与贡献与社区规范

- **代码规范与测试**：提交代码前请确保运行 `npm test` 和 `npm run check` 并通过。详情参见 [CONTRIBUTING.md](CONTRIBUTING.md)。
- **安全漏洞披露**：如发现安全漏洞，请勿公开提 Issue，请按照 [SECURITY.md](SECURITY.md) 的流程进行私密通报。

## License

This project is licensed under the GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later).

You may use, study, modify, and distribute this project under the terms of the AGPL. If you distribute a modified version, or run a modified version as a network service for users, you must provide the corresponding source code under the same license.

Copyright (C) 2026 Q Credit.
