# Roblox Online Ping Bot

Discord bot that pings a role whenever a Roblox user goes online or offline,
with an in-game session timer and a `/status` slash command.

## Local run

```bash
npm install
cp .env.example .env  # then fill in DISCORD_TOKEN and adjust IDs
npm start
```

## Deploy to Railway

1. Go to [railway.app](https://railway.app) and create a new project.
2. Choose **Deploy from GitHub** (push these files to a repo first) or
   **Empty service** and use the Railway CLI to upload these files.
3. In the service's **Variables** tab, add:
   - `DISCORD_TOKEN` — your Discord bot token (keep this secret)
   - `DISCORD_CHANNEL_ID` — the channel where pings are sent
   - `DISCORD_USER_ID` — fallback user to ping if the role isn't found
   - `ROBLOX_USER_ID` — the Roblox user to watch
   - `CHECK_INTERVAL` — milliseconds between checks (default `30000`)
4. In **Settings**, set the **Start Command** to `npm start` (Railway usually
   detects this automatically from `package.json`).
5. Deploy. Railway keeps Node services running 24/7.

## Notes

- The role pinged on online/offline events is hardcoded as `josh ping` and is
  looked up by name in the channel's server. Create that role in your server
  and assign it to whoever should be notified.
- The Roblox user named `JOHAAAA` (id `769284458`) is mapped in
  `index.js` — edit the `ROBLOX_NAMES` object to add more.
