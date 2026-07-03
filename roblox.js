// Looks up a Roblox account's numeric ID (and correctly-cased username)
// from a typed username, using Roblox's public Users API. Returns null
// if the lookup fails or the username doesn't exist — callers should
// fall back to the raw typed username in that case.
async function getRobloxUser(username) {
  if (!username) return null;
  try {
    const res = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.data || json.data.length === 0) return null;
    const user = json.data[0];
    return { id: user.id, username: user.name, displayName: user.displayName };
  } catch (err) {
    console.error('Roblox lookup failed:', err.message);
    return null;
  }
}

module.exports = { getRobloxUser };
