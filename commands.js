const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { CHANNELS, COLORS, RANK_ROLES, WARNINGS_BEFORE_AUTOBAN, AUTOBAN_APPEAL_AFTER_DAYS } = require('./config');
const db = require('./db');
const { getRobloxUser } = require('./roblox');
const { truncate, getCurrentRankIndex } = require('./utils');

const DISCORD_ID_REGEX = /^\d{17,20}$/;

// Resolves a typed Discord username OR ID into a real user — including
// people who are no longer in the server. IDs always work (Discord's API
// can fetch any user by ID). Usernames only work if they're still a
// current member, since Discord gives bots no general "search anyone by
// username" endpoint — that's a Discord API limitation, not a bot bug.
async function resolveDiscordUser(interaction, input) {
  const trimmed = input.trim().replace(/^@/, '');

  if (DISCORD_ID_REGEX.test(trimmed)) {
    try {
      return await interaction.client.users.fetch(trimmed);
    } catch {
      return null;
    }
  }

  try {
    const matches = await interaction.guild.members.fetch({ query: trimmed, limit: 10 });
    const exact = matches.find(
      m =>
        m.user.username.toLowerCase() === trimmed.toLowerCase() ||
        (m.displayName && m.displayName.toLowerCase() === trimmed.toLowerCase())
    );
    if (exact) return exact.user;
    if (matches.size > 0) return matches.first().user; // closest prefix match fallback
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Shared helper — used by /ban directly and by /warn's auto-ban
// at 3 warnings.
// ─────────────────────────────────────────────────────────────
async function performBan(guild, { targetUser, robloxUsername, reason, appealAfterDays, staffUser, isAutomatic }) {
  const robloxInfo = await getRobloxUser(robloxUsername);
  const robloxId = robloxInfo ? robloxInfo.id : 'Unknown';
  const resolvedRobloxUsername = robloxInfo ? robloxInfo.username : robloxUsername;

  const now = Date.now();
  const appealAfterMs = appealAfterDays && appealAfterDays > 0 ? now + appealAfterDays * 24 * 60 * 60 * 1000 : 0;

  db.setBan(targetUser.id, {
    discordId: targetUser.id,
    discordTag: targetUser.tag,
    robloxUsername: resolvedRobloxUsername,
    robloxId,
    reason,
    bannedBy: staffUser.tag,
    bannedById: staffUser.id,
    bannedAt: now,
    appealAfter: appealAfterMs,
    status: 'active',
    automatic: !!isAutomatic,
  });

  let banExecuted = false;
  try {
    await guild.members.ban(targetUser.id, { reason: truncate(reason, 512) });
    banExecuted = true;
  } catch (err) {
    console.error('Failed to execute Discord ban:', err.message);
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.BAN)
    .setTitle(isAutomatic ? 'Ban Log (Automatic — 3 Warnings)' : 'Ban Log')
    .addFields(
      { name: 'Discord User', value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
      { name: 'Discord ID', value: targetUser.id, inline: true },
      { name: 'Roblox Username', value: resolvedRobloxUsername, inline: true },
      { name: 'Roblox ID', value: String(robloxId), inline: true },
      { name: 'Banned By', value: staffUser.tag, inline: true },
      {
        name: 'Appeal Eligibility',
        value: appealAfterMs ? `Can appeal <t:${Math.floor(appealAfterMs / 1000)}:R>` : 'Can appeal immediately',
        inline: true,
      },
      { name: 'Reason', value: truncate(reason, 1000) }
    )
    .setThumbnail(targetUser.displayAvatarURL())
    .setTimestamp();

  if (!banExecuted) {
    embed.addFields({
      name: '⚠️ Note',
      value: 'Could not remove them from the server automatically (missing permissions or already not a member). The ban record was still logged and appeals will still work.',
    });
  }

  const channel = await guild.channels.fetch(CHANNELS.APPEALS_AND_BANS).catch(() => null);
  if (channel) await channel.send({ embeds: [embed] });

  return { banExecuted, robloxId, resolvedRobloxUsername };
}

// ─────────────────────────────────────────────────────────────
// /ban
// ─────────────────────────────────────────────────────────────
const ban = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user and log it')
    .addStringOption(o =>
      o.setName('discord_target').setDescription('Their Discord username or ID (ID required if they already left)').setRequired(true)
    )
    .addStringOption(o => o.setName('roblox_username').setDescription('Their Roblox username').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the ban').setRequired(true))
    .addIntegerOption(o =>
      o
        .setName('appeal_after_days')
        .setDescription('Days before they may appeal (0 = can appeal immediately)')
        .setMinValue(0)
        .setMaxValue(365)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const discordTarget = interaction.options.getString('discord_target');
    const robloxUsername = interaction.options.getString('roblox_username');
    const reason = interaction.options.getString('reason');
    const appealAfterDays = interaction.options.getInteger('appeal_after_days') ?? 0;

    const targetUser = await resolveDiscordUser(interaction, discordTarget);
    if (!targetUser) {
      return interaction.editReply(
        `❌ Could not find a Discord user matching "${discordTarget}". If they've already left the server, use their **Discord ID** (numbers only) instead — usernames only resolve for current members.`
      );
    }

    const result = await performBan(interaction.guild, {
      targetUser,
      robloxUsername,
      reason,
      appealAfterDays,
      staffUser: interaction.user,
      isAutomatic: false,
    });

    await interaction.editReply(
      `✅ Banned **${targetUser.tag}** and logged it${result.banExecuted ? '' : ' (⚠️ could not remove them from the server — check bot permissions)'}.`
    );
  },
};

// ─────────────────────────────────────────────────────────────
// /warn
// ─────────────────────────────────────────────────────────────
const warn = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .addUserOption(o => o.setName('discord_user').setDescription('The Discord user to warn').setRequired(true))
    .addStringOption(o => o.setName('roblox_username').setDescription('Their Roblox username').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the warning').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getUser('discord_user');
    const robloxUsername = interaction.options.getString('roblox_username');
    const reason = interaction.options.getString('reason');

    const robloxInfo = await getRobloxUser(robloxUsername);
    const robloxId = robloxInfo ? robloxInfo.id : 'Unknown';
    const resolvedRobloxUsername = robloxInfo ? robloxInfo.username : robloxUsername;

    const warning = {
      reason,
      robloxUsername: resolvedRobloxUsername,
      robloxId,
      warnedBy: interaction.user.tag,
      timestamp: Date.now(),
    };
    const warnings = db.addWarning(targetUser.id, warning);
    const count = warnings.length;

    const embed = new EmbedBuilder()
      .setColor(COLORS.WARN)
      .setTitle(`Warning (${count}/${WARNINGS_BEFORE_AUTOBAN})`)
      .addFields(
        { name: 'Discord User', value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
        { name: 'Discord ID', value: targetUser.id, inline: true },
        { name: 'Roblox Username', value: resolvedRobloxUsername, inline: true },
        { name: 'Roblox ID', value: String(robloxId), inline: true },
        { name: 'Warned By', value: interaction.user.tag, inline: true },
        { name: 'Reason', value: truncate(reason, 1000) }
      )
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();

    const channel = await interaction.guild.channels.fetch(CHANNELS.WARNINGS).catch(() => null);
    if (channel) await channel.send({ embeds: [embed] });

    if (count >= WARNINGS_BEFORE_AUTOBAN) {
      db.clearWarnings(targetUser.id);
      await performBan(interaction.guild, {
        targetUser,
        robloxUsername: resolvedRobloxUsername,
        reason: `Automatic ban after reaching ${WARNINGS_BEFORE_AUTOBAN} warnings.`,
        appealAfterDays: AUTOBAN_APPEAL_AFTER_DAYS,
        staffUser: interaction.client.user,
        isAutomatic: true,
      });
      await interaction.editReply(
        `⚠️ Warned **${targetUser.tag}** (${count}/${WARNINGS_BEFORE_AUTOBAN}). This was their 3rd warning — they have been **automatically banned for ${AUTOBAN_APPEAL_AFTER_DAYS} days** (not appealable until then).`
      );
    } else {
      await interaction.editReply(`✅ Warned **${targetUser.tag}** (${count}/${WARNINGS_BEFORE_AUTOBAN}).`);
    }
  },
};

// ─────────────────────────────────────────────────────────────
// /blacklist
// ─────────────────────────────────────────────────────────────
const blacklist = {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Blacklist a user from receiving promotions')
    .addStringOption(o => o.setName('roblox_username').setDescription('Their Roblox username').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the blacklist').setRequired(true))
    .addUserOption(o => o.setName('discord_user').setDescription('Their Discord account, if known').setRequired(false))
    .addAttachmentOption(o => o.setName('proof').setDescription('Optional proof (screenshot, etc.)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const robloxUsername = interaction.options.getString('roblox_username');
    const reason = interaction.options.getString('reason');
    const discordUser = interaction.options.getUser('discord_user');
    const proof = interaction.options.getAttachment('proof');

    const robloxInfo = await getRobloxUser(robloxUsername);
    const robloxId = robloxInfo ? robloxInfo.id : 'Unknown';
    const resolvedRobloxUsername = robloxInfo ? robloxInfo.username : robloxUsername;

    db.addBlacklist(resolvedRobloxUsername, {
      robloxUsername: resolvedRobloxUsername,
      robloxId,
      discordId: discordUser ? discordUser.id : null,
      discordTag: discordUser ? discordUser.tag : null,
      reason,
      proofUrl: proof ? proof.url : null,
      blacklistedBy: interaction.user.tag,
      timestamp: Date.now(),
    });

    const embed = new EmbedBuilder()
      .setColor(COLORS.BLACKLIST)
      .setTitle('Blacklist Entry')
      .addFields(
        { name: 'Roblox Username', value: resolvedRobloxUsername, inline: true },
        { name: 'Roblox ID', value: String(robloxId), inline: true },
        { name: 'Discord User', value: discordUser ? `${discordUser.tag} (<@${discordUser.id}>)` : 'Not provided', inline: true },
        { name: 'Discord ID', value: discordUser ? discordUser.id : 'Not provided', inline: true },
        { name: 'Blacklisted By', value: interaction.user.tag, inline: true },
        { name: 'Reason', value: truncate(reason, 1000) }
      )
      .setTimestamp();

    if (discordUser) embed.setThumbnail(discordUser.displayAvatarURL());
    if (proof) embed.setImage(proof.url);

    const channel = await interaction.guild.channels.fetch(CHANNELS.BLACKLIST).catch(() => null);
    if (channel) await channel.send({ embeds: [embed] });

    await interaction.editReply(`✅ Blacklisted **${resolvedRobloxUsername}** from promotions.`);
  },
};

// ─────────────────────────────────────────────────────────────
// /promote
// ─────────────────────────────────────────────────────────────
const promote = {
  data: new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Promote a member to a higher rank')
    .addUserOption(o => o.setName('discord_user').setDescription('The member to promote').setRequired(true))
    .addRoleOption(o => o.setName('new_rank').setDescription('The rank to promote them to').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the promotion').setRequired(true))
    .addStringOption(o =>
      o.setName('roblox_username').setDescription('Their Roblox username (used for the blacklist check)').setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (RANK_ROLES.length === 0) {
      return interaction.editReply('⚠️ No rank roles are configured yet. Add role IDs to `RANK_ROLES` in `config.js` (lowest to highest).');
    }

    const targetUser = interaction.options.getUser('discord_user');
    const newRank = interaction.options.getRole('new_rank');
    const reason = interaction.options.getString('reason');
    const robloxUsernameInput = interaction.options.getString('roblox_username');

    let robloxId = null;
    let resolvedRobloxUsername = robloxUsernameInput;
    if (robloxUsernameInput) {
      const info = await getRobloxUser(robloxUsernameInput);
      if (info) {
        robloxId = info.id;
        resolvedRobloxUsername = info.username;
      }
    }

    const blacklistEntry = db.findBlacklistEntry({ discordId: targetUser.id, robloxUsername: resolvedRobloxUsername });
    if (blacklistEntry) {
      return interaction.editReply(
        `🚫 **${targetUser.tag}** is blacklisted from promotions.\n**Reason:** ${blacklistEntry.reason}\n**Blacklisted by:** ${blacklistEntry.blacklistedBy}`
      );
    }

    if (!RANK_ROLES.includes(newRank.id)) {
      return interaction.editReply(`❌ **${newRank.name}** isn't a configured rank role. Add its role ID to \`RANK_ROLES\` in \`config.js\`.`);
    }

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return interaction.editReply('❌ Could not find that member in this server.');

    const currentIndex = getCurrentRankIndex(member, RANK_ROLES);
    const newIndex = RANK_ROLES.indexOf(newRank.id);

    if (newIndex <= currentIndex) {
      return interaction.editReply(`❌ **${newRank.name}** is not higher than their current rank. Promotions must move up.`);
    }

    try {
      if (currentIndex !== -1) await member.roles.remove(RANK_ROLES[currentIndex]);
      await member.roles.add(newRank.id);
    } catch (err) {
      console.error(err);
      return interaction.editReply('❌ Could not update roles. Make sure my role is positioned above all rank roles in Server Settings > Roles.');
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.PROMOTE)
      .setTitle('Promotion Log')
      .addFields(
        { name: 'Discord User', value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
        { name: 'Discord ID', value: targetUser.id, inline: true },
        ...(resolvedRobloxUsername
          ? [
              { name: 'Roblox Username', value: resolvedRobloxUsername, inline: true },
              { name: 'Roblox ID', value: String(robloxId ?? 'Unknown'), inline: true },
            ]
          : []),
        { name: 'New Rank', value: `${newRank}`, inline: true },
        { name: 'Promoted By', value: interaction.user.tag, inline: true },
        { name: 'Reason', value: truncate(reason, 1000) }
      )
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();

    const channel = await interaction.guild.channels.fetch(CHANNELS.PROMOTIONS).catch(() => null);
    if (channel) await channel.send({ embeds: [embed] });

    await interaction.editReply(`✅ Promoted **${targetUser.tag}** to **${newRank.name}**.`);
  },
};

// ─────────────────────────────────────────────────────────────
// /demote
// ─────────────────────────────────────────────────────────────
const demote = {
  data: new SlashCommandBuilder()
    .setName('demote')
    .setDescription('Demote a member to a lower rank')
    .addUserOption(o => o.setName('discord_user').setDescription('The member to demote').setRequired(true))
    .addRoleOption(o => o.setName('new_rank').setDescription('The rank to demote them to').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the demotion').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (RANK_ROLES.length === 0) {
      return interaction.editReply('⚠️ No rank roles are configured yet. Add role IDs to `RANK_ROLES` in `config.js` (lowest to highest).');
    }

    const targetUser = interaction.options.getUser('discord_user');
    const newRank = interaction.options.getRole('new_rank');
    const reason = interaction.options.getString('reason');

    if (!RANK_ROLES.includes(newRank.id)) {
      return interaction.editReply(`❌ **${newRank.name}** isn't a configured rank role. Add its role ID to \`RANK_ROLES\` in \`config.js\`.`);
    }

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return interaction.editReply('❌ Could not find that member in this server.');

    const currentIndex = getCurrentRankIndex(member, RANK_ROLES);
    if (currentIndex === -1) {
      return interaction.editReply(`❌ **${targetUser.tag}** doesn't currently hold any configured rank role.`);
    }

    const newIndex = RANK_ROLES.indexOf(newRank.id);
    if (newIndex >= currentIndex) {
      return interaction.editReply(`❌ **${newRank.name}** is not lower than their current rank (<@&${RANK_ROLES[currentIndex]}>). Demotions must move down.`);
    }

    try {
      await member.roles.remove(RANK_ROLES[currentIndex]);
      await member.roles.add(newRank.id);
    } catch (err) {
      console.error(err);
      return interaction.editReply('❌ Could not update roles. Make sure my role is positioned above all rank roles in Server Settings > Roles.');
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.DEMOTE)
      .setTitle('Demotion Log')
      .addFields(
        { name: 'Discord User', value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
        { name: 'Discord ID', value: targetUser.id, inline: true },
        { name: 'New Rank', value: `${newRank}`, inline: true },
        { name: 'Demoted By', value: interaction.user.tag, inline: true },
        { name: 'Reason', value: truncate(reason, 1000) }
      )
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();

    const channel = await interaction.guild.channels.fetch(CHANNELS.DEMOTIONS).catch(() => null);
    if (channel) await channel.send({ embeds: [embed] });

    await interaction.editReply(`✅ Demoted **${targetUser.tag}** to **${newRank.name}**.`);
  },
};

module.exports = { ban, warn, blacklist, promote, demote };
