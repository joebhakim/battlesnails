import * as THREE from 'three';

import { cloneCollisionShape } from './CollisionShape.js';
import { createStalkState, STALK_SIDE_KEYS, applyProfileToStalks } from './StalkControlSystem.js';
import { createEmptySnailStats } from './SnailPowerups.js';
import { createSimulationProfiles, type SimulationProfiles } from './Tuning.js';
import { createFixturePosition } from './WorldPropSystem.js';
import { createTerrainPosition, type TerrainConfig } from '../world/Terrain.js';
import { estimateTerrainBodyClearance } from '../world/TerrainClearance.js';

interface PlainXZ {
  x: number;
  z: number;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);

const PLAYER_STARTS = new Map<number, Readonly<PlainXZ>>([
  [1, Object.freeze({ x: 0, z: 6 })],
  [2, Object.freeze({ x: 0, z: -6 })]
]);

function createRingPoints(radius: number, count: number, angleOffset = 0): PlainXZ[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = angleOffset + (index / count) * Math.PI * 2;
    return {
      x: Math.sin(angle) * radius,
      z: Math.cos(angle) * radius
    };
  });
}

const BOT_STARTS = [
  ...createRingPoints(8, 8, Math.PI / 8),
  ...createRingPoints(12.5, 12, 0),
  ...createRingPoints(17, 20, Math.PI / 20)
];

function getInitialStartPoint(slot: number) {
  if (PLAYER_STARTS.has(slot)) {
    return PLAYER_STARTS.get(slot);
  }

  const botIndex = Math.max(0, slot - 3);
  return BOT_STARTS[botIndex % BOT_STARTS.length];
}

function createInitialPosition(point: PlainXZ, terrainConfig: TerrainConfig, profile: any, rotationY: number) {
  const position = createTerrainPosition(point.x, point.z, terrainConfig);
  position.y += estimateTerrainBodyClearance({
    x: point.x,
    z: point.z,
    rotationY,
    terrainConfig,
    aboveGroundHeight: profile.groundHeight ?? 0
  });
  position.y += Math.max(0, profile.spawnDropHeight ?? 0);
  return position;
}

function getProfileSpawnDropHeight(profile: any) {
  return Math.max(0, profile.spawnDropHeight ?? 0);
}

function createFixtureState(participant: any, terrainConfig: TerrainConfig) {
  const position = createFixturePosition(participant, terrainConfig);
  const maxHealth = participant.maxHealth ?? 1;
  const profile = {
    maxHealth,
    bodyRadius: participant.bodyRadius ?? 1,
    groundHeight: 0,
    arenaRadius: 22,
    staticBody: true
  };
  const fixtureKind = participant.fixtureKind ?? 'fixture';

  return {
    slot: participant.slot,
    profileName: participant.profile ?? 'fixture',
    fixtureKind,
    displayName: participant.displayName ?? fixtureKind,
    speakerKind: participant.speakerKind ?? null,
    portraitKey: participant.portraitKey ?? null,
    voiceSource: participant.voiceSource ?? null,
    connected: participant.connected ?? true,
    profile,
    position,
    previousPosition: position.clone(),
    bodyVelocity: new THREE.Vector3(),
    eyeTipPosition: position.clone(),
    previousEyeTipPosition: position.clone(),
    eyeTipVelocity: new THREE.Vector3(),
    stalks: null,
    rotationY: participant.rotationY ?? 0,
    health: maxHealth,
    maxHealth,
    immortal: Boolean(participant.immortal),
    staticBody: true,
    onTrail: false,
    grounded: true,
    supportNormal: WORLD_UP.clone(),
    supportKind: 'terrain',
    supportSurfaceId: null,
    verticalVelocity: 0,
    lockOnHeld: false,
    controlMode: 'static',
    controlIntensity: 0,
    impactPower: 0,
    bodyRadius: participant.bodyRadius ?? 1,
    collisionShape: cloneCollisionShape(participant.collisionShape)
  };
}

export function createPlayerState(
  slot: number,
  profileName: string,
  connected = true,
  profileTemplates: SimulationProfiles = createSimulationProfiles(),
  terrainConfig: TerrainConfig,
  participant: any = null
) {
  if (participant?.fixtureKind) {
    return createFixtureState(participant, terrainConfig);
  }

  const profile = profileTemplates[profileName] ?? profileTemplates.human;
  const startPoint = participant?.position
    ? {
      x: participant.position.x ?? 0,
      z: participant.position.z ?? 0
    }
    : getInitialStartPoint(slot);
  const initialRotation = Number.isFinite(participant?.rotationY)
    ? participant.rotationY
    : slot === 1 ? Math.PI : slot === 2 ? 0 : Math.atan2(-startPoint.x, -startPoint.z);
  const position = createInitialPosition(startPoint, terrainConfig, profile, initialRotation);
  const spawnDropHeight = getProfileSpawnDropHeight(profile);
  const stalks = Object.fromEntries(
    STALK_SIDE_KEYS.map((side) => [side, createStalkState(profile, position, initialRotation, side)])
  );
  const eyeTipPosition = stalks.left.tipPosition.clone().add(stalks.right.tipPosition).multiplyScalar(0.5);

  return {
    slot,
    profileName,
    displayName: participant?.displayName ?? null,
    speakerKind: participant?.speakerKind ?? null,
    portraitKey: participant?.portraitKey ?? null,
    voiceSource: participant?.voiceSource ?? null,
    startPoint: { x: startPoint.x, z: startPoint.z },
    connected,
    profile,
    position,
    previousPosition: position.clone(),
    bodyVelocity: new THREE.Vector3(),
    eyeTipPosition,
    previousEyeTipPosition: eyeTipPosition.clone(),
    eyeTipVelocity: new THREE.Vector3(),
    stalks,
    rotationY: initialRotation,
    health: profile.maxHealth,
    maxHealth: profile.maxHealth,
    baseMaxHealth: profile.maxHealth,
    snailStats: createEmptySnailStats(),
    onTrail: false,
    grounded: spawnDropHeight <= 0,
    supportNormal: WORLD_UP.clone(),
    supportKind: 'terrain',
    supportSurfaceId: null,
    verticalVelocity: 0,
    immortal: Boolean(participant?.immortal),
    lockOnHeld: false,
    controlMode: 'idle',
    controlIntensity: 0,
    impactPower: 0,
    bodyRadius: profile.bodyRadius
  };
}

export function applyProfileToPlayer(player: any, profile: any) {
  if (player.fixtureKind) {
    return;
  }

  player.profile = profile;
  player.baseMaxHealth = profile.maxHealth;
  const calcium = Math.max(0, Number(player.snailStats?.calcium) || 0);
  player.maxHealth = profile.maxHealth + calcium;
  player.health = Math.min(player.health, player.maxHealth);
  player.bodyRadius = profile.bodyRadius;

  applyProfileToStalks(player, profile);
}

export function applyArenaRadiusOverride(profileTemplates: SimulationProfiles, arenaRadius: number) {
  if (!Number.isFinite(arenaRadius)) {
    return;
  }

  for (const profile of Object.values(profileTemplates) as any[]) {
    if (profile && Number.isFinite(profile.arenaRadius)) {
      profile.arenaRadius = arenaRadius;
    }
  }
}
