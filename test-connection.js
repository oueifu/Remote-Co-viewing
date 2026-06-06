const WebSocket = require('ws');

const ws = new WebSocket('wss://remote-co-viewing.onrender.com/ws');

ws.on('open', () => {
  console.log('WS Open');
  ws.send(JSON.stringify({
    type: 'join',
    room: '1024',
    name: 'test-agent'
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('Received:', msg);
  if (msg.type === 'error') {
    console.log('Result: FAILED - ' + msg.message);
    process.exit(1);
  } else if (msg.type === 'state') {
    console.log('Result: SUCCESS - Joined Room 1024 successfully!');
    process.exit(0);
  }
});

ws.on('error', (err) => {
  console.error('WS Error:', err);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log('WS Closed:', code, reason.toString());
  setTimeout(() => process.exit(1), 500);
});

setTimeout(() => {
  console.log('Timeout waiting for response.');
  process.exit(1);
}, 8000);
