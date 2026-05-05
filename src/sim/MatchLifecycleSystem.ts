export function getLivingPlayers(players: Iterable<any>, { humansOnly = false } = {}) {
  return Array.from(players).filter((player) => (
    player.connected &&
    player.health > 0 &&
    (!humansOnly || player.profileName !== 'bot')
  ));
}

export function findPreferredTarget(players: Iterable<any>, player: any, { preferHumans = false } = {}) {
  const candidates = getLivingPlayers(players).filter((candidate) => candidate.slot !== player.slot);
  if (candidates.length === 0) {
    return null;
  }

  const humanCandidates = preferHumans
    ? candidates.filter((candidate) => candidate.profileName !== 'bot')
    : [];
  const pool = humanCandidates.length > 0 ? humanCandidates : candidates;

  return pool.reduce((nearest, candidate) => {
    if (!nearest) {
      return candidate;
    }

    const nearestDistance = nearest.position.distanceToSquared(player.position);
    const candidateDistance = candidate.position.distanceToSquared(player.position);
    return candidateDistance < nearestDistance ? candidate : nearest;
  }, null);
}

export function evaluateMatchEndState({ mode, players }: any) {
  if (mode === 'test') {
    return null;
  }

  const allPlayers: any[] = Array.from(players.values());
  const livingPlayers = getLivingPlayers(allPlayers);
  const livingHumans = livingPlayers.filter((player) => player.profileName !== 'bot');
  const livingBots = livingPlayers.filter((player) => player.profileName === 'bot');

  if (mode === 'explorer') {
    if (livingHumans.length > 0) {
      return null;
    }

    return { winnerSlot: livingBots[0]?.slot ?? null, reason: 'knockout' };
  }

  if (mode === 'multiplayer_adventure_pve') {
    if (livingHumans.length > 0 && livingBots.length > 0) {
      return null;
    }

    if (livingHumans.length > 0) {
      return { winnerSlot: livingHumans[0].slot, reason: 'knockout' };
    }

    return {
      winnerSlot: livingBots[0]?.slot ?? null,
      reason: livingBots.length > 0 ? 'knockout' : 'draw'
    };
  }

  if (
    mode === 'multiplayer' ||
    mode === 'multiplayer_online_test_plane' ||
    mode === 'multiplayer_arena_pvp' ||
    mode === 'multiplayer_adventure_pvp'
  ) {
    if (livingHumans.length > 1) {
      return null;
    }

    if (livingHumans.length === 1) {
      return { winnerSlot: livingHumans[0].slot, reason: 'knockout' };
    }

    return { winnerSlot: null, reason: 'draw' };
  }

  const hasBots = allPlayers.some((player) => player.profileName === 'bot');
  if (hasBots) {
    if (livingHumans.length > 0 && livingBots.length > 0) {
      return null;
    }

    if (livingHumans.length > 0) {
      return { winnerSlot: livingHumans[0].slot, reason: 'knockout' };
    }

    if (livingBots.length > 0) {
      return { winnerSlot: livingBots[0].slot, reason: 'knockout' };
    }

    return { winnerSlot: null, reason: 'draw' };
  }

  if (livingPlayers.length > 1) {
    return null;
  }

  if (livingPlayers.length === 1) {
    return { winnerSlot: livingPlayers[0].slot, reason: 'knockout' };
  }

  return { winnerSlot: null, reason: 'draw' };
}
