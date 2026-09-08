# Review

## Result

- No critical or warning findings in the final scoped diff.
- `127.0.0.1` and private-network servers are labelled before invitation copying.
- The obsolete Render relay is no longer selected automatically; typed public `wss://` servers generate matching HTTPS invitation links.
- Browser verification covered both local-only and public-link states.

## Validation

- `npm run check`: passed.
- `npm test`: 26 passed, 0 failed.
- `npm audit --omit=dev` and `npm audit`: 0 vulnerabilities.
- Desktop archive inspection confirmed version `0.9.0-beta.2`, invitation guidance present, and no stale relay auto-switch.

## Limitation

The configured public endpoint must be reachable by the invited friend. The application explains this requirement but does not create or operate a tunnel on the user's behalf.
