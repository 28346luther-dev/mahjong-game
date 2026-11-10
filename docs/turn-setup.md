# Enable reliable player webcams (Cloudflare TURN)

The game already uses peer-to-peer WebRTC for video. STUN alone cannot traverse every
firewall/NAT. Configure Cloudflare Realtime TURN to supply a relay when necessary.

## Cloudflare setup (account owner)

1. In the Cloudflare Dashboard, open **Realtime → TURN Server** and choose **Create**.
2. Create a TURN server/key for the Games Club. Note its **TURN Token ID** and its
   **API Token**. Keep the API token secret; do **not** commit it to GitHub,
   put it in wrangler.toml, or send it to someone in a chat.
3. Open **Workers & Pages → mahjong-game → Settings → Variables and Secrets**
   and add these *encrypted secrets* to the production Worker:
   - `TURN_KEY_ID`: TURN Token ID (not an API token)
   - `TURN_KEY_API_TOKEN`: API Token (the associated long-term key)
4. Save / deploy the updated bindings. Do not accidentally deploy secrets to a
   different Worker project.
5. Sign in to the game, visit `/api/rtc/ice` in the same browser,
   and verify `"relayAvailable":true` and that `iceServers` includes a `turn:`
   or `turns:` URL. **Do not publicly share the credential response**: it
   contains temporary TURN credentials.
6. Two players join the same Mahjong room. Each may **Enable reaction camera**,
   then open **Cameras** to see the live feed. Click **Retry cameras** if the
   clients were already open before TURN became available.

The authenticated `/api/rtc/ice` endpoint generates expiring ICE credentials
server-side, and never returns the long-lived API token. Camera consent remains
off by default. Video is WebRTC media between players (relayed by TURN when
necessary), not an upload to the Mahjong Worker.

Cloudflare documentation:
https://developers.cloudflare.com/realtime/turn/generate-credentials/
