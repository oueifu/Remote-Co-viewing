# 公网访问指南

这个项目已经具备公网接入所需的基础能力，不需要改动核心同步协议：

- 服务端端口优先读取 `process.env.PORT`
- HTTP 和 WebSocket 复用同一个 Node `server`
- 前端会根据当前页面协议自动拼接默认 WebSocket 地址
  - `http://...` 对应 `ws://.../ws`
  - `https://...` 对应 `wss://.../ws`

这意味着本地直连、ngrok、cpolar、Cloudflare Tunnel、Render、Railway 这几类接入方式都能直接兼容。

如果你准备用 Tailscale，请直接看更完整的 [README_TAILSCALE.md](./README_TAILSCALE.md)。

## 方案 1：ngrok

1. 启动项目

```powershell
npm start
```

默认本地地址：

```text
http://127.0.0.1:5050
```

2. 配置 ngrok token

```powershell
ngrok config add-authtoken <你的 token>
```

3. 暴露本地端口

```powershell
ngrok http 5050
```

4. 把 ngrok 输出的 `https://xxxx.ngrok-free.app` 发给对方

页面通过这个 HTTPS 地址访问时，前端会自动使用 `wss://xxxx.ngrok-free.app/ws`，不会触发浏览器的混合内容拦截。

## 方案 2：cpolar

1. 启动项目

```powershell
npm start
```

2. 暴露本地端口

```powershell
cpolar http 5050
```

3. 把 cpolar 输出的公网 HTTPS 地址发给对方

和 ngrok 一样，前端会自动切到 `wss://`。

## 方案 3：Cloudflare Tunnel

1. 启动项目

```powershell
npm start
```

2. 安装 `cloudflared`

Windows 示例：

```powershell
winget install Cloudflare.cloudflared
```

3. 临时启动隧道

```powershell
cloudflared tunnel --url http://127.0.0.1:5050
```

4. 如果你有自己的 Cloudflare 域名，也可以创建命名 tunnel，把域名指向本地 `5050`

当前服务端没有做 `Origin` / `Host` 白名单校验，也没有依赖真实客户端 IP 做 WebSocket 拒绝逻辑，所以 Cloudflare 代理回源不会被当前代码拦住。

## 方案 4：云端平台

这个项目已经满足 Render / Railway / Zeabur 一类平台的基本要求：

- 监听 `process.env.PORT`
- WebSocket 绑定在同一个 HTTP server 上
- 前端默认按当前域名构造 WebSocket 地址

启动命令直接使用：

```powershell
npm start
```

## WebRTC 连麦

项目默认内置了公共 STUN：

- `stun:stun.l.google.com:19302`
- `stun:stun1.l.google.com:19302`

如果项目切到真正的公网环境后，聊天和同步正常、但连麦失败，通常是双方 NAT 太严格，需要 TURN。

当前版本已经留出 `iceServers` 配置入口，不必修改源码，可以用下面两种方式覆盖默认 STUN。

### 方式 A：URL 参数

逗号分隔：

```text
https://your-domain.example/?room=movie-room&ice=stun:stun.l.google.com:19302,turn:turn.example.com:3478
```

JSON：

```text
https://your-domain.example/?ice=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.example.com:3478","username":"user","credential":"pass"}]
```

### 方式 B：浏览器 localStorage

在浏览器控制台执行：

```javascript
localStorage.setItem(
  "sync-ice-servers",
  JSON.stringify([
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "turn:turn.example.com:3478", username: "user", credential: "pass" }
  ])
);
location.reload();
```

清除自定义 ICE 配置：

```javascript
localStorage.removeItem("sync-ice-servers");
location.reload();
```

## 排查建议

- 页面能打开但房间连不上：优先检查浏览器控制台里是否出现 `ws://` / `wss://` 连接错误
- HTTPS 页面下若强行填写 `ws://...`：浏览器会拦截，应该改成 `wss://...`
- 聊天和同步正常但连麦失败：优先补 TURN
- B 站解析失败：通常是接口超时、限流，或者返回了音视频分离的 DASH
