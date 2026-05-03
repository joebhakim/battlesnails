import { DEFAULT_TERRAIN_CONFIG, getTerrainHeight, normalizeTerrainConfig, type TerrainConfig } from './Terrain.js';

export const BODY_CAPSULE_VISUAL_RADIUS = 1;
export const BODY_CAPSULE_HALF_LENGTH = 1;
export const DEFAULT_ABOVE_GROUND_HEIGHT = 0;
export const DEFAULT_SPAWN_DROP_HEIGHT = 8;

const CLEARANCE_DERIVATIVE_SCALE = 0.01;
const MIN_DERIVATIVE_STEP = 0.05;
const MAX_DERIVATIVE_STEP = 0.25;
const MAX_TERRAIN_BODY_CLEARANCE = 14;

interface TerrainClearanceOptions {
  x: number;
  z: number;
  rotationY?: number;
  terrainConfig?: Readonly<TerrainConfig>;
  aboveGroundHeight?: number;
  visualRadius?: number;
  halfLength?: number;
  maxClearance?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getDerivativeStep(terrainConfig: Readonly<TerrainConfig>): number {
  return clamp(
    terrainConfig.horizontalScale * CLEARANCE_DERIVATIVE_SCALE,
    MIN_DERIVATIVE_STEP,
    MAX_DERIVATIVE_STEP
  );
}

function getTerrainDerivatives(x: number, z: number, terrainConfig: Readonly<TerrainConfig>) {
  const step = getDerivativeStep(terrainConfig);
  const center = getTerrainHeight(x, z, terrainConfig);
  const left = getTerrainHeight(x - step, z, terrainConfig);
  const right = getTerrainHeight(x + step, z, terrainConfig);
  const back = getTerrainHeight(x, z - step, terrainConfig);
  const forward = getTerrainHeight(x, z + step, terrainConfig);
  const rightForward = getTerrainHeight(x + step, z + step, terrainConfig);
  const rightBack = getTerrainHeight(x + step, z - step, terrainConfig);
  const leftForward = getTerrainHeight(x - step, z + step, terrainConfig);
  const leftBack = getTerrainHeight(x - step, z - step, terrainConfig);
  const stepSquared = step * step;

  return {
    slopeX: (right - left) / (2 * step),
    slopeZ: (forward - back) / (2 * step),
    curvatureX: (right - (2 * center) + left) / stepSquared,
    curvatureZ: (forward - (2 * center) + back) / stepSquared,
    curvatureXZ: (rightForward - rightBack - leftForward + leftBack) / (4 * stepSquared)
  };
}

function getMaxCurvatureEigenvalue({ curvatureX, curvatureZ, curvatureXZ }: { curvatureX: number; curvatureZ: number; curvatureXZ: number }): number {
  const trace = (curvatureX + curvatureZ) / 2;
  const discriminant = Math.sqrt((((curvatureX - curvatureZ) / 2) ** 2) + (curvatureXZ * curvatureXZ));
  return trace + discriminant;
}

export function estimateTerrainBodyClearance({
  x,
  z,
  rotationY = 0,
  terrainConfig = DEFAULT_TERRAIN_CONFIG,
  aboveGroundHeight = DEFAULT_ABOVE_GROUND_HEIGHT,
  visualRadius = BODY_CAPSULE_VISUAL_RADIUS,
  halfLength = BODY_CAPSULE_HALF_LENGTH,
  maxClearance = MAX_TERRAIN_BODY_CLEARANCE
}: TerrainClearanceOptions) {
  const normalizedTerrain = normalizeTerrainConfig(terrainConfig);
  const safeAboveGroundHeight = Math.max(0, aboveGroundHeight);
  const derivatives = getTerrainDerivatives(x, z, normalizedTerrain);
  const slopeMagnitude = Math.hypot(derivatives.slopeX, derivatives.slopeZ);
  const forwardX = Math.sin(rotationY);
  const forwardZ = Math.cos(rotationY);
  const slopeAlongBody = Math.abs((derivatives.slopeX * forwardX) + (derivatives.slopeZ * forwardZ));
  const positiveCurvature = Math.max(0, getMaxCurvatureEigenvalue(derivatives));
  const footprintReach = visualRadius + halfLength;
  const tangentPlaneClearance = (
    (visualRadius * Math.sqrt(1 + (slopeMagnitude * slopeMagnitude))) +
    (halfLength * slopeAlongBody)
  );
  const curvatureClearance = 0.5 * positiveCurvature * footprintReach * footprintReach;
  const terrainSupportClearance = tangentPlaneClearance + curvatureClearance;

  return clamp(
    safeAboveGroundHeight + terrainSupportClearance,
    visualRadius + safeAboveGroundHeight,
    Math.max(visualRadius + safeAboveGroundHeight, maxClearance)
  );
}

export function getTerrainBodyGroundHeight({
  x,
  z,
  rotationY = 0,
  terrainConfig = DEFAULT_TERRAIN_CONFIG,
  aboveGroundHeight = DEFAULT_ABOVE_GROUND_HEIGHT
}: TerrainClearanceOptions) {
  const normalizedTerrain = normalizeTerrainConfig(terrainConfig);
  return getTerrainHeight(x, z, normalizedTerrain) + estimateTerrainBodyClearance({
    x,
    z,
    rotationY,
    terrainConfig: normalizedTerrain,
    aboveGroundHeight
  });
}
