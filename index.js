require('dotenv').config();
const http = require('http');
const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  Collection,
  ChannelType,
  REST,
  Routes,
} = require('discord.js');

const { ban, warn, blacklist, promote, demote } = require('./commands');
const appeals = require('./appeals');

// Tiny HTTP server purely so Railway has a port to health-check. The bot
// itself runs off the Discord WebSocket connection, not this server.
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('College of Conquerors bot is running.');
  })
  .listen(PORT, () => console.log(`Healthcheck server listening on port ${PORT}`));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const commands = new Collection();
for (const cmd of [ban, warn, blacklist, promote, demote]) {
  commands.set(cmd.data.name, cmd);
}

client.once(Events.ClientReady, async c => {
  console.log(`✅ Logged in as ${c.user.tag}`);

  if (!process.env.GUILD_ID) {
    console.warn('⚠️ GUILD_ID is not set — slash commands were not registered.');
    return;
  }

  try {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    const body = [...commands.values()].map(cmd => cmd.data.toJSON());
    await rest.put(Routes.applicationGuildCommands(c.user.id, process.env.GUILD_ID), { body });
    console.log(`✅ Registered ${body.length} slash commands to guild ${process.env.GUILD_ID}`);
  } catch (err) {
    console.error('❌ Failed to register slash commands:', err);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = commands.get(interaction.commandName);
      if (!cmd) return;
      await cmd.execute(interaction);
    } else if (interaction.isButton()) {
      await appeals.handleButton(interaction);
    }
  } catch (err) {
    console.error('Interaction error:', err);
    const payload = { content: '❌ Something went wrong running that.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  if (message.channel.type !== ChannelType.DM) return;
  try {
    await appeals.handleDM(message);
  } catch (err) {
    console.error('DM appeal error:', err);
  }
});

process.on('unhandledRejection', err => console.error('Unhandled promise rejection:', err));

client.login(process.env.DISCORD_TOKEN);
