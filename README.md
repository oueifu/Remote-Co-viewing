# Remote Synchronized Video Viewing

这是一个轻量级的本地文件视频同步工具。双方各自在本机选择已下载的电影文件，服务端仅同步播放状态，不传输视频数据。

## 功能亮点

- 同步播放/暂停、进度调整、播放速度
- 浏览器端本地播放支持常见视频格式
- mpv 模式支持更多容器和编解码器
- 支持跨房间远程观看，只同步状态，不访问视频文件

## 目录结构

- `server.js`：Web 服务器和 WebSocket 状态同步服务
- `public/`：浏览器客户端页面和 JS
- `mpv-client.js`：基于 mpv 的桌面客户端，用于更稳的本地播放控制
- `package.json`：项目元数据

## 运行要求

- Node.js 18 或更高版本
- 推荐使用 `mpv` 进行 `.mkv`、H.265、特殊音轨等格式播放

## 本地浏览器模式

1. 安装依赖：

```powershell
npm install
```

2. 启动服务：

```powershell
npm start
```

3. 打开浏览器：

```text
http://localhost:5050
```

4. 进入页面后选择本地视频文件，并填写相同房间名。

## mpv 模式（推荐用于高兼容性）

当浏览器播放受限时，推荐使用 `mpv`：

1. 安装 mpv，并确保命令行可以运行 `mpv`
2. 启动服务端：

```powershell
npm start
```

3. 客户端运行：

```powershell
npm run mpv -- --server ws://服务器地址:5050/ws --room movie-room --name 我的名字 --file "电影文件路径"
```

示例：

```powershell
npm run mpv -- --server ws://127.0.0.1:5050/ws --room movie-room --name Windows --file "D:\Movies\movie.mkv"
```

Mac 示例：

```bash
npm run mpv -- --server ws://服务器地址:5050/ws --room movie-room --name Mac --file "/Users/me/Movies/movie.mkv"
```

## 远程观看

远程两端需要访问到同一个服务端地址。常见方案：

- 将项目部署在云服务器
- 在一方机器上运行并转发 `5050` 端口
- 使用 Tailscale、ZeroTier、Cloudflare Tunnel、ngrok 等隧道服务

另一方打开：

```text
http://你的服务器地址:5050
```

并使用同一房间名，例如 `movie-room`。

## 注意事项

- 双方最好使用完全相同的视频文件，避免进度和片长差异
- 浏览器本身对部分格式支持有限，`mp4`、`webm`、`mov` 通常更稳定
- `mkv`、`rmvb`、H.265 等格式建议使用 `mpv`
- 如果浏览器阻止自动播放，点击播放按钮后再进行同步

## 命令

```powershell
npm run check
```

该命令用于检查 `server.js`、`mpv-client.js` 和 `public/app.js` 的语法。

## 许可

MIT License。欢迎根据需要修改和使用。
