function truncate(str, max) {
  if (!str) return str;
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// Returns the index (within RANK_ROLES) of the highest-ranked role the
// member currently holds, or -1 if they hold none of the configured
// rank roles.
function getCurrentRankIndex(member, RANK_ROLES) {
  let highestIndex = -1;
  for (const roleId of member.roles.cache.keys()) {
    const idx = RANK_ROLES.indexOf(roleId);
    if (idx > highestIndex) highestIndex = idx;
  }
  return highestIndex;
}

module.exports = { truncate, getCurrentRankIndex };
