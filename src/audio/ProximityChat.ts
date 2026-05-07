export const PROXIMITY_CHAT_MAX_DISTANCE = 120;
export const PROXIMITY_CHAT_MAX_SPEAKERS = 4;
export const PROXIMITY_CHAT_TEST_DISTANCE = PROXIMITY_CHAT_MAX_DISTANCE * 0.45;
export const ANNOYING_LECTURER_SLOT = 8801;
export const ANNOYING_LECTURER_DISPLAY_NAME = 'Annoying Lecturer';
export const ANNOYING_LECTURER_SPEAKER_KIND = 'annoying_lecturer';
export const ANNOYING_LECTURER_PUBLIC_DOMAIN_SOURCE =
  'https://commons.wikimedia.org/wiki/Special:Redirect/file/JFK_inaugural_address.ogg';
export const ANNOYING_LECTURER_VOICE_SOURCE = ANNOYING_LECTURER_PUBLIC_DOMAIN_SOURCE;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getPlanarDistance(left: any, right: any) {
  if (!left?.position || !right?.position) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.hypot(
    (right.position.x ?? 0) - (left.position.x ?? 0),
    (right.position.z ?? 0) - (left.position.z ?? 0)
  );
}

function canShowProximityPortrait(player: any) {
  if (!player || !player.connected || player.health <= 0) {
    return false;
  }

  if (!player.fixtureKind) {
    return true;
  }

  return Boolean(player.speakerKind || player.voiceSource);
}

export function getProximityChatVolume(distance: number, maxDistance = PROXIMITY_CHAT_MAX_DISTANCE) {
  if (!Number.isFinite(distance) || distance >= maxDistance) {
    return 0;
  }

  const normalized = clamp(distance / Math.max(0.0001, maxDistance), 0, 1);
  return Number((1 - (normalized ** 1.65)).toFixed(3));
}

export function getProximitySpeakerName(player: any) {
  if (player?.displayName) {
    return player.displayName;
  }

  if (player?.profileName === 'bot') {
    return 'Wild Snail';
  }

  return player?.slot ? `Snail ${player.slot}` : 'Unknown Snail';
}

export function buildProximitySpeakerEntries(
  localPlayer: any,
  players: any[] = [],
  options: any = {}
) {
  const maxDistance = Number.isFinite(options.maxDistance)
    ? Math.max(0.0001, options.maxDistance)
    : PROXIMITY_CHAT_MAX_DISTANCE;
  const maxSpeakers = Number.isFinite(options.maxSpeakers)
    ? Math.max(1, Math.floor(options.maxSpeakers))
    : PROXIMITY_CHAT_MAX_SPEAKERS;

  if (!localPlayer?.position) {
    return [];
  }

  return players
    .filter((player) => player?.slot !== localPlayer.slot && canShowProximityPortrait(player))
    .map((player) => {
      const distance = getPlanarDistance(localPlayer, player);
      const volume = getProximityChatVolume(distance, maxDistance);
      if (volume <= 0) {
        return null;
      }

      return {
        slot: player.slot,
        name: getProximitySpeakerName(player),
        distance,
        volume,
        speakerKind: player.speakerKind ?? null,
        portraitKey: player.portraitKey ?? player.speakerKind ?? player.profileName ?? 'snail',
        voiceSource: player.voiceSource ?? null,
        isLecturer: player.speakerKind === ANNOYING_LECTURER_SPEAKER_KIND
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, maxSpeakers);
}
