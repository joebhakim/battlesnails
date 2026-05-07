import { cloneCollisionShape } from './CollisionShape.js';
import { cloneSnailStats } from './SnailPowerups.js';
import { serializeStalks } from './StalkControlSystem.js';

const SNAPSHOT_WORLD_UP = Object.freeze({ x: 0, y: 1, z: 0 });

export function cloneVector(vector: { x: number; y: number; z: number }) {
  return { x: vector.x, y: vector.y, z: vector.z };
}

export function cloneWorldProp(prop: any) {
  return {
    ...prop,
    position: prop.position ? { ...prop.position } : null,
    collisionShape: cloneCollisionShape(prop.collisionShape),
    powerup: prop.powerup ? { ...prop.powerup } : null,
    visual: prop.visual ? { ...prop.visual } : {}
  };
}

export function cloneSnapshotEvent(event: any) {
  const cloned: any = {
    ...event,
    position: event.position ? { ...event.position } : null,
    shadowPosition: event.shadowPosition ? { ...event.shadowPosition } : undefined
  };

  if (event.knockback) {
    cloned.knockback = { ...event.knockback };
  }

  return cloned;
}

export function serializeSnapshotPlayer(player: any, { includeStalkNodes = true }: any = {}) {
  return {
    slot: player.slot,
    profileName: player.profileName,
    fixtureKind: player.fixtureKind ?? null,
    displayName: player.displayName ?? null,
    speakerKind: player.speakerKind ?? null,
    portraitKey: player.portraitKey ?? null,
    voiceSource: player.voiceSource ?? null,
    immortal: Boolean(player.immortal),
    collisionShape: cloneCollisionShape(player.collisionShape),
    connected: player.connected,
    position: cloneVector(player.position),
    rotationY: player.rotationY,
    health: player.health,
    maxHealth: player.maxHealth,
    groundHeight: player.profile.groundHeight,
    onTrail: player.onTrail,
    grounded: player.grounded,
    supportKind: player.supportKind,
    supportNormal: cloneVector(player.supportNormal ?? SNAPSHOT_WORLD_UP),
    lockOn: player.lockOnHeld,
    controlMode: player.controlMode,
    controlIntensity: player.controlIntensity,
    impactPower: player.impactPower,
    snailStats: cloneSnailStats(player.snailStats),
    stalks: serializeStalks(player, { includeNodes: includeStalkNodes })
  };
}

export function serializeNetworkPlayer(player: any, { includeStatic = true } = {}) {
  const serialized = {
    slot: player.slot,
    connected: player.connected,
    position: cloneVector(player.position),
    rotationY: player.rotationY,
    health: player.health,
    onTrail: player.onTrail,
    grounded: player.grounded,
    supportKind: player.supportKind,
    supportNormal: cloneVector(player.supportNormal ?? SNAPSHOT_WORLD_UP),
    lockOn: player.lockOnHeld,
    controlMode: player.controlMode,
    controlIntensity: player.controlIntensity,
    impactPower: player.impactPower,
    snailStats: cloneSnailStats(player.snailStats)
  };

  if (!includeStatic) {
    return serialized;
  }

  return {
    ...serialized,
    profileName: player.profileName,
    fixtureKind: player.fixtureKind ?? null,
    displayName: player.displayName ?? null,
    speakerKind: player.speakerKind ?? null,
    portraitKey: player.portraitKey ?? null,
    voiceSource: player.voiceSource ?? null,
    immortal: Boolean(player.immortal),
    collisionShape: cloneCollisionShape(player.collisionShape),
    maxHealth: player.maxHealth,
    groundHeight: player.profile.groundHeight
  };
}
