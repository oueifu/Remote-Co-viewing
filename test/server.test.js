// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Q Credit

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const path = require("node:path");
const WebSocket = require("ws");

const TEST_PORT = 15890;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const WS_URL = `ws://127.0.0.1:${TEST_PORT}/ws`;

let serverProcess = null;

function httpGetJson(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${urlPath}`, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (err) {
          reject(new Error(`Failed to parse JSON: ${data}`));
        }
      });
    }).on("error", reject);
  });
}

function httpGetRaw(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${urlPath}`, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    }).on("error", reject);
  });
}

function createWsClient() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

function waitForMessage(ws, predicate, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error(`Timed out waiting for message after ${timeoutMs}ms`));
    }, timeoutMs);

    function onMessage(raw) {
      try {
        const msg = JSON.parse(raw.toString());
        if (predicate(msg)) {
          clearTimeout(timer);
          ws.off("message", onMessage);
          resolve(msg);
        }
      } catch {}
    }

    ws.on("message", onMessage);
  });
}

describe("SyncCinema Server & Protocol Test Suite", () => {
  before(async () => {
    serverProcess = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        BIND_HOST: "127.0.0.1"
      },
      stdio: "pipe"
    });

    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      try {
        const res = await httpGetJson("/healthz");
        if (res.status === 200) return;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    throw new Error("Server failed to start in time for testing");
  });

  after(() => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill();
    }
  });

  describe("Health & Diagnostics Endpoints", () => {
    it("GET /healthz returns status ok, version 0.9.0-beta.3, and desktop-local mode", async () => {
      const res = await httpGetJson("/healthz");
      assert.equal(res.status, 200);
      assert.equal(res.data.status, "ok");
      assert.equal(res.data.version, "0.9.0-beta.3");
      assert.equal(res.data.mode, "desktop-local");
    });

    it("GET /livez and /readyz return valid 200 JSON", async () => {
      const livez = await httpGetJson("/livez");
      assert.equal(livez.status, 200);
      assert.equal(livez.data.status, "ok");

      const readyz = await httpGetJson("/readyz");
      assert.equal(readyz.status, 200);
      assert.equal(readyz.data.status, "ok");
    });

    it("GET /api/config returns default limits without author bypass", async () => {
      const res = await httpGetJson("/api/config");
      assert.equal(res.status, 200);
      assert.equal(res.data.bypassLimits, false);
      assert.equal(res.data.maxOccupancy, 2);
    });

    it("GET /api/ice-servers returns STUN/TURN configuration array", async () => {
      const res = await httpGetJson("/api/ice-servers");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.iceServers));
      assert.ok(res.data.iceServers.length > 0);
      assert.ok(res.data.iceServers.some((s) => typeof s.urls === "string" && s.urls.startsWith("stun:")));
    });

    it("GET /api/stats returns server metrics JSON", async () => {
      const res = await httpGetJson("/api/stats");
      assert.equal(res.status, 200);
      assert.ok(typeof res.data.activeRooms === "number");
      assert.ok(typeof res.data.totalConnections === "number");
      assert.equal(res.data.version, "0.9.0-beta.3");
    });

    it("GET /metrics returns Prometheus formatted plaintext metrics", async () => {
      const res = await httpGetRaw("/metrics");
      assert.equal(res.status, 200);
      assert.match(res.headers["content-type"], /text\/plain/);
      assert.match(res.body, /sync_active_rooms/);
      assert.match(res.body, /sync_total_messages/);
    });
  });

  describe("WebSocket Room Lifecycle & Approval Flow", () => {
    it("Host creates room and guest is approved by host", async () => {
      const roomId = `room-${Date.now()}`;
      const hostWs = await createWsClient();

      hostWs.send(JSON.stringify({ type: "join", room: roomId, name: "AliceHost" }));
      const hostJoined = await waitForMessage(hostWs, (m) => m.type === "joined");
      assert.equal(hostJoined.isHost, true);
      assert.equal(hostJoined.room, roomId);
      assert.ok(hostJoined.roomEpoch);
      assert.ok(hostJoined.stateVersion >= 1);
      assert.ok(hostJoined.mediaVersion >= 1);

      const guestWs = await createWsClient();
      guestWs.send(JSON.stringify({ type: "join", room: roomId, name: "BobGuest" }));

      const guestPendingPromise = waitForMessage(guestWs, (m) => m.type === "join_pending");
      const hostRequestPromise = waitForMessage(hostWs, (m) => m.type === "join_request");

      const [guestPending, hostRequest] = await Promise.all([guestPendingPromise, hostRequestPromise]);
      assert.equal(guestPending.room, roomId);
      assert.equal(hostRequest.requester.name, "BobGuest");

      hostWs.send(JSON.stringify({
        type: "review_result",
        targetId: hostRequest.requester.id,
        approved: true
      }));

      const guestJoined = await waitForMessage(guestWs, (m) => m.type === "joined");
      assert.equal(guestJoined.isHost, false);
      assert.equal(guestJoined.room, roomId);

      hostWs.close();
      guestWs.close();
    });

    it("Rejects third user when room already has 2 members", async () => {
      const roomId = `room-full-${Date.now()}`;
      const hostWs = await createWsClient();
      hostWs.send(JSON.stringify({ type: "join", room: roomId, name: "Host1" }));
      await waitForMessage(hostWs, (m) => m.type === "joined");

      const guest1Ws = await createWsClient();
      guest1Ws.send(JSON.stringify({ type: "join", room: roomId, name: "Guest1" }));
      const hostReq = await waitForMessage(hostWs, (m) => m.type === "join_request");
      hostWs.send(JSON.stringify({ type: "review_result", targetId: hostReq.requester.id, approved: true }));
      await waitForMessage(guest1Ws, (m) => m.type === "joined");

      const guest2Ws = await createWsClient();
      guest2Ws.send(JSON.stringify({ type: "join", room: roomId, name: "Guest2" }));
      const errorMsg = await waitForMessage(guest2Ws, (m) => m.type === "error");
      assert.match(errorMsg.message, /房间人数已满/);

      hostWs.close();
      guest1Ws.close();
      guest2Ws.close();
    });
  });

  describe("Playback Control, Video Loading & State Versioning", () => {
    it("Broadcasting playback control increments stateVersion monotonically", async () => {
      const roomId = `sync-room-${Date.now()}`;
      const hostWs = await createWsClient();
      hostWs.send(JSON.stringify({ type: "join", room: roomId, name: "Host" }));
      const joined = await waitForMessage(hostWs, (m) => m.type === "joined");
      const initialVersion = joined.stateVersion;

      hostWs.send(JSON.stringify({
        type: "control",
        time: 55.5,
        paused: false,
        rate: 1.0,
        reason: "play"
      }));

      const stateMsg = await waitForMessage(hostWs, (m) => m.type === "state" && m.reason === "play");
      assert.ok(Math.abs(stateMsg.state.time - 55.5) < 0.05, `Expected state.time ~ 55.5, got ${stateMsg.state.time}`);
      assert.equal(stateMsg.state.paused, false);
      assert.ok(stateMsg.stateVersion > initialVersion);
      assert.ok(stateMsg.roomEpoch);

      hostWs.close();
    });

    it("load_video_request broadcasts load_video with roomEpoch, stateVersion, mediaVersion", async () => {
      const roomId = `media-room-${Date.now()}`;
      const hostWs = await createWsClient();
      hostWs.send(JSON.stringify({ type: "join", room: roomId, name: "Host" }));
      await waitForMessage(hostWs, (m) => m.type === "joined");

      hostWs.send(JSON.stringify({
        type: "load_video_request",
        url: "https://example.com/movie.mp4",
        title: "Test Feature Film"
      }));

      const loadMsg = await waitForMessage(hostWs, (m) => m.type === "load_video");
      assert.equal(loadMsg.url, "https://example.com/movie.mp4");
      assert.equal(loadMsg.title, "Test Feature Film");
      assert.ok(loadMsg.roomEpoch);
      assert.ok(typeof loadMsg.stateVersion === "number");
      assert.ok(typeof loadMsg.mediaVersion === "number");

      hostWs.send(JSON.stringify({ type: "request-state" }));
      const stateMsg = await waitForMessage(hostWs, (m) => m.type === "state" && m.reason === "request");
      assert.ok(stateMsg.roomEpoch);
      assert.ok(typeof stateMsg.stateVersion === "number");
      assert.ok(typeof stateMsg.mediaVersion === "number");
      assert.equal(stateMsg.media.url, "https://example.com/movie.mp4");

      hostWs.close();
    });
  });

  describe("Security Boundaries", () => {
    it("Enforces maxPayload: 64KB (rejects oversized messages at transport layer)", async () => {
      const ws = await createWsClient();
      const oversizedPayload = "A".repeat(70000);

      const closePromise = new Promise((resolve) => {
        ws.on("close", (code) => resolve(code));
      });

      ws.send(JSON.stringify({ type: "chat", text: oversizedPayload }));
      const closeCode = await closePromise;
      assert.ok(closeCode === 1009 || closeCode === 1006);
    });

    it("Sanitizes WebRTC signaling messages and strips unwhitelisted fields", async () => {
      const roomId = `rtc-room-${Date.now()}`;
      const hostWs = await createWsClient();
      hostWs.send(JSON.stringify({ type: "join", room: roomId, name: "Host" }));
      await waitForMessage(hostWs, (m) => m.type === "joined");

      const guestWs = await createWsClient();
      guestWs.send(JSON.stringify({ type: "join", room: roomId, name: "Guest" }));
      const hostReq = await waitForMessage(hostWs, (m) => m.type === "join_request");
      hostWs.send(JSON.stringify({ type: "review_result", targetId: hostReq.requester.id, approved: true }));
      await waitForMessage(guestWs, (m) => m.type === "joined");

      hostWs.send(JSON.stringify({
        type: "rtc_offer",
        offer: { type: "offer", sdp: "v=0\r\no=test 123" },
        maliciousToken: "secret_hacker_code",
        adminBypass: true
      }));

      const receivedOffer = await waitForMessage(guestWs, (m) => m.type === "rtc_offer");
      assert.equal(receivedOffer.type, "rtc_offer");
      assert.equal(receivedOffer.offer.sdp, "v=0\r\no=test 123");
      assert.equal(receivedOffer.sender.name, "Host");
      assert.equal(receivedOffer.maliciousToken, undefined);
      assert.equal(receivedOffer.adminBypass, undefined);

      hostWs.close();
      guestWs.close();
    });

    it("Room 1024 has no author backdoor", async () => {
      const ws = await createWsClient();
      ws.send(JSON.stringify({
        type: "join",
        room: "1024",
        name: "NormalUser"
      }));

      const msg = await waitForMessage(ws, (m) => m.type === "joined");
      assert.equal(msg.room, "1024");
      assert.equal(msg.isHost, true);
      ws.close();
    });

    it("Rejects WebSocket connection from unauthorized Origin", async () => {
      await assert.rejects(
        () => new Promise((resolve, reject) => {
          const ws = new WebSocket(WS_URL, {
            headers: {
              Origin: "https://attacker.invalid"
            }
          });
          ws.on("open", () => {
            ws.close();
            resolve();
          });
          ws.on("error", (err) => {
            reject(err);
          });
        }),
        /403|Unexpected server response/
      );
    });

    it("Rejects /api/launch-mpv without valid loopback token", async () => {
      const res = await httpGetJson("/api/launch-mpv?file=test.mp4");
      assert.equal(res.status, 401);
      assert.match(res.data.error, /Unauthorized/);
    });

    it("Handles malformed URI gracefully with 400 Bad Request and does not crash", async () => {
      const res = await httpGetRaw("/%E0%A4%A");
      assert.equal(res.status, 400);
      assert.match(res.body, /Malformed URI/);

      const health = await httpGetJson("/healthz");
      assert.equal(health.status, 200);
      assert.equal(health.data.status, "ok");
    });
  });
});
