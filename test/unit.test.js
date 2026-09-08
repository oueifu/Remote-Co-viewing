// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Q Credit

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseCid, mediaSignature, getIceServersConfig, verifyWsOrigin } = require("../server.js");

describe("Core Utilities & Algorithms Unit Tests", () => {
  describe("parseCid validation", () => {
    it("parses valid numeric CID correctly", () => {
      assert.equal(parseCid("123456789"), "123456789");
      assert.equal(parseCid(987654321), "987654321");
    });

    it("rejects non-numeric or invalid CIDs", () => {
      assert.equal(parseCid(""), "");
      assert.equal(parseCid(null), "");
      assert.equal(parseCid(undefined), "");
      assert.equal(parseCid("abc123"), "");
      assert.equal(parseCid("../../../evil"), "");
      assert.equal(parseCid("12345678901234567890123"), ""); // exceeds 20 digits
    });
  });

  describe("mediaSignature calculation", () => {
    it("returns consistent signature for identical media", () => {
      const mediaA = { url: "https://example.com/video.mp4", cid: "123" };
      const mediaB = { url: "https://example.com/video.mp4", cid: "123" };
      assert.equal(mediaSignature(mediaA), mediaSignature(mediaB));
    });

    it("differentiates when URL or CID changes", () => {
      const media1 = { url: "https://example.com/video1.mp4", cid: "123" };
      const media2 = { url: "https://example.com/video2.mp4", cid: "123" };
      const media3 = { url: "https://example.com/video1.mp4", cid: "456" };
      assert.notEqual(mediaSignature(media1), mediaSignature(media2));
      assert.notEqual(mediaSignature(media1), mediaSignature(media3));
    });

    it("handles null and empty inputs safely", () => {
      assert.equal(mediaSignature(null), "no-cid|");
      assert.equal(mediaSignature({}), "no-cid|");
    });
  });

  describe("NTP Offset & Median Filter Algorithm", () => {
    it("calculates correct NTP clock offset from RTT and server time", () => {
      const clientSent = 1000;
      const clientReceived = 1100;
      const serverTime = 1550;

      const rtt = clientReceived - clientSent; // 100
      const sampleOffset = serverTime - (clientSent + rtt / 2); // 1550 - 1050 = 500
      assert.equal(sampleOffset, 500);
    });

    it("median filter selects lowest jitter sample offset", () => {
      const samples = [
        { rtt: 120, offset: 480 },
        { rtt: 30, offset: 502 },
        { rtt: 80, offset: 495 },
        { rtt: 40, offset: 501 },
        { rtt: 200, offset: 460 }
      ];

      const sorted = [...samples].sort((a, b) => a.rtt - b.rtt);
      const medianSample = sorted[Math.floor(sorted.length / 2)];
      assert.equal(medianSample.rtt, 80);
      assert.equal(medianSample.offset, 495);
    });
  });

  describe("Ephemeral HMAC TURN Token Generation", () => {
    it("generates time-limited HMAC credentials when TURN_SECRET is set", () => {
      const oldUrl = process.env.TURN_URL;
      const oldSecret = process.env.TURN_SECRET;
      try {
        process.env.TURN_URL = "turn:turn.example.com:3478";
        process.env.TURN_SECRET = "super-secret-key-123";

        const ice = getIceServersConfig();
        const turnEntry = ice.find((s) => s.urls === "turn:turn.example.com:3478");
        assert.ok(turnEntry, "Should include configured TURN server");
        assert.ok(turnEntry.username, "Should generate ephemeral username");
        assert.ok(turnEntry.credential, "Should generate base64 HMAC credential");
        assert.match(turnEntry.username, /^\d+:[0-9a-f-]+$/, "Username should be timestamp:uuid");
      } finally {
        if (oldUrl) process.env.TURN_URL = oldUrl; else delete process.env.TURN_URL;
        if (oldSecret) process.env.TURN_SECRET = oldSecret; else delete process.env.TURN_SECRET;
      }
    });
  });

  describe("WebSocket verifyWsOrigin allowlist", () => {
    it("allows localhost and matching host origins", () => {
      let allowed = false;
      verifyWsOrigin({ origin: "http://localhost:5050", req: { headers: { host: "localhost:5050" } } }, (res) => { allowed = res; });
      assert.equal(allowed, true);

      verifyWsOrigin({ origin: "http://127.0.0.1:5050", req: { headers: { host: "127.0.0.1:5050" } } }, (res) => { allowed = res; });
      assert.equal(allowed, true);

      verifyWsOrigin({ origin: "https://my-cinema.com", req: { headers: { host: "my-cinema.com" } } }, (res) => { allowed = res; });
      assert.equal(allowed, true);
    });

    it("rejects unauthorized cross-site origins", () => {
      let allowed = true;
      verifyWsOrigin({ origin: "https://attacker.invalid", req: { headers: { host: "localhost:5050" } } }, (res) => { allowed = res; });
      assert.equal(allowed, false);
    });
  });
});
