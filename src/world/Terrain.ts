import * as THREE from 'three';

import {
  getDistanceToWorldBoundsBoundary,
  isPointInsideWorldBounds
} from './WorldBounds.js';

export const TERRAIN_VISUAL_SIZE = 60;
export const TERRAIN_VISUAL_SEGMENTS = 120;
export const EXPLORER_TERRAIN_PRESET = 'explorer_mossland';
export const EXPLORER_REFERENCE_WORLD_RADIUS = 100;
export const ARENA_DEW_RUSH_STAGE = 'arena_dew_rush';
export const ARENA_SALT_BOWL_STAGE = 'arena_salt_bowl';
export const ARENA_SHELL_DERBY_STAGE = 'arena_shell_derby';
export const ARENA_FEAST_FRENZY_STAGE = 'arena_feast_frenzy';
export const ARENA_HIGH_LEAF_STAGE = 'arena_high_leaf';
export const ARENA_BIRD_PANIC_STAGE = 'arena_bird_panic';
export const ARENA_CALCIUM_CROWN_STAGE = 'arena_calcium_crown';

export const ARENA_EVENT_STAGE_PRESETS = Object.freeze([
  ARENA_DEW_RUSH_STAGE,
  ARENA_SALT_BOWL_STAGE,
  ARENA_SHELL_DERBY_STAGE,
  ARENA_FEAST_FRENZY_STAGE,
  ARENA_HIGH_LEAF_STAGE,
  ARENA_BIRD_PANIC_STAGE,
  ARENA_CALCIUM_CROWN_STAGE
]);

export type TerrainPreset =
  | 'plane'
  | 'hyperboloid_bowl'
  | 'sphere_dome'
  | 'sphere_bowl'
  | 'cone'
  | 'paraboloid_bowl'
  | 'saddle'
  | 'ripple_bowl'
  | typeof ARENA_DEW_RUSH_STAGE
  | typeof ARENA_SALT_BOWL_STAGE
  | typeof ARENA_SHELL_DERBY_STAGE
  | typeof ARENA_FEAST_FRENZY_STAGE
  | typeof ARENA_HIGH_LEAF_STAGE
  | typeof ARENA_BIRD_PANIC_STAGE
  | typeof ARENA_CALCIUM_CROWN_STAGE
  | typeof EXPLORER_TERRAIN_PRESET;

export interface TerrainConfig {
  preset: TerrainPreset;
  centerHeight: number;
  horizontalScale: number;
  verticalScale: number;
  rippleAmplitude: number;
  rippleFrequency: number;
  explorerSeed: number;
  visualSize: number;
  visualSegments: number;
  worldRadius: number;
  shoreline?: any;
}

export interface TerrainPresetOption {
  value: TerrainPreset;
  label: string;
}

export const TERRAIN_PRESET_OPTIONS: readonly TerrainPresetOption[] = Object.freeze([
  { value: 'plane', label: 'Plane' },
  { value: 'hyperboloid_bowl', label: 'Hyperboloid Bowl' },
  { value: 'sphere_dome', label: 'Sphere Dome' },
  { value: 'sphere_bowl', label: 'Sphere Bowl' },
  { value: 'cone', label: 'Cone' },
  { value: 'paraboloid_bowl', label: 'Paraboloid Bowl' },
  { value: 'saddle', label: 'Saddle' },
  { value: 'ripple_bowl', label: 'Ripple Bowl' }
]);

export const EXPLORER_TERRAIN_PRESET_OPTIONS: readonly TerrainPresetOption[] = Object.freeze([
  { value: EXPLORER_TERRAIN_PRESET, label: 'Generated Forest Floor' }
]);

export const ARENA_EVENT_TERRAIN_PRESET_OPTIONS: readonly TerrainPresetOption[] = Object.freeze([
  { value: ARENA_DEW_RUSH_STAGE, label: 'Dew Rush' },
  { value: ARENA_SALT_BOWL_STAGE, label: 'Salt Bowl' },
  { value: ARENA_SHELL_DERBY_STAGE, label: 'Shell Derby' },
  { value: ARENA_FEAST_FRENZY_STAGE, label: 'Feast Frenzy' },
  { value: ARENA_HIGH_LEAF_STAGE, label: 'High Leaf' },
  { value: ARENA_BIRD_PANIC_STAGE, label: 'Bird Panic' },
  { value: ARENA_CALCIUM_CROWN_STAGE, label: 'Calcium Crown' }
]);

export const ALL_TERRAIN_PRESET_OPTIONS: readonly TerrainPresetOption[] = Object.freeze([
  ...TERRAIN_PRESET_OPTIONS,
  ...EXPLORER_TERRAIN_PRESET_OPTIONS,
  ...ARENA_EVENT_TERRAIN_PRESET_OPTIONS
]);

export const ARENA_TERRAIN_PRESET_OPTIONS: readonly TerrainPresetOption[] = Object.freeze([
  ...TERRAIN_PRESET_OPTIONS,
  ...ARENA_EVENT_TERRAIN_PRESET_OPTIONS
]);

const VALID_TERRAIN_PRESETS = new Set(ALL_TERRAIN_PRESET_OPTIONS.map((entry) => entry.value));

export const DEFAULT_TERRAIN_CONFIG: Readonly<TerrainConfig> = Object.freeze({
  preset: 'plane',
  centerHeight: 0,
  horizontalScale: 10,
  verticalScale: 12,
  rippleAmplitude: 2,
  rippleFrequency: 1.25,
  explorerSeed: 1,
  visualSize: TERRAIN_VISUAL_SIZE,
  visualSegments: TERRAIN_VISUAL_SEGMENTS,
  worldRadius: 22,
  shoreline: null
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return clamp(numericValue, min, max);
}

function getNormalizedRadius(x: number, z: number, scale: number): number {
  return Math.hypot(x, z) / Math.max(0.0001, scale);
}

export function isArenaEventTerrainPreset(preset: unknown): preset is TerrainPreset {
  return ARENA_EVENT_STAGE_PRESETS.includes(preset as any);
}

function getClampedSphereRadius(normalizedRadius: number): number {
  return Math.min(1, Math.max(0, normalizedRadius));
}

function getHyperboloidHeight(normalizedRadius: number, centerHeight: number, verticalScale: number): number {
  return centerHeight + (
    verticalScale * (Math.sqrt(1 + (normalizedRadius * normalizedRadius)) - 1)
  );
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }

  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - (2 * t));
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function hash2(ix: number, iz: number, seed: number): number {
  return fract(Math.sin((ix * 127.1) + (iz * 311.7) + (seed * 74.7)) * 43758.5453123);
}

function valueNoise2(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - (2 * fx));
  const uz = fz * fz * (3 - (2 * fz));
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  const ab = a + ((b - a) * ux);
  const cd = c + ((d - c) * ux);
  return (ab + ((cd - ab) * uz)) * 2 - 1;
}

function fbm2(x: number, z: number, seed: number, octaves = 4, roughness = 0.52): number {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let amplitudeTotal = 0;

  for (let index = 0; index < octaves; index += 1) {
    total += valueNoise2(x * frequency, z * frequency, seed + (index * 19.37)) * amplitude;
    amplitudeTotal += amplitude;
    amplitude *= roughness;
    frequency *= 2;
  }

  return amplitudeTotal > 0 ? total / amplitudeTotal : 0;
}

function getRegionWeight(x: number, z: number, centerX: number, centerZ: number, radius: number, falloff: number): number {
  const distance = Math.hypot(x - centerX, z - centerZ);
  return 1 - smoothstep(radius, radius + falloff, distance);
}

function getExplorerScale(terrainConfig: Readonly<TerrainConfig>): number {
  return Math.max(
    1,
    (terrainConfig.worldRadius ?? EXPLORER_REFERENCE_WORLD_RADIUS) / EXPLORER_REFERENCE_WORLD_RADIUS
  );
}

function normalizeShorelineConfig(rawShoreline: any) {
  if (!rawShoreline || typeof rawShoreline !== 'object') {
    return null;
  }

  return {
    ...rawShoreline,
    beachWidth: normalizeNumber(rawShoreline.beachWidth, 0, 0, 4000),
    waterLevel: normalizeNumber(rawShoreline.waterLevel, -0.55, -40, 40),
    waterDepth: normalizeNumber(rawShoreline.waterDepth, 1.2, 0.05, 80),
    waterBlend: normalizeNumber(rawShoreline.waterBlend, 70, 1, 800)
  };
}

function getShorelineKey(shoreline: any) {
  if (!shoreline) {
    return 'none';
  }

  const landBounds = shoreline.landBounds ?? {};
  const playBounds = shoreline.playBounds ?? {};
  return [
    shoreline.beachWidth,
    shoreline.waterLevel,
    shoreline.waterDepth,
    shoreline.waterBlend,
    landBounds.shape,
    landBounds.radius,
    landBounds.hexRadius,
    landBounds.tiles?.length ?? 0,
    playBounds.shape,
    playBounds.radius
  ].join(':');
}

export function getExplorerCoastWeights(x: number, z: number, terrainConfig: Readonly<TerrainConfig> = DEFAULT_TERRAIN_CONFIG) {
  const shoreline = terrainConfig.shoreline;
  if (!shoreline?.landBounds) {
    return {
      beachWeight: 0,
      waterWeight: 0,
      signedDistanceToLandEdge: Infinity,
      waterLevel: terrainConfig.centerHeight - 0.55,
      waterDepth: 1.2
    };
  }

  const insideLand = isPointInsideWorldBounds(x, z, shoreline.landBounds);
  const edgeDistance = getDistanceToWorldBoundsBoundary(x, z, shoreline.landBounds);
  const signedDistanceToLandEdge = insideLand ? edgeDistance : -edgeDistance;
  const beachWidth = Math.max(0.0001, shoreline.beachWidth ?? 1);
  const waterBlend = Math.max(0.0001, shoreline.waterBlend ?? 70);
  const insideBeach = insideLand
    ? 1 - smoothstep(0, beachWidth, edgeDistance)
    : 0;
  const surfSand = insideLand
    ? 0
    : 1 - smoothstep(0, waterBlend, edgeDistance);
  const waterWeight = insideLand
    ? 0
    : smoothstep(0, waterBlend, edgeDistance);

  return {
    beachWeight: clamp(Math.max(insideBeach, surfSand * 0.45), 0, 1),
    waterWeight: clamp(waterWeight, 0, 1),
    signedDistanceToLandEdge,
    waterLevel: shoreline.waterLevel ?? terrainConfig.centerHeight - 0.55,
    waterDepth: shoreline.waterDepth ?? 1.2
  };
}

export function getExplorerTerrainRegionWeights(x: number, z: number, terrainConfig: Readonly<TerrainConfig> = DEFAULT_TERRAIN_CONFIG) {
  const scale = getExplorerScale(terrainConfig);
  const coast = getExplorerCoastWeights(x, z, terrainConfig);
  const mountainWeight = getRegionWeight(x, z, 56 * scale, -58 * scale, 22 * scale, 30 * scale);
  const leafLitterWeight = Math.max(
    getRegionWeight(x, z, -58 * scale, -52 * scale, 38 * scale, 36 * scale),
    getRegionWeight(x, z, -38 * scale, -18 * scale, 24 * scale, 26 * scale) * 0.72
  );
  const rootDirtWeight = Math.max(
    getRegionWeight(x, z, -26 * scale, 38 * scale, 24 * scale, 28 * scale),
    getRegionWeight(x, z, 6 * scale, 18 * scale, 22 * scale, 24 * scale),
    getRegionWeight(x, z, 42 * scale, -10 * scale, 26 * scale, 24 * scale) * (1 - mountainWeight * 0.25)
  );
  const gravelWeight = Math.max(
    getRegionWeight(x, z, 34 * scale, -30 * scale, 38 * scale, 34 * scale) * (1 - mountainWeight * 0.18),
    getRegionWeight(x, z, 58 * scale, -48 * scale, 30 * scale, 28 * scale) * 0.85
  );
  const mossWeight = clamp(
    1 - Math.max(
      mountainWeight * 0.95,
      leafLitterWeight * 0.72,
      rootDirtWeight * 0.68,
      gravelWeight * 0.48
    ),
    0,
    1
  );

  return {
    scale,
    mountainWeight,
    leafLitterWeight,
    rootDirtWeight,
    gravelWeight,
    mossWeight,
    beachWeight: coast.beachWeight,
    waterWeight: coast.waterWeight,
    // Kept as a compatibility alias for older callers; explorer v3 treats this as leaf litter, not sand.
    desertWeight: leafLitterWeight
  };
}

function getExplorerMosslandHeight(x: number, z: number, terrainConfig: Readonly<TerrainConfig>): number {
  const seed = terrainConfig.explorerSeed;
  const { scale, mountainWeight, leafLitterWeight, rootDirtWeight, gravelWeight } = getExplorerTerrainRegionWeights(x, z, terrainConfig);
  const safeScale = Math.max(1, terrainConfig.horizontalScale);
  const amplitude = terrainConfig.verticalScale;
  const mossNoise = fbm2(x / safeScale, z / safeScale, seed, 4, 0.52);
  const leafNoise = fbm2((x + (41 * scale)) / (22 * scale), (z - (13 * scale)) / (22 * scale), seed + 101, 3, 0.56);
  const rootNoise = fbm2((x - (9 * scale)) / (16 * scale), (z + (4 * scale)) / (16 * scale), seed + 149, 4, 0.58);
  const gravelNoise = fbm2((x - (17 * scale)) / (11 * scale), (z + (23 * scale)) / (11 * scale), seed + 211, 3, 0.57);
  const mountainNoise = fbm2((x + (7 * scale)) / (9 * scale), (z - (5 * scale)) / (9 * scale), seed + 307, 4, 0.6);
  const mountainDistance = Math.hypot(x - (56 * scale), z + (58 * scale));
  const mountainCore = Math.max(0, 1 - (mountainDistance / (36 * scale)));
  const mountainHeight = (mountainCore ** 2.2) * amplitude * 2.4;
  const leafCrinkle = (
    Math.sin((x * (0.18 / scale)) + (z * (0.07 / scale))) *
    Math.sin((x * (0.05 / scale)) - (z * (0.16 / scale)))
  ) * amplitude * 0.035;
  const rootRidge = (
    Math.sin((x * (0.045 / scale)) + (z * (0.02 / scale))) *
    Math.sin((x * (0.015 / scale)) - (z * (0.055 / scale)))
  ) * amplitude * 0.12;
  const mossHeight = mossNoise * amplitude * 0.16;
  const leafHeight = (leafNoise * amplitude * 0.08) + leafCrinkle - (leafLitterWeight * amplitude * 0.03);
  const rootHeight = (rootNoise * amplitude * 0.18) + rootRidge;
  const gravelHeight = (gravelNoise * amplitude * 0.28) + (gravelWeight * amplitude * 0.05);
  const rockyHeight = mountainHeight + (mountainNoise * amplitude * 0.45 * mountainWeight);
  const rootBlend = rootDirtWeight * (1 - mountainWeight * 0.3);
  const leafBlend = leafLitterWeight * (1 - rootBlend * 0.35);
  const blendedLowland = (
    mossHeight * Math.max(0, 1 - Math.max(leafBlend * 0.75, rootBlend * 0.7)) +
    leafHeight * leafBlend +
    rootHeight * rootBlend
  );

  const landHeight = terrainConfig.centerHeight +
    blendedLowland +
    (gravelHeight * gravelWeight) +
    (rockyHeight * mountainWeight);
  const coast = getExplorerCoastWeights(x, z, terrainConfig);
  const sandNoise = fbm2((x + (23 * scale)) / (3.2 * scale), (z - (17 * scale)) / (3.2 * scale), seed + 733, 2, 0.58);
  const sandHeight = terrainConfig.centerHeight - (amplitude * 0.04) + (sandNoise * amplitude * 0.025);
  const beachHeight = THREE.MathUtils.lerp(landHeight, sandHeight, coast.beachWeight);
  const waterFloorHeight = coast.waterLevel - coast.waterDepth;

  return THREE.MathUtils.lerp(beachHeight, waterFloorHeight, coast.waterWeight);
}

export function getTerrainColor(x: number, z: number, terrainConfig: Readonly<TerrainConfig> = DEFAULT_TERRAIN_CONFIG): THREE.Color {
  if (isArenaEventTerrainPreset(terrainConfig.preset)) {
    switch (terrainConfig.preset) {
      case ARENA_DEW_RUSH_STAGE:
        return new THREE.Color(0x315f4c);
      case ARENA_SALT_BOWL_STAGE:
        return new THREE.Color(0x8f8a74);
      case ARENA_SHELL_DERBY_STAGE:
        return new THREE.Color(0x5e7047);
      case ARENA_FEAST_FRENZY_STAGE:
        return new THREE.Color(0x6a4a2d);
      case ARENA_HIGH_LEAF_STAGE:
        return new THREE.Color(0x4f7b3c);
      case ARENA_BIRD_PANIC_STAGE:
        return new THREE.Color(0x344c31);
      case ARENA_CALCIUM_CROWN_STAGE:
        return new THREE.Color(0x686c58);
      default:
        break;
    }
  }

  if (terrainConfig.preset !== EXPLORER_TERRAIN_PRESET) {
    return new THREE.Color(0x6e9f55);
  }

  const seed = terrainConfig.explorerSeed;
  const { scale, mountainWeight, leafLitterWeight, rootDirtWeight, gravelWeight, beachWeight, waterWeight } = getExplorerTerrainRegionWeights(x, z, terrainConfig);
  const mossSpeckle = fbm2(x / (5.5 * scale), z / (5.5 * scale), seed + 509, 2, 0.5) * 0.08;
  const leafSpeckle = fbm2(x / (3.8 * scale), z / (3.8 * scale), seed + 619, 2, 0.55) * 0.06;
  const sandSpeckle = fbm2(x / (1.9 * scale), z / (1.9 * scale), seed + 823, 2, 0.62) * 0.12;
  const moss = new THREE.Color(0x4f7f4c).offsetHSL(0, 0, mossSpeckle);
  const leafLitter = new THREE.Color(0x755733).offsetHSL(0, 0, leafSpeckle);
  const rootDirt = new THREE.Color(0x6a3f25);
  const gravel = new THREE.Color(0x7d7767);
  const rock = new THREE.Color(0x5f6260);
  const sand = new THREE.Color(0xc8b574).offsetHSL(0.015, 0.04, sandSpeckle);
  const waterFloor = new THREE.Color(0x357f92);
  const color = moss.clone().lerp(leafLitter, leafLitterWeight * 0.92);
  color.lerp(rootDirt, rootDirtWeight * 0.86);
  color.lerp(gravel, gravelWeight * 0.7);
  color.lerp(rock, mountainWeight * 0.9);
  color.lerp(sand, beachWeight);
  color.lerp(waterFloor, waterWeight * 0.88);
  return color;
}

export function normalizeTerrainConfig(rawConfig: Partial<TerrainConfig> = {}): TerrainConfig {
  const preset = VALID_TERRAIN_PRESETS.has(rawConfig.preset as TerrainPreset)
    ? rawConfig.preset as TerrainPreset
    : DEFAULT_TERRAIN_CONFIG.preset;

  return {
    preset,
    centerHeight: normalizeNumber(rawConfig.centerHeight, DEFAULT_TERRAIN_CONFIG.centerHeight, -40, 40),
    horizontalScale: normalizeNumber(rawConfig.horizontalScale, DEFAULT_TERRAIN_CONFIG.horizontalScale, 1, 1000),
    verticalScale: normalizeNumber(rawConfig.verticalScale, DEFAULT_TERRAIN_CONFIG.verticalScale, 0.1, 800),
    rippleAmplitude: normalizeNumber(rawConfig.rippleAmplitude, DEFAULT_TERRAIN_CONFIG.rippleAmplitude, 0, 40),
    rippleFrequency: normalizeNumber(rawConfig.rippleFrequency, DEFAULT_TERRAIN_CONFIG.rippleFrequency, 0.1, 20),
    explorerSeed: Math.floor(normalizeNumber(rawConfig.explorerSeed, DEFAULT_TERRAIN_CONFIG.explorerSeed, 1, 999999)),
    visualSize: normalizeNumber(rawConfig.visualSize, DEFAULT_TERRAIN_CONFIG.visualSize, TERRAIN_VISUAL_SIZE, 8000),
    visualSegments: Math.floor(normalizeNumber(rawConfig.visualSegments, DEFAULT_TERRAIN_CONFIG.visualSegments, 20, 360)),
    worldRadius: normalizeNumber(rawConfig.worldRadius, DEFAULT_TERRAIN_CONFIG.worldRadius, 10, 2000),
    shoreline: normalizeShorelineConfig(rawConfig.shoreline)
  };
}

export function getTerrainConfigKey(terrainConfig: Readonly<TerrainConfig> = DEFAULT_TERRAIN_CONFIG): string {
  const normalized = normalizeTerrainConfig(terrainConfig);
  return [
    normalized.preset,
    normalized.centerHeight,
    normalized.horizontalScale,
    normalized.verticalScale,
    normalized.rippleAmplitude,
    normalized.rippleFrequency,
    normalized.explorerSeed,
    normalized.visualSize,
    normalized.visualSegments,
    normalized.worldRadius,
    getShorelineKey(normalized.shoreline)
  ].join('|');
}

export function getTerrainWaterInfo(x: number, z: number, terrainConfig: Readonly<TerrainConfig> = DEFAULT_TERRAIN_CONFIG) {
  if (terrainConfig.preset !== EXPLORER_TERRAIN_PRESET) {
    return {
      waterWeight: 0,
      surfaceHeight: null
    };
  }

  const coast = getExplorerCoastWeights(x, z, terrainConfig);
  return {
    waterWeight: coast.waterWeight,
    surfaceHeight: coast.waterWeight > 0.05 ? coast.waterLevel : null
  };
}

export function getTerrainHeight(x: number, z: number, terrainConfig: Readonly<TerrainConfig> = DEFAULT_TERRAIN_CONFIG): number {
  const centerHeight = terrainConfig.centerHeight;
  const horizontalScale = terrainConfig.horizontalScale;
  const verticalScale = terrainConfig.verticalScale;
  const normalizedRadius = getNormalizedRadius(x, z, horizontalScale);
  const clampedSphereRadius = getClampedSphereRadius(normalizedRadius);

  switch (terrainConfig.preset) {
    case 'plane':
    case ARENA_DEW_RUSH_STAGE:
    case ARENA_SALT_BOWL_STAGE:
    case ARENA_SHELL_DERBY_STAGE:
    case ARENA_FEAST_FRENZY_STAGE:
    case ARENA_HIGH_LEAF_STAGE:
    case ARENA_BIRD_PANIC_STAGE:
    case ARENA_CALCIUM_CROWN_STAGE:
      return centerHeight;
    case 'sphere_dome':
      return centerHeight + (
        verticalScale * Math.sqrt(Math.max(0, 1 - (clampedSphereRadius * clampedSphereRadius)))
      );
    case 'sphere_bowl':
      return centerHeight + (
        verticalScale * (1 - Math.sqrt(Math.max(0, 1 - (clampedSphereRadius * clampedSphereRadius))))
      );
    case 'cone':
      return centerHeight + (verticalScale * Math.min(1, normalizedRadius));
    case 'paraboloid_bowl':
      return centerHeight + (verticalScale * normalizedRadius * normalizedRadius);
    case 'saddle': {
      const safeScale = Math.max(0.0001, horizontalScale);
      return centerHeight + (
        verticalScale * (((x * x) - (z * z)) / (safeScale * safeScale))
      );
    }
    case 'ripple_bowl': {
      const bowlHeight = getHyperboloidHeight(normalizedRadius, centerHeight, verticalScale);
      return bowlHeight + (
        terrainConfig.rippleAmplitude * Math.sin(normalizedRadius * terrainConfig.rippleFrequency * Math.PI * 2)
      );
    }
    case EXPLORER_TERRAIN_PRESET:
      return getExplorerMosslandHeight(x, z, terrainConfig);
    case 'hyperboloid_bowl':
    default:
      return getHyperboloidHeight(normalizedRadius, centerHeight, verticalScale);
  }
}

export function createTerrainPosition(x: number, z: number, terrainConfig: Readonly<TerrainConfig> = DEFAULT_TERRAIN_CONFIG): THREE.Vector3 {
  return new THREE.Vector3(x, getTerrainHeight(x, z, terrainConfig), z);
}

export function createTerrainGeometry(
  terrainConfig: Readonly<TerrainConfig> = DEFAULT_TERRAIN_CONFIG,
  size = TERRAIN_VISUAL_SIZE,
  segments = TERRAIN_VISUAL_SEGMENTS
) {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  const positions = geometry.attributes.position;
  const colors = [];

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = -positions.getY(index);
    positions.setZ(index, getTerrainHeight(x, z, terrainConfig));
    const color = getTerrainColor(x, z, terrainConfig);
    colors.push(color.r, color.g, color.b);
  }

  positions.needsUpdate = true;
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createWaterGeometry(
  terrainConfig: Readonly<TerrainConfig> = DEFAULT_TERRAIN_CONFIG,
  size = TERRAIN_VISUAL_SIZE,
  segments = 72
) {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const halfSize = size / 2;
  const safeSegments = Math.max(4, Math.floor(segments));
  const step = size / safeSegments;

  for (let row = 0; row < safeSegments; row += 1) {
    const z0 = -halfSize + row * step;
    const z1 = z0 + step;
    const centerZ = (z0 + z1) / 2;

    for (let col = 0; col < safeSegments; col += 1) {
      const x0 = -halfSize + col * step;
      const x1 = x0 + step;
      const centerX = (x0 + x1) / 2;
      const water = getTerrainWaterInfo(centerX, centerZ, terrainConfig);
      if (water.waterWeight <= 0.08 || water.surfaceHeight === null) {
        continue;
      }

      const y = water.surfaceHeight + 0.035;
      positions.push(
        x0, -z0, y,
        x1, -z0, y,
        x1, -z1, y,
        x0, -z0, y,
        x1, -z1, y,
        x0, -z1, y
      );
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
