// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Q Credit

const WebSocket = require('ws');

const targetUrl = process.argv[2] || process.env.TARGET_WS_URL || 'ws://127.0.0.1:5050/ws';
const testRoom = process.env.TARGET_ROOM || `smoke-${Date.now()}`;

console.log(`Connecting to: ${targetUrl} (Room: ${testRoom})`);
const ws = new WebSocket(targetUrl);

let timer = setTimeout(() => {
  console.error('Timeout waiting for response.');
  process.exit(1);
}, 8000);

ws.on('open', () => {
  console.log('WS connection opened, sending join request...');
  ws.send(JSON.stringify({
    type: 'join',
    room: testRoom,
    name: 'SmokeTestAgent'
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('Received:', msg.type);
  if (msg.type === 'error') {
    clearTimeout(timer);
    console.error('Result: FAILED -', msg.message);
    process.exit(1);
  } else if (msg.type === 'joined') {
    clearTimeout(timer);
    console.log(`Result: SUCCESS - Joined Room ${msg.room} successfully (isHost: ${msg.isHost})`);
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => {
  clearTimeout(timer);
  console.error('WS Error:', err.message || err);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log('WS Closed:', code, reason.toString());
});
