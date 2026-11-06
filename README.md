# Mahjong Club (Cloudflare starter)

A private, browser-based multiplayer Mahjong prototype using Cloudflare Workers, Durable Objects and WebSockets.

## Included
- Create a private room with a six-character code
- Join by code or invite URL
- Up to four seats, ready-up, host start
- 136-tile Hong Kong-style tile wall
- Draw/discard, Pong, Chow, Kong, self-draw wins and basic standard-hand Mahjong detection
- Simultaneous claim window with an 18-second timeout; unsubmitted claims automatically pass
- Claim priority: Mahjong > Kong/Pong > Chow; ties go to the nearest player clockwise from the discarder
- Chow is restricted to the next player and offers valid tile combinations in the interface
- Server-authoritative room state and per-player private hands

## Remaining limitations
This is a playable multiplayer foundation, not a complete tournament-grade Hong Kong rules engine yet:
- Hong Kong scoring (fan, minimum fan, limit hands, flowers/seasons and settlement) is not implemented.
- A single winner is selected if multiple players declare Mahjong on the same discard. Some tables use different multiple-win rules.
- Room state persists in the Durable Object, but player identity is held only in page memory, so refreshing loses that seat; reconnect tokens and host handover need further work.
- For a public production launch, add rate limiting, room expiry, robust reconnect tokens, abuse controls, and broader automated rules tests.

## Deploy

1. Install Node.js (current LTS).
2. In this folder run:
   ```bash
   npm install
   npx wrangler login
   npm run dev
   ```
3. Open the local URL printed by Wrangler and test with multiple browser windows.
4. Run the rules tests with `npm test`.
5. Deploy:
   ```bash
   npm run deploy
   ```
6. Wrangler will publish the Worker and static assets. Use the resulting `workers.dev` URL to invite friends.

## Architecture
- `public/`: browser UI
- `src/worker.js`: Worker API, WebSocket routing, Durable Object game server
- `wrangler.toml`: Durable Object and static asset bindings
- `test/claims.test.js`: automated claim-priority and hand-validation tests

The game uses a simplified Hong Kong-style 136-tile set (three numbered suits, four winds, three dragons; four copies each). No flowers/seasons are included in this first playable version.
