const fs = require('fs');
const path = require('path');

// Point DATA_DIR at a mounted Railway Volume in production so this survives
// redeploys. Defaults to a local ./data folder for quick testing.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ bans: {}, warnings: {}, blacklist: {} }, null, 2));
  }
}

function load() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    console.error('Failed to read data file, starting fresh:', err);
    return { bans: {}, warnings: {}, blacklist: {} };
  }
}

function save(data) {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ---------------- Bans ----------------
function setBan(discordId, banData) {
  const data = load();
  data.bans[discordId] = banData;
  save(data);
}

function getBan(discordId) {
  const data = load();
  return data.bans[discordId] || null;
}

function updateBanStatus(discordId, status, extra = {}) {
  const data = load();
  if (data.bans[discordId]) {
    data.bans[discordId].status = status;
    Object.assign(data.bans[discordId], extra);
    save(data);
  }
  return data.bans[discordId] || null;
}

// ---------------- Warnings ----------------
function addWarning(discordId, warning) {
  const data = load();
  if (!data.warnings[discordId]) data.warnings[discordId] = [];
  data.warnings[discordId].push(warning);
  save(data);
  return data.warnings[discordId];
}

function getWarnings(discordId) {
  const data = load();
  return data.warnings[discordId] || [];
}

function clearWarnings(discordId) {
  const data = load();
  data.warnings[discordId] = [];
  save(data);
}

// ---------------- Blacklist ----------------
function addBlacklist(robloxUsername, entry) {
  const data = load();
  data.blacklist[robloxUsername.toLowerCase()] = entry;
  save(data);
}

function findBlacklistEntry({ discordId, robloxUsername }) {
  const data = load();
  if (robloxUsername && data.blacklist[robloxUsername.toLowerCase()]) {
    return data.blacklist[robloxUsername.toLowerCase()];
  }
  if (discordId) {
    for (const key in data.blacklist) {
      if (data.blacklist[key].discordId === discordId) return data.blacklist[key];
    }
  }
  return null;
}

module.exports = {
  setBan, getBan, updateBanStatus,
  addWarning, getWarnings, clearWarnings,
  addBlacklist, findBlacklistEntry,
};
