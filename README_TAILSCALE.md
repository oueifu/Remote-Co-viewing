# Tailscale 使用指南

这份指南适合把当前项目分享给另一位用户远程一起看视频。

你有两种用法：

- `Tailscale Serve`：只有加入你 Tailscale 网络的人能访问，适合你和朋友都安装 Tailscale。
- `Tailscale Funnel`：生成一个公开 `https://...ts.net` 地址，对方不装 Tailscale 也能打开。

如果你要用网页连麦，优先用 `Serve` 或 `Funnel` 的 `HTTPS` 地址，不要直接发 `http://100.x.x.x:5050`，否则浏览器可能拒绝摄像头和麦克风权限。

## 1. 主持人安装 Tailscale

### Windows

1. 打开 Tailscale 下载页：<https://tailscale.com/download>
2. 下载 Windows 安装包并运行。
3. 安装完成后，在系统托盘里找到 Tailscale 图标。
4. 右键图标，点击 `Log in`，按提示在浏览器里登录。

### macOS / iPhone / Android

直接打开下载页选择对应平台安装：

- <https://tailscale.com/download>

如果朋友也要加入你的私有 Tailscale 网络，他也需要安装并登录到同一个 tailnet。

## 2. 确认 Tailscale 已连接

在主持人电脑上打开 PowerShell，执行：

```powershell
tailscale status
```

看到设备在线即可。

如果提示找不到 `tailscale` 命令，通常是：

- Tailscale 还没安装完成
- 刚安装完，还没重新打开终端

## 3. 启动这个项目

在项目目录执行：

```powershell
npm install
npm start
```

默认本地服务地址是：

```text
http://127.0.0.1:5050
```

## 4. 方案 A：只给安装了 Tailscale 的朋友用

这种方式最稳，适合双方都装了 Tailscale。

### 第一步：开启 HTTPS 代理

在主持人电脑上执行：

```powershell
tailscale serve --bg 5050
```

第一次运行时，Tailscale 可能会自动弹出网页，让你确认启用 HTTPS / MagicDNS。按页面提示点确认即可。

成功后，终端会显示一个 `https://<设备名>.<tailnet>.ts.net` 地址。

把这个 `https://...ts.net` 地址发给朋友。

### 第二步：朋友访问

朋友需要：

1. 安装 Tailscale
2. 登录到同一个 tailnet
3. 直接打开你发过去的 `https://...ts.net`

### 第三步：停止共享

不用时执行：

```powershell
tailscale serve off
```

如果你想先看当前配置：

```powershell
tailscale serve status
```

## 5. 方案 B：朋友不装 Tailscale，直接公网打开

这种方式适合你只想发一个链接给对方。

### 第一步：开启 Funnel

在主持人电脑上执行：

```powershell
tailscale funnel --bg 5050
```

第一次运行时，Tailscale 会引导你在浏览器里确认：

- 启用 HTTPS 证书
- 允许当前 tailnet 使用 Funnel

确认完成后，终端会显示一个公开的 `https://...ts.net` 地址。

把这个地址发给朋友即可。对方不需要安装 Tailscale。

### 第二步：停止 Funnel

不用时执行：

```powershell
tailscale funnel off
```

## 6. 在这个项目里怎么用

无论你用 `Serve` 还是 `Funnel`，打开页面后的操作都一样：

1. 主持人和朋友都打开同一个 `https://...ts.net` 地址。
2. 填同一个房间名。
3. 各自填昵称。
4. 点击 `连接`。
5. 主持人同意加入申请。
6. 主持人加载网络视频，或双方各自选择同一个本地视频文件。
7. 如果要连麦，点击 `连麦`，浏览器弹权限时允许麦克风/摄像头。

注意：

- 本地视频文件不会自动传给对方，双方需要各自选同一个文件。
- 如果切换了新链接，当前版本会从 `0` 开始播放。
- 如果聊天/同步正常但连麦失败，优先检查 ICE / TURN 配置。

## 7. 推荐的 Tailscale 使用方式

### 你和朋友都能安装 Tailscale

优先用：

```powershell
tailscale serve --bg 5050
```

优点：

- 更稳
- 只有 tailnet 成员能访问
- 不需要把页面公开到整个互联网

### 朋友不想装 Tailscale

用：

```powershell
tailscale funnel --bg 5050
```

优点：

- 发一个公网链接就能用

缺点：

- 地址是公开可访问的
- 更依赖 Tailscale 的公网入口

## 8. 常见问题

### 1）页面能打开，但连不上房间

先确认项目服务还在运行：

```powershell
npm start
```

再确认 Tailscale 共享还在：

```powershell
tailscale serve status
```

或者：

```powershell
tailscale funnel status
```

### 2）能进房间，但连麦打不开

优先检查：

- 你们打开的是不是 `https://...ts.net`
- 浏览器有没有弹出麦克风/摄像头权限
- 是否在系统里禁用了浏览器摄像头或麦克风权限

### 3）聊天和同步正常，但连麦失败

这通常不是 Tailscale 页面暴露失败，而是 WebRTC 打洞或 TURN 问题。

当前项目支持自定义 ICE：

- URL 参数 `?ice=...`
- 浏览器 `localStorage` 中的 `sync-ice-servers`

### 4）朋友打开链接提示无权限

如果你用的是 `Serve`，说明朋友没有加入你的 tailnet，或者账号不在同一个 tailnet。

这种情况下：

- 让朋友安装 Tailscale 并加入同一个 tailnet
- 或改用 `tailscale funnel 5050`

## 9. 最省事的推荐流程

### 双方都装 Tailscale

1. 主持人安装并登录 Tailscale
2. 朋友安装并登录 Tailscale
3. 主持人运行项目：`npm start`
4. 主持人执行：`tailscale serve --bg 5050`
5. 把 `https://...ts.net` 发给朋友
6. 双方打开后进同一房间

### 只有主持人装 Tailscale

1. 主持人安装并登录 Tailscale
2. 主持人运行项目：`npm start`
3. 主持人执行：`tailscale funnel --bg 5050`
4. 把 `https://...ts.net` 发给朋友
5. 双方打开后进同一房间
