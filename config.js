// ─────────────────────────────────────────────────────────────
// College of Conquerors — bot configuration
// ─────────────────────────────────────────────────────────────

module.exports = {
  CHANNELS: {
    // Ban logs AND ban appeals both post here
    APPEALS_AND_BANS: '1522313232478503062',
    BLACKLIST: '1522595479177793686',
    PROMOTIONS: '1522238069657440274',
    DEMOTIONS: '1522238069657440275',
    WARNINGS: '1522238069657440273',
  },

  // ⚠️ REQUIRED SETUP: add your server's rank role IDs below, ordered from
  // LOWEST rank to HIGHEST rank. This list is what powers /promote and /demote
  // — the bot uses each member's highest role in this list as their "current
  // rank" and only lets staff move them to another role in this same list.
  //
  // How to get a role ID:
  //  1. Discord app -> User Settings -> Advanced -> turn on Developer Mode
  //  2. Server Settings -> Roles -> right-click a rank role -> Copy Role ID
  //
  // Example (do not copy these IDs, they're just illustrating the order):
  // RANK_ROLES: [
  //   '1522297590291366119', // Verified         
  //   '1522238068470583477', // Participant
  //   '1522238068470583479', // Respected Participant
  //   '1522238068470583482', // Event Host  
  //   '1522238068470583485', // Trial Moderator
  //   '1522238068487356586', // Moderator
  //   '1522238068487356587', // Trial Administrator
  //   '1522238068487356588', // Administrator
  //   '1522238068487356589', // Head Administrator
  //   '1522309665260834856', // Vice-Chief of Staff
  //   '1522255928009818284', // Chief of Staff
  
  // ],
  RANK_ROLES: [
    // add your role IDs here, lowest to highest
     '1522297590291366119', // Verified         
     '1522238068470583477', // Participant
     '1522238068470583479', // Respected Participant
     '1522238068470583482', // Event Host  
     '1522238068470583485', // Trial Moderator
     '1522238068487356586', // Moderator
     '1522238068487356587', // Trial Administrator
     '1522238068487356588', // Administrator
     '1522238068487356589', // Head Administrator
     '1522309665260834856', // Vice-Chief of Staff
     '1522255928009818284', // Chief of Staff  
  ], 

  COLORS: {
    BAN: 0xE74C3C,
    PROMOTE: 0x2ECC71,
    DEMOTE: 0xE67E22,
    WARN: 0xF1C40F,
    APPEAL: 0x3498DB,
    APPEAL_APPROVED: 0x2ECC71,
    APPEAL_DENIED: 0xE74C3C,
    BLACKLIST: 0x992D22,
  },

  WARNINGS_BEFORE_AUTOBAN: 3,
  AUTOBAN_APPEAL_AFTER_DAYS: 7,
};
