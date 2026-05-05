import * as THREE from 'three';

import { getTerrainHeight, type TerrainConfig } from '../world/Terrain.js';
import { getCollisionShapeRadius } from './CollisionShape.js';

export const BIRD_DETECTION_RADIUS = 175;
export const BIRD_TRACK_DURATION = 0.55;
export const BIRD_SWOOP_DURATION = 1.1;
export const BIRD_RECOVER_DURATION = 3.0;
export const BIRD_MIN_COOLDOWN = 10;
export const BIRD_MAX_COOLDOWN = 18;
export const BIRD_WARNING_SHADOW_RADIUS = 11;
export const BIRD_IMPACT_RADIUS = 5;
export const BIRD_PATROL_SHADOW_RADIUS = 4.5;
export const BIRD_SHADOW_TRACK_SPEED = 58;
export const BIRD_SWEEP_TRACK_SPEED = 38;
export const BIRD_COVER_QUERY_RADIUS = 90;
export const BIRD_ATTACK_DAMAGE = 999999;

const PLANAR_EPSILON = 0.000001;

function cloneVector(vector: { x: number; y: number; z: number }) {
  return { x: vector.x, y: vector.y, z: vector.z };
}

export function getBirdGroundPosition(x: number, z: number, terrainConfig: Readonly<TerrainConfig>, offset = 0.08) {
  return new THREE.Vector3(x, getTerrainHeight(x, z, terrainConfig), z).add(new THREE.Vector3(0, offset, 0));
}

function getCreatureHome(rawCreature: any = {}) {
  return {
    x: Number.isFinite(rawCreature.home?.x)
      ? rawCreature.home.x
      : Number.isFinite(rawCreature.position?.x)
        ? rawCreature.position.x
        : 0,
    z: Number.isFinite(rawCreature.home?.z)
      ? rawCreature.home.z
      : Number.isFinite(rawCreature.position?.z)
        ? rawCreature.position.z
        : 0
  };
}

export function normalizeCreature(rawCreature: any = {}, terrainConfig: Readonly<TerrainConfig>, index = 0) {
  const kind = rawCreature.kind ?? 'bird';
  if (kind !== 'bird') {
    return null;
  }

  const home = getCreatureHome(rawCreature);
  const phaseOffset = Number.isFinite(rawCreature.phaseOffset) ? rawCreature.phaseOffset : index * 0.73;
  const patrolRadius = Number.isFinite(rawCreature.patrolRadius) ? rawCreature.patrolRadius : 55;
  const altitude = Number.isFinite(rawCreature.altitude) ? rawCreature.altitude : 75;
  const patrolAngle = Number.isFinite(rawCreature.patrolAngle) ? rawCreature.patrolAngle : phaseOffset;
  const shadowPosition = rawCreature.shadowPosition
    ? getBirdGroundPosition(rawCreature.shadowPosition.x ?? home.x, rawCreature.shadowPosition.z ?? home.z, terrainConfig)
    : getBirdGroundPosition(
      home.x + Math.cos(patrolAngle) * patrolRadius,
      home.z + Math.sin(patrolAngle) * patrolRadius,
      terrainConfig
    );
  const position = rawCreature.position
    ? new THREE.Vector3(
      rawCreature.position.x ?? shadowPosition.x,
      rawCreature.position.y ?? shadowPosition.y + altitude,
      rawCreature.position.z ?? shadowPosition.z
    )
    : new THREE.Vector3(shadowPosition.x, shadowPosition.y + altitude, shadowPosition.z);

  return {
    id: rawCreature.id ? `${rawCreature.id}` : `bird-${index}`,
    kind: 'bird',
    displayName: rawCreature.displayName ?? 'Bird',
    home: new THREE.Vector3(home.x, getTerrainHeight(home.x, home.z, terrainConfig), home.z),
    position,
    shadowPosition,
    rotationY: Number.isFinite(rawCreature.rotationY) ? rawCreature.rotationY : patrolAngle,
    phase: rawCreature.phase ?? 'patrol',
    phaseTimer: Number.isFinite(rawCreature.phaseTimer) ? rawCreature.phaseTimer : 0,
    cooldown: Number.isFinite(rawCreature.cooldown) ? rawCreature.cooldown : BIRD_MIN_COOLDOWN + (phaseOffset % 1) * (BIRD_MAX_COOLDOWN - BIRD_MIN_COOLDOWN),
    targetSlot: Number.isFinite(rawCreature.targetSlot) ? rawCreature.targetSlot : null,
    patrolAngle,
    patrolRadius,
    patrolSpeed: Number.isFinite(rawCreature.patrolSpeed) ? rawCreature.patrolSpeed : 0.18,
    altitude,
    bodyLength: Number.isFinite(rawCreature.bodyLength) ? rawCreature.bodyLength : 5.8,
    wingSpan: Number.isFinite(rawCreature.wingSpan) ? rawCreature.wingSpan : 12,
    warningRadius: Number.isFinite(rawCreature.warningRadius) ? rawCreature.warningRadius : BIRD_WARNING_SHADOW_RADIUS,
    impactRadius: Number.isFinite(rawCreature.impactRadius) ? rawCreature.impactRadius : BIRD_IMPACT_RADIUS,
    attackDamage: Number.isFinite(rawCreature.attackDamage) ? rawCreature.attackDamage : BIRD_ATTACK_DAMAGE,
    shadowRadius: Number.isFinite(rawCreature.shadowRadius) ? rawCreature.shadowRadius : BIRD_PATROL_SHADOW_RADIUS,
    shadowOpacity: Number.isFinite(rawCreature.shadowOpacity) ? rawCreature.shadowOpacity : 0.12
  };
}

export function cloneCreatureDescriptor(creature: any) {
  return {
    id: creature.id,
    kind: creature.kind,
    displayName: creature.displayName,
    home: cloneVector(creature.home),
    position: cloneVector(creature.position),
    shadowPosition: cloneVector(creature.shadowPosition),
    rotationY: creature.rotationY,
    phaseOffset: creature.patrolAngle,
    patrolRadius: creature.patrolRadius,
    patrolSpeed: creature.patrolSpeed,
    altitude: creature.altitude,
    bodyLength: creature.bodyLength,
    wingSpan: creature.wingSpan,
    warningRadius: creature.warningRadius,
    impactRadius: creature.impactRadius,
    attackDamage: creature.attackDamage
  };
}

export function serializeCreature(creature: any) {
  return {
    id: creature.id,
    kind: creature.kind,
    displayName: creature.displayName,
    position: cloneVector(creature.position),
    shadowPosition: cloneVector(creature.shadowPosition),
    rotationY: creature.rotationY,
    phase: creature.phase,
    targetSlot: creature.targetSlot,
    shadowRadius: creature.shadowRadius,
    shadowOpacity: creature.shadowOpacity,
    warningRadius: creature.warningRadius,
    impactRadius: creature.impactRadius,
    bodyLength: creature.bodyLength,
    wingSpan: creature.wingSpan
  };
}

export function getBirdCoverRadius(prop: any) {
  switch (prop.kind) {
    case 'giant_tree':
    case 'deciduous_tree':
    case 'conifer_tree':
      return prop.visual?.canopyRadius ?? Math.max(prop.bodyRadius * 5, 24);
    case 'shrub':
      return prop.visual?.radius ?? Math.max(prop.bodyRadius * 2, 5);
    case 'mushroom':
      return prop.visual?.capRadius ?? prop.visual?.radius ?? prop.bodyRadius;
    case 'rotting_log':
    case 'fallen_branch':
    case 'root_branch':
      return Math.max(prop.bodyRadius ?? 0, getCollisionShapeRadius(prop.collisionShape, 1));
    case 'rock':
    case 'forest_rock':
    case 'talus_rock':
    case 'rock_cluster':
      return Math.max(prop.bodyRadius ?? 0, getCollisionShapeRadius(prop.collisionShape, 1)) * 1.05;
    case 'sprout':
      return (prop.visual?.height ?? 0) >= 18
        ? Math.max(prop.visual?.leafLength ?? 0, (prop.visual?.radius ?? prop.bodyRadius ?? 0) * 8, 4)
        : 0;
    default:
      return 0;
  }
}

export function movePlanarToward(current: { x: number; z: number }, target: { x: number; z: number }, maximumDistance: number): void {
  const dx = target.x - current.x;
  const dz = target.z - current.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= PLANAR_EPSILON || distance <= maximumDistance) {
    current.x = target.x;
    current.z = target.z;
    return;
  }

  const scale = maximumDistance / distance;
  current.x += dx * scale;
  current.z += dz * scale;
}
