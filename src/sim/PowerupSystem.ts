import {
  SNAIL_POWERUP_LABELS,
  SNAIL_POWERUP_TYPES,
  createEmptySnailStats,
  getPowerupForProp,
  updateSnailStatDerivedValues
} from './SnailPowerups.js';

const WORLD_PROP_INTERACTION_DISTANCE = 3.1;
const WORLD_PROP_PICKUP_DISTANCE = 1.35;

function cloneVector(vector: { x: number; y: number; z: number }) {
  return { x: vector.x, y: vector.y, z: vector.z };
}

export function applyPowerupToPlayer({ player, powerup, prop, tick }: any) {
  if (!player.snailStats) {
    player.snailStats = createEmptySnailStats();
  }

  const amount = Math.max(0, Number(powerup.amount) || 0);
  player.snailStats.pickups += 1;

  switch (powerup.type) {
    case 'dew':
      player.snailStats.dew += amount;
      break;
    case 'food':
      player.snailStats.food += amount;
      player.health = Math.min(player.maxHealth, player.health + amount);
      break;
    case 'calcium':
      player.snailStats.calcium += amount;
      player.maxHealth = (player.baseMaxHealth ?? player.profile.maxHealth) + player.snailStats.calcium;
      player.health = Math.min(player.maxHealth, player.health + amount * 0.65);
      break;
    case 'grit':
      player.snailStats.grit += amount;
      break;
  }

  updateSnailStatDerivedValues(player.snailStats);
  const burstPosition = cloneVector(prop.position);
  burstPosition.y = Math.max(
    burstPosition.y + Math.max(1, (prop.bodyRadius ?? 0) * 0.65),
    player.position.y + Math.max(1.6, player.bodyRadius * 1.2)
  );

  return {
    id: `${tick}:powerup:${player.slot}:${prop.id}`,
    type: 'powerup',
    tick,
    playerSlot: player.slot,
    propId: prop.id,
    powerupType: powerup.type,
    amount,
    label: powerup.label,
    position: burstPosition
  };
}

export function collectNearbyPowerups({
  player,
  tick,
  getNearbyWorldProps,
  removeWorldPropById
}: any) {
  if (!player.connected || player.health <= 0 || player.fixtureKind) {
    return [];
  }

  const candidates = getNearbyWorldProps(player.position, player.bodyRadius + WORLD_PROP_PICKUP_DISTANCE + 8);
  for (const prop of candidates) {
    const powerup = getPowerupForProp(prop);
    if (!powerup) {
      continue;
    }

    const distance = Math.hypot(
      player.position.x - prop.position.x,
      player.position.z - prop.position.z
    );
    const pickupDistance = player.bodyRadius + prop.bodyRadius + WORLD_PROP_PICKUP_DISTANCE;
    if (distance > pickupDistance) {
      continue;
    }

    const removed = removeWorldPropById(prop.id);
    if (!removed) {
      continue;
    }

    return [applyPowerupToPlayer({ player, powerup, prop: removed, tick })];
  }

  return [];
}

export function grantPowerupToSlot({
  players,
  slot,
  type,
  amount = 1,
  label = null,
  tick
}: any) {
  if (!SNAIL_POWERUP_TYPES.includes(type)) {
    return { granted: false, events: [] };
  }

  const player = players.get(slot);
  if (!player || !player.connected || player.health <= 0 || player.fixtureKind) {
    return { granted: false, events: [] };
  }

  const safeAmount = Math.max(0, Number(amount) || 0);
  const debugIndex = (player.snailStats?.pickups ?? 0) + 1;
  const event = applyPowerupToPlayer({
    player,
    powerup: {
      type,
      amount: safeAmount,
      label: label ?? SNAIL_POWERUP_LABELS[type] ?? type
    },
    prop: {
      id: `debug-${type}-${slot}-${tick}-${debugIndex}`,
      position: cloneVector(player.position),
      bodyRadius: player.bodyRadius
    },
    tick
  });

  return { granted: true, events: [event] };
}

export function resolveWorldPropInteraction({ player, tick, getNearbyWorldProps }: any) {
  if (!player.connected || player.health <= 0 || player.fixtureKind) {
    return [];
  }

  let nearestLog = null;
  let nearestDistance = Infinity;
  const interactionProps = getNearbyWorldProps(
    player.position,
    WORLD_PROP_INTERACTION_DISTANCE + player.bodyRadius + 12
  );

  for (const prop of interactionProps) {
    if (prop.interactionKind !== 'rotting_log') {
      continue;
    }

    const distance = Math.hypot(
      player.position.x - prop.position.x,
      player.position.z - prop.position.z
    );
    const interactionDistance = WORLD_PROP_INTERACTION_DISTANCE + player.bodyRadius + prop.bodyRadius;
    if (distance < interactionDistance && distance < nearestDistance) {
      nearestLog = prop;
      nearestDistance = distance;
    }
  }

  if (!nearestLog) {
    return [];
  }

  return [{
    id: `${tick}:nibble:${player.slot}:${nearestLog.id}`,
    type: 'log_nibble',
    tick,
    playerSlot: player.slot,
    propId: nearestLog.id,
    position: cloneVector(nearestLog.position)
  }];
}
