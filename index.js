require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags
} = require("discord.js");
const axios = require("axios");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const DISCORD_USER_ID = process.env.DISCORD_USER_ID;
const ROBLOX_USER_ID = Number(process.env.ROBLOX_USER_ID);
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;
const PING_ROLE_NAME = "Joh pingger";

function getCheckInterval() {
  const now = new Date();
  // Get current hour in GMT+8
  const gmt8Hour = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" })).getHours();
  // Daytime: 04:00–19:59 GMT+8 → 20 seconds
  if (gmt8Hour >= 4 && gmt8Hour <= 19) {
    return 20000;
  }
  // Nighttime: 20:00–23:59 and 00:00–03:59 GMT+8 → 10 seconds
  return 10000;
}

const ROBLOX_NAMES = {
  769284458: "JOHAAAA"
};

function getRobloxName(userId) {
  return ROBLOX_NAMES[userId] || `user \`${userId}\``;
}

// Roblox presence types:
// 0 = Offline
// 1 = Online
// 2 = In Game
// 3 = In Studio
let lastStatus = null;
let inGameSince = null;
let lastSessionDurationMs = null;
let lastSessionLocation = null;
let lastGameLocation = null;
let lastOfflineTime = null;

const PRESENCE_LABELS = {
  0: "Offline",
  1: "Online (on the website)",
  2: "In Game",
  3: "In Roblox Studio"
};

function formatDuration(ms) {
  if (ms < 1000) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

async function getRobloxPresence(userId) {
  const authenticated = !!ROBLOX_COOKIE;
  console.debug(`[getRobloxPresence] Making ${authenticated ? "authenticated" : "unauthenticated"} request for userId`, userId);

  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  };

  if (authenticated) {
    headers["Cookie"] = `.ROBLOSECURITY=${ROBLOX_COOKIE}`;
  }

  try {
    const res = await axios.post(
      "https://presence.roblox.com/v1/presence/users",
      { userIds: [userId] },
      { headers }
    );

    console.debug("[getRobloxPresence] Raw API response:", JSON.stringify(res.data, null, 2));

    const presence = res.data.userPresences[0];
    console.debug("[getRobloxPresence] Parsed presence object for userId", userId, ":", JSON.stringify(presence, null, 2));

    return presence;
  } catch (err) {
    if (err.response?.status === 403) {
      console.error("[getRobloxPresence] 403 Forbidden — the ROBLOX_COOKIE may be invalid, expired, or a CSRF token is required. Check that ROBLOX_COOKIE is set correctly.");
    } else {
      console.error("[getRobloxPresence] API error for userId", userId, "— status:", err.response?.status, "— body:", JSON.stringify(err.response?.data, null, 2), "— message:", err.message);
    }
    return null;
  }
}

function isOnline(presenceType) {
  return presenceType !== 0;
}

function formatPresence(presence) {
  const type = presence.userPresenceType;

  if (type === 0) {
    return "jah dead. gone. i sad.";
  }

  return "JAHH ROBLOX OMG YAYY";
}

async function findPingRole(guild) {
  try {
    const roles = await guild.roles.fetch();
    const target = PING_ROLE_NAME.toLowerCase();
    return roles.find((r) => r.name.toLowerCase() === target) || null;
  } catch (err) {
    console.error("Failed to fetch roles:", err.message);
    return null;
  }
}

async function checkUser() {
  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel) return;

  const presence = await getRobloxPresence(ROBLOX_USER_ID);
  if (!presence) return;

  console.debug("[checkUser] Full presence object being processed:", JSON.stringify(presence, null, 2));

  const currentStatus = presence.userPresenceType;
  const currentlyOnline = isOnline(currentStatus);
  const wasOnline = lastStatus !== null ? isOnline(lastStatus) : null;

  console.log(`[${new Date().toLocaleTimeString()}] Presence: ${currentStatus}`);

  const wentOnline = wasOnline === false && currentlyOnline === true;
  const wentOffline = wasOnline === true && currentlyOnline === false;

  if (wentOffline) {
    lastOfflineTime = Date.now();
  }
  const enteredGame = lastStatus !== 2 && currentStatus === 2;
  const leftGame = lastStatus === 2 && currentStatus !== 2;

  if (enteredGame) {
    inGameSince = Date.now();
    lastSessionLocation = presence.lastLocation || null;
    lastGameLocation = presence.lastLocation || null;
  }

  let endedSessionDurationMs = null;
  let endedSessionLocation = null;
  if (leftGame && inGameSince) {
    endedSessionDurationMs = Date.now() - inGameSince;
    endedSessionLocation = lastSessionLocation;
    lastSessionDurationMs = endedSessionDurationMs;
    inGameSince = null;
  }

  const websiteOnline = lastStatus === 0 && currentStatus === 1;

  if (websiteOnline || enteredGame || leftGame) {
    const role = channel.guild ? await findPingRole(channel.guild) : null;
    const mention = role ? `<@&${role.id}>` : `<@${DISCORD_USER_ID}>`;

    if (!role) {
      console.warn(`Role "${PING_ROLE_NAME}" not found, falling back to user mention`);
    }

    const allowedMentions = {
      users: role ? [] : [DISCORD_USER_ID],
      roles: role ? [role.id] : []
    };

    if (websiteOnline) {
      await channel.send({
        content: `${mention} JAHH ON WEBSITE.`,
        allowedMentions
      });
    }

    if (enteredGame) {
      await channel.send({
        content: `${mention} JAHHH PLAYING ${presence.lastLocation}.`,
        allowedMentions
      });
    }

    if (leftGame) {
      await channel.send({
        content: `${mention} jah left the game. :(`,
        allowedMentions
      });
    }
  }

  lastStatus = currentStatus;
}

const statusCommand = new SlashCommandBuilder()
  .setName("status")
  .setDescription("Check the current Roblox presence of the watched user");

const lastplayedCommand = new SlashCommandBuilder()
  .setName("lastplayed")
  .setDescription("Check the last location the watched user played");

const lastloginCommand = new SlashCommandBuilder()
  .setName("lastlogin")
  .setDescription("Check when the watched user last logged in");

async function registerCommands(guildId) {
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guildId),
      { body: [statusCommand.toJSON(), lastloginCommand.toJSON(), lastplayedCommand.toJSON()] }
    );
    console.log(`Registered /status, /lastlogin, and /lastplayed in guild ${guildId}`);
  } catch (err) {
    console.error("Failed to register slash commands:", err);
  }
}

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "status") {
    await interaction.deferReply();

    const presence = await getRobloxPresence(ROBLOX_USER_ID);
    if (!presence) {
      await interaction.editReply("Could not fetch Roblox presence right now.");
      return;
    }

    let reply;

    if (presence.userPresenceType === 0) {
      // Offline
      reply = "jah dead. gone. i sad.";
    } else if (presence.userPresenceType === 2) {
      // In a game - use the tracked game location
      const gameName = lastGameLocation || "Unknown Game";
      reply = `JAHH PLAYING ${gameName}.`;
    } else {
      // Online but not in game
      reply = "Jah picking game. or afk pooning. patience.";
    }

    await interaction.editReply(reply);
  }

  if (interaction.commandName === "lastlogin") {
    await interaction.deferReply();

    if (!lastOfflineTime) {
      await interaction.editReply("No offline data recorded yet.");
      return;
    }

    const timeAgo = Date.now() - lastOfflineTime;
    const formatted = formatDuration(timeAgo);
    await interaction.editReply(`Last login: ${formatted} ago`);
  }

  if (interaction.commandName === "lastplayed") {
    await interaction.deferReply();

    if (!lastGameLocation) {
      await interaction.editReply("No game location recorded yet.");
      return;
    }

    await interaction.editReply(`Last played: ${lastGameLocation}`);
  }
});

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  if (!ROBLOX_COOKIE) {
    console.warn("[Startup] WARNING: ROBLOX_COOKIE is not set. Presence requests will be unauthenticated and may return stale or incorrect data.");
  } else {
    console.log("[Startup] ROBLOX_COOKIE is set — presence requests will be authenticated.");
  }

  let channel = null;
  try {
    channel = await client.channels.fetch(CHANNEL_ID);
    if (channel && channel.guildId) {
      await registerCommands(channel.guildId);
    }
  } catch (err) {
    console.error("Failed to fetch channel for command registration:", err);
  }

  const initialPresence = await getRobloxPresence(ROBLOX_USER_ID);
  if (initialPresence) {
    lastStatus = initialPresence.userPresenceType;
    console.log(`Initial status: ${lastStatus}`);
    if (lastStatus === 2) {
      inGameSince = Date.now();
      lastSessionLocation = initialPresence.lastLocation || null;
    }
  }

  if (channel) {
    try {
      const name = getRobloxName(ROBLOX_USER_ID);
      const currentLabel = initialPresence
        ? PRESENCE_LABELS[initialPresence.userPresenceType] || "Unknown"
        : "Unknown";
      await channel.send({
        content: `Now watching **${name}** — currently **${currentLabel}**. You'll be pinged on online/offline changes.`,
        allowedMentions: { parse: [] }
      });
    } catch (err) {
      console.error("Failed to send startup message:", err.message);
    }
  }

  let currentInterval = getCheckInterval();
  console.log(`[Interval] Starting with check interval: ${currentInterval}ms`);

  const scheduleNext = () => {
    const interval = getCheckInterval();
    if (interval !== currentInterval) {
      console.log(`[Interval] Switching check interval: ${currentInterval}ms → ${interval}ms`);
      currentInterval = interval;
    }
    setTimeout(async () => {
      await checkUser();
      scheduleNext();
    }, currentInterval);
  };

  scheduleNext();
});

client.login(DISCORD_TOKEN);
