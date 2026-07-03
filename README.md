# College of Conquerors Bot

Moderation bot with ban logging + DM appeals, a promotion blacklist, a rank
promotion/demotion system, and a 3-strike warning system.

## Commands

| Command | Who | What it does |
|---|---|---|
| `/ban` | Ban Members perm | Bans a user, logs it, optionally locks appeals for N days |
| `/warn` | Moderate Members perm | Warns a user; 3rd warning auto-bans for 7 days |
| `/blacklist` | Manage Roles perm | Blocks a Roblox user from future promotions |
| `/promote` | Manage Roles perm | Moves a member up the rank ladder (blocked if blacklisted) |
| `/demote` | Manage Roles perm | Moves a member down the rank ladder |

Ban appeals happen entirely over **DM with the bot** — a user DMs the bot,
types `appeal`, answers two questions, and it's posted to staff with
Approve/Deny buttons.

## Required setup

1. `config.js` — the channel IDs are already filled in. You **must** add your
   server's rank role IDs to `RANK_ROLES`, ordered lowest to highest, before
   `/promote` and `/demote` will work.
2. Environment variables — see `.env.example`. `DISCORD_TOKEN` and `GUILD_ID`
   are required; the rest are optional.
3. The bot's own role must sit **above** every rank role in Server Settings >
   Roles, or it won't be able to assign/remove them.
4. Enable the **Server Members Intent** and **Message Content Intent** under
   the Bot tab in the Developer Portal — both are required (member/role
   management and reading DM appeal messages).

## Data storage

Bans, warnings, and blacklist entries are stored in a local JSON file
(`data/data.json` by default). On Railway this resets on redeploy unless you
attach a Volume and set `DATA_DIR` to its mount path (e.g. `/data`).

## Local structure

- `index.js` — bot startup, event routing, command registration
- `config.js` — channel IDs, rank roles, colors, thresholds
- `db.js` — JSON persistence for bans/warnings/blacklist
- `roblox.js` — Roblox username → ID lookup
- `appeals.js` — DM appeal flow + staff Approve/Deny buttons
- `commands.js` — all five slash commands (ban, warn, blacklist, promote, demote)
- `utils.js` — small shared helpers
