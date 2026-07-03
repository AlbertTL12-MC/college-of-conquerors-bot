const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { CHANNELS, COLORS } = require('./config');
const db = require('./db');
const { getRobloxUser } = require('./roblox');
const { truncate } = require('./utils');

const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes of inactivity resets the flow
const sessions = new Map(); // discordUserId -> { step, robloxUsername, lastActivity }

function isStale(session) {
  return Date.now() - session.lastActivity > SESSION_TIMEOUT_MS;
}

// Handles every DM the bot receives. This is the entire appeal flow —
// the user never has to be in the server or use a slash command.
async function handleDM(message) {
  const userId = message.author.id;
  const content = message.content.trim();
  let session = sessions.get(userId);

  if (session && isStale(session)) {
    sessions.delete(userId);
    session = null;
  }

  if (!session) {
    if (/appeal/i.test(content)) {
      const ban = db.getBan(userId);
      if (ban && ban.status === 'active' && ban.appealAfter && ban.appealAfter > Date.now()) {
        const ts = Math.floor(ban.appealAfter / 1000);
        return message.reply(
          `🚫 You can't appeal yet. Your ban has a waiting period — you'll be able to appeal <t:${ts}:R> (<t:${ts}:F>).`
        );
      }
      sessions.set(userId, { step: 'roblox', lastActivity: Date.now() });
      return message.reply("📋 Let's start your appeal for **College of Conquerors**.\n\nWhat is your **Roblox username**?");
    }
    return message.reply(
      "👋 This is the **College of Conquerors** appeals system.\nIf you were banned and want to appeal, type **appeal** to begin."
    );
  }

  if (session.step === 'roblox') {
    session.robloxUsername = content;
    session.step = 'reason';
    session.lastActivity = Date.now();
    return message.reply('Got it. Now, in a few sentences, why should you be unbanned?');
  }

  if (session.step === 'reason') {
    session.reason = content;
    sessions.delete(userId);

    const robloxInfo = await getRobloxUser(session.robloxUsername);
    const robloxId = robloxInfo ? robloxInfo.id : 'Unknown';
    const resolvedRobloxUsername = robloxInfo ? robloxInfo.username : session.robloxUsername;

    const ban = db.getBan(userId);

    const embed = new EmbedBuilder()
      .setColor(COLORS.APPEAL)
      .setTitle('Ban Appeal Submitted')
      .addFields(
        { name: 'Discord User', value: `${message.author.tag} (<@${userId}>)`, inline: true },
        { name: 'Discord ID', value: userId, inline: true },
        { name: 'Roblox Username', value: resolvedRobloxUsername, inline: true },
        { name: 'Roblox ID', value: String(robloxId), inline: true },
        { name: 'Appeal Reason', value: truncate(session.reason, 1000) }
      )
      .setThumbnail(message.author.displayAvatarURL())
      .setTimestamp();

    if (ban) {
      embed.addFields(
        { name: 'Original Ban Reason', value: truncate(ban.reason || 'N/A', 500) },
        { name: 'Banned By', value: ban.bannedBy || 'Unknown' }
      );
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`appeal_approve_${userId}`).setLabel('Approve').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`appeal_deny_${userId}`).setLabel('Deny').setStyle(ButtonStyle.Danger)
    );

    const channel = await message.client.channels.fetch(CHANNELS.APPEALS_AND_BANS).catch(() => null);
    if (channel) await channel.send({ embeds: [embed], components: [row] });

    return message.reply('✅ Your appeal has been submitted to staff. You will be messaged here once it has been reviewed.');
  }
}

// Handles staff clicking Approve/Deny on an appeal embed.
async function handleButton(interaction) {
  const { customId } = interaction;
  if (!customId.startsWith('appeal_approve_') && !customId.startsWith('appeal_deny_')) return;

  if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
    return interaction.reply({ content: '❌ You do not have permission to resolve appeals.', ephemeral: true });
  }

  const approved = customId.startsWith('appeal_approve_');
  const targetId = customId.replace(approved ? 'appeal_approve_' : 'appeal_deny_', '');

  await interaction.deferUpdate();

  db.updateBanStatus(targetId, approved ? 'appeal_approved' : 'appeal_denied');

  let unbanned = false;
  if (approved) {
    try {
      await interaction.guild.members.unban(targetId, `Appeal approved by ${interaction.user.tag}`);
      unbanned = true;
    } catch (err) {
      console.error('Failed to unban after appeal approval:', err.message);
    }
  }

  const original = interaction.message;
  const oldEmbed = original.embeds[0];
  const newEmbed = EmbedBuilder.from(oldEmbed)
    .setColor(approved ? COLORS.APPEAL_APPROVED : COLORS.APPEAL_DENIED)
    .addFields({
      name: 'Resolved',
      value: `**${approved ? 'Approved' : 'Denied'}** by ${interaction.user.tag}${
        approved && !unbanned ? ' (⚠️ could not auto-unban — check bot permissions)' : ''
      }`,
    });

  const disabledRow = new ActionRowBuilder().addComponents(
    ButtonBuilder.from(original.components[0].components[0]).setDisabled(true),
    ButtonBuilder.from(original.components[0].components[1]).setDisabled(true)
  );

  await interaction.editReply({ embeds: [newEmbed], components: [disabledRow] });

  try {
    const targetUser = await interaction.client.users.fetch(targetId);
    const inviteLine = process.env.SERVER_INVITE_LINK ? `\nYou may rejoin here: ${process.env.SERVER_INVITE_LINK}` : '';
    await targetUser.send(
      approved
        ? `✅ Your appeal for **College of Conquerors** was **approved**.${inviteLine}`
        : '❌ Your appeal for **College of Conquerors** was **denied** by staff.'
    );
  } catch (err) {
    console.error('Could not DM appeal result:', err.message);
  }
}

module.exports = { handleDM, handleButton };
