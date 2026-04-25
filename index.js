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
const CHECK_INTERVAL = Number(process.env.CHECK_INTERVAL || 30000);
const PING_ROLE_NAME = "Joh pingger";

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
  try {
    const res = await axios.post(
      "https://presence.roblox.com/v1/presence/users",
      { userIds: [userId] },
      { headers: { "Content-Type": "application/json" } }
    );

    return res.data.userPresences[0];
  } catch (err) {
    console.error("Roblox API error:", err.response?.data || err.message);
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
        content: `${mention} JAHHH ONLINE.`,
        allowedMentions
      });
    }

    if (enteredGame) {
      await channel.send({
        content: `${mention} GAME TIME LETS GO`,
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

    let reply = formatPresence(presence);

    // If user is in a game, append the game location
    if (presence.userPresenceType === 2 && presence.lastLocation) {
      reply += `\nCurrently playing: ${presence.lastLocation}`;
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

  setInterval(checkUser, CHECK_INTERVAL);
});

client.login(DISCORD_TOKEN);
