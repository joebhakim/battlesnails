import { SeededRandom } from './SeededRandom.js';

export const DEFAULT_VISION_CONFIG = Object.freeze({
  fovRadians: Math.PI * 0.72,
  range: 24,
  positionNoise: 0.35,
  memoryDuration: 1.25,
  memoryDriftPerSecond: 0.45
});

function mergeConfig(config: any = {}) {
  return {
    ...DEFAULT_VISION_CONFIG,
    ...config
  };
}

function clonePosition(position) {
  return {
    x: position.x,
    y: position.y,
    z: position.z
  };
}

function planarDistanceSquared(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return (dx * dx) + (dz * dz);
}

function normalizePlanar(dx, dz) {
  const length = Math.hypot(dx, dz);
  if (length === 0) {
    return { x: 0, z: 1, length: 0 };
  }

  return {
    x: dx / length,
    z: dz / length,
    length
  };
}

function addNoisyPosition(position, config, rng) {
  return {
    x: position.x + rng.signed(config.positionNoise),
    y: position.y,
    z: position.z + rng.signed(config.positionNoise)
  };
}

function getFacingVector(rotationY) {
  return {
    x: Math.sin(rotationY),
    z: Math.cos(rotationY)
  };
}

function isTargetVisible(self, target, config) {
  if (!target.connected || target.health <= 0) {
    return false;
  }

  const dx = target.position.x - self.position.x;
  const dz = target.position.z - self.position.z;
  const direction = normalizePlanar(dx, dz);
  if (direction.length > config.range) {
    return false;
  }

  if (direction.length === 0) {
    return true;
  }

  const facing = getFacingVector(self.rotationY);
  const dot = Math.min(1, Math.max(-1, facing.x * direction.x + facing.z * direction.z));
  return Math.acos(dot) <= config.fovRadians / 2;
}

function updateMemoryDrift(memory, config, rng, delta) {
  if (!memory.target) {
    return;
  }

  memory.target.age += delta;
  if (memory.target.age > config.memoryDuration) {
    memory.target = null;
    return;
  }

  const drift = config.memoryDriftPerSecond * delta;
  memory.target.position.x += rng.signed(drift);
  memory.target.position.z += rng.signed(drift);
}

export function createVisionMemory() {
  return {
    target: null
  } as { target: any | null };
}

export function createVisionObservation(
  snapshot,
  viewerSlot,
  config: any = {},
  memory = createVisionMemory(),
  rng = new SeededRandom(1),
  delta = 1 / 60
) {
  const visionConfig = mergeConfig(config);
  const self = snapshot?.players?.find((player) => player.slot === viewerSlot) ?? null;
  if (!self) {
    return {
      self: null,
      visibleTargets: [],
      visibleTarget: null,
      rememberedTarget: null,
      target: null,
      canSeeTarget: false,
      tick: snapshot?.tick ?? 0
    };
  }

  updateMemoryDrift(memory, visionConfig, rng, delta);

  const visibleTargets = (snapshot.players ?? [])
    .filter((target) => target.slot !== viewerSlot && isTargetVisible(self, target, visionConfig))
    .map((target) => ({
      slot: target.slot,
      profileName: target.profileName,
      health: target.health,
      maxHealth: target.maxHealth,
      position: clonePosition(target.position),
      distanceSquared: planarDistanceSquared(self.position, target.position)
    }))
    .sort((left, right) => left.distanceSquared - right.distanceSquared);

  const visibleTarget = visibleTargets[0] ?? null;
  if (visibleTarget) {
    memory.target = {
      slot: visibleTarget.slot,
      profileName: visibleTarget.profileName,
      health: visibleTarget.health,
      maxHealth: visibleTarget.maxHealth,
      position: addNoisyPosition(visibleTarget.position, visionConfig, rng),
      age: 0
    };
  }

  const rememberedTarget = memory.target
    ? {
      slot: memory.target.slot,
      profileName: memory.target.profileName,
      health: memory.target.health,
      maxHealth: memory.target.maxHealth,
      position: clonePosition(memory.target.position),
      age: memory.target.age
    }
    : null;

  return {
    self,
    visibleTargets,
    visibleTarget,
    rememberedTarget,
    target: visibleTarget ?? rememberedTarget,
    canSeeTarget: Boolean(visibleTarget),
    tick: snapshot.tick,
    terrain: snapshot.terrain
  };
}
