# Contributing to Remote Co-viewing (SyncCinema)

Thank you for your interest in contributing to Remote Co-viewing! We welcome community contributions, bug reports, feature suggestions, and documentation improvements.

## Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free experience for everyone. Please be respectful, constructive, and collaborative in all discussions and interactions.

---

## Getting Started

1. **Fork and Clone**:
   ```bash
   git clone https://github.com/oueifu/Remote-Co-viewing.git
   cd Remote-Co-viewing
   ```
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Verify Existing Tests Pass**:
   ```bash
   npm test
   npm run check
   npm run desktop:check
   ```

---

## Development Principles & Architecture Guidelines

When contributing code, please keep the following architectural constraints in mind:

1. **State-Sync, Not Media Transfer**: This application synchronizes playback timestamps, clock drift (via NTP ping-pong), and playback states. Media files are **never** uploaded to or relayed through the sync server.
2. **WebRTC Boundary**: WebRTC peer connections are strictly reserved for two-way audio/video calling and screen sharing; movie files must never be piped through WebRTC DataChannels.
3. **Room Protocol Integrity**: Any modifications to signaling payloads (`join`, `joined`, `control`, `state`, `load_video`, `rtc_*`) must maintain backwards compatibility between `server.js`, `public/app.js`, and `electron/main.js`.
4. **Security First**:
   - Do not bypass WebSocket `Origin` verification.
   - Maintain Electron process isolation (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`).
   - Validate IPC senders with `senderFrame.url` matching the loopback server origin.

---

## Submitting Pull Requests

1. **Create a Feature Branch**:
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/your-bugfix-name
   ```
2. **Write Unit / Regression Tests**:
   - For server or protocol changes, add test cases under `test/server.test.js`.
   - For utility functions, add unit tests under `test/unit.test.js`.
3. **Run Validation Checks**:
   ```bash
   npm run check
   npm test
   npm audit --omit=dev
   ```
4. **Commit with Clear Messages**:
   Follow conventional commits format:
   - `feat: add feature description`
   - `fix: resolve bug description`
   - `docs: update documentation`
   - `test: add test cases`
5. **Open a Pull Request**:
   - Provide a clear summary of what changes were made and why.
   - Reference any relevant issues.

Thank you for helping make Remote Co-viewing better!
