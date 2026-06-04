# Electron Migration Plan

## Goal

Turn the current "local Node service + browser page + optional mpv client" project into a desktop application that:

- ships with its own Node runtime
- starts the local sync server automatically
- opens the existing web UI inside an Electron window
- preserves the current room protocol and `mpv-client.js` compatibility
- keeps the Chrome extension as an optional Bilibili helper instead of the main product shell

## Why Electron First

This codebase is already a desktop-style product in disguise:

- `server.js` is a local process, not a public cloud service
- `start.bat` is a desktop launcher
- `public/app.js` assumes it can talk to a local or user-controlled server
- `mpv-client.js` is a desktop integration path

Electron matches that shape directly. A pure Chrome extension does not.

## Non-Goals

These items should not be mixed into the first Electron migration:

- no public multi-tenant cloud signaling service
- no room persistence database
- no auth/account system
- no multi-user scaling redesign
- no protocol redesign for `server.js`, `public/app.js`, or `mpv-client.js`
- no rewrite of the Bilibili parsing path

## Architectural Constraints

The Electron migration must preserve the following:

1. This remains a state-sync product, not a media-transfer product.
2. WebRTC remains voice/video calling only; do not route movie files through it.
3. `server.js`, `public/app.js`, and `mpv-client.js` keep the same shared room protocol.
4. Room size remains capped at 2 unless the server state machine is deliberately redesigned.
5. Bilibili parsing and proxy logic stay isolated; do not entangle them with Electron shell code.

## Target Desktop Architecture

### Process model

- Electron main process
  - boots the packaged app
  - starts and monitors the local Node sync server
  - opens the renderer window
  - exposes desktop-only actions through IPC

- Local sync server
  - current `server.js`
  - still listens on localhost
  - still owns WebSocket room sync and HTTP API

- Electron renderer
  - loads the existing `public/index.html`
  - continues to use `public/app.js`
  - connects to the local server through `http://127.0.0.1:<port>` and `ws://127.0.0.1:<port>/ws`

- Optional external player bridge
  - current `mpv-client.js`
  - initially remains a separate path
  - later can be launched by Electron via IPC if desired

### Packaging direction

- package Electron app for Windows first
- keep current repo structure
- do not split `public/app.js` during the shell migration unless needed
- add Electron shell files around existing code first, refactor internals later

## Recommended Migration Phases

## Phase 0: Freeze protocol boundaries

Purpose:

- prevent Electron work from accidentally mutating the room protocol

Tasks:

- seal the current WebSocket-fix Mainline intent first
- record a fresh Electron migration intent in Mainline
- explicitly note that Electron work must not alter `join`, `joined`, `control`, `state`, `load_video`, or `rtc_*` payloads

Exit criteria:

- protocol boundary documented before Electron code lands

## Phase 1: Add a minimal Electron shell

Purpose:

- prove the app can boot as a desktop shell without changing core behavior

Tasks:

- add `electron` as a dev dependency
- create `electron/main.js`
- create `electron/preload.js`
- add npm scripts such as:
  - `desktop:dev`
  - `desktop:check`
- launch a `BrowserWindow`
- load the local UI URL after the local server is ready

Exit criteria:

- desktop app window opens
- existing UI renders unchanged inside Electron

## Phase 2: Move launcher responsibilities out of `start.bat`

Purpose:

- replace batch-script orchestration with app-controlled orchestration

Tasks:

- create a server bootstrap module used by Electron main process
- start `server.js` as a child process or refactor it into an importable module
- detect port conflicts cleanly
- wait for local HTTP readiness before loading renderer
- surface startup errors in an Electron dialog

Important choice:

- best long-term direction is to refactor `server.js` into:
  - `src/server/createServer.js`
  - thin CLI entrypoint `server.js`
- that allows both:
  - `node server.js`
  - Electron-controlled startup without shelling out

Exit criteria:

- Electron can start and stop the local sync server reliably
- `start.bat` becomes optional instead of mandatory

## Phase 3: Adapt the renderer to desktop runtime assumptions

Purpose:

- make the existing page deterministic inside Electron

Tasks:

- ensure default connection target is localhost in packaged desktop mode
- keep current browser-origin fallback for web deployments
- add a desktop runtime hint, for example via preload-exposed config
- keep invite-link generation aligned with actual reachable address

Recommended boundary:

- do not turn `public/app.js` into an Electron-specific renderer
- inject only a small config surface, for example:
  - `window.syncCinemaRuntime = { mode: "desktop", localHttpBase: "...", localWsUrl: "..." }`

Exit criteria:

- packaged desktop renderer does not rely on `start.bat`
- web mode still works

## Phase 4: Desktop-native UX replacements

Purpose:

- remove browser-only rough edges

Tasks:

- replace manual file input flow with optional native file picker integration
- add menu items:
  - Start local session
  - Copy invite link
  - Open logs
  - Launch mpv mode
- add desktop notifications for join requests if useful
- add structured log files under app data instead of ad hoc local logs

Exit criteria:

- common tasks no longer depend on shell scripts or manual terminal work

## Phase 5: Optional mpv desktop integration

Purpose:

- preserve the strongest desktop advantage of the current project

Tasks:

- detect whether `mpv` exists on PATH
- optionally let Electron launch `mpv-client.js`
- offer file selection from the app shell
- show a clear status if `mpv` is unavailable

Boundary:

- the first Electron release does not need to embed mpv
- it only needs to preserve the existing `mpv-client.js` protocol path

Exit criteria:

- Electron can coexist with `mpv-client.js` without protocol drift

## Phase 6: Packaging and release

Purpose:

- produce an installable desktop artifact

Tasks:

- add `electron-builder` or `electron-forge`
- package Windows installer first
- include app icon, app name, versioning, and auto-update decision later
- decide whether to bundle `cloudflared.exe` or leave tunnel setup manual

Exit criteria:

- user can install and open the app without separately installing Node

## Suggested File Layout

```text
electron/
  main.js
  preload.js
src/
  server/
    createServer.js        # future extraction target
server.js                  # CLI entrypoint wrapper
public/
  index.html
  app.js
  styles.css
mpv-client.js
start.bat                  # legacy launcher, retained during migration
```

## First Concrete Implementation Slice

The best first slice is intentionally narrow:

1. Add Electron dependencies and scripts.
2. Create `electron/main.js` and `electron/preload.js`.
3. Make Electron spawn the existing `server.js`.
4. Wait for `http://127.0.0.1:5050` to become ready.
5. Open the existing UI inside `BrowserWindow`.
6. Keep all room protocol code unchanged.

If this slice works, the project has already crossed the main productization threshold.

## Risks To Watch

### Risk 1: Mixing shell logic into `public/app.js`

Bad outcome:

- renderer becomes Electron-only and breaks the current web path

Mitigation:

- inject a tiny runtime config surface instead of branching large app logic

### Risk 2: Refactoring `server.js` and protocol together

Bad outcome:

- `mpv-client.js` compatibility silently breaks

Mitigation:

- treat server process bootstrapping and room protocol as separate workstreams

### Risk 3: Overreaching into cloud architecture too early

Bad outcome:

- migration stalls under auth, persistence, scaling, and TURN complexity

Mitigation:

- keep the first desktop release fully local-first

### Risk 4: Bundling Bilibili helper behavior into the shell

Bad outcome:

- Electron shell inherits fragile anti-scraping coupling

Mitigation:

- keep extension/helper logic optional and isolated

## Validation Checklist

Before calling the Electron migration usable, verify:

- app window launches locally
- local server boots automatically
- browser UI still joins a room successfully
- invite links still work
- local file playback still works
- `control` -> `state` sync still works across two clients
- `mpv-client.js` can still join and react to play/pause/seek
- Bilibili path still behaves exactly as before

## Recommendation

Do not begin with a large refactor.

Begin with a shell-only integration that wraps the current project. Once that works, then decide whether to:

- modularize `server.js`
- split `public/app.js`
- integrate `mpv` more deeply
- or later build a public signaling service

That sequence keeps the migration reversible and prevents protocol damage.
