import * as THREE from 'three';

export const TERRAIN_VISUAL_SIZE = 60;
export const TERRAIN_VISUAL_SEGMENTS = 120;
export const EXPLORER_TERRAIN_PRESET = 'explorer_mossland';
export const EXPLORER_REFERENCE_WORLD_RADIUS = 100;

export type TerrainPreset =
  | 'plane'
  | 'hyperboloid_bowl'
  | 'sphere_dome'
  | 'sphere_bowl'
  | 'cone'
  | 'paraboloid_bowl'
  | 'saddle'
  | 'ripple_bowl'
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
  { value: EXPLORER_TERRAIN_PRESET, label: 'Explorer Mossland' }
]);

export const ALL_TERRAIN_PRESET_OPTIONS: readonly TerrainPresetOption[] = Object.freeze([
  ...TERRAIN_PRESET_OPTIONS,
  ...EXPLORER_TERRAIN_PRESET_OPTIONS
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
  worldRadius: 22
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

export function getExplorerTerrainRegionWeights(x: number, z: number, terrainConfig: Readonly<TerrainConfig> = DEFAULT_TERRAIN_CONFIG) {
  const scale = getExplorerScale(terrainConfig);
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

  return terrainConfig.centerHeight +
    blendedLowland +
    (gravelHeight * gravelWeight) +
    (rockyHeight * mountainWeight);
}

export function getTerrainColor(x: number, z: number, terrainConfig: Readonly<TerrainConfig> = DEFAULT_TERRAIN_CONFIG): THREE.Color {
  if (terrainConfig.preset !== EXPLORER_TERRAIN_PRESET) {
    return new THREE.Color(0x6e9f55);
  }

  const seed = terrainConfig.explorerSeed;
  const { scale, mountainWeight, leafLitterWeight, rootDirtWeight, gravelWeight } = getExplorerTerrainRegionWeights(x, z, terrainConfig);
  const mossSpeckle = fbm2(x / (5.5 * scale), z / (5.5 * scale), seed + 509, 2, 0.5) * 0.08;
  const leafSpeckle = fbm2(x / (3.8 * scale), z / (3.8 * scale), seed + 619, 2, 0.55) * 0.06;
  const moss = new THREE.Color(0x4f7f4c).offsetHSL(0, 0, mossSpeckle);
  const leafLitter = new THREE.Color(0x755733).offsetHSL(0, 0, leafSpeckle);
  const rootDirt = new THREE.Color(0x6a3f25);
  const gravel = new THREE.Color(0x7d7767);
  const rock = new THREE.Color(0x5f6260);
  const color = moss.clone().lerp(leafLitter, leafLitterWeight * 0.92);
  color.lerp(rootDirt, rootDirtWeight * 0.86);
  color.lerp(gravel, gravelWeight * 0.7);
  color.lerp(rock, mountainWeight * 0.9);
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
    visualSize: normalizeNumber(rawConfig.visualSize, DEFAULT_TERRAIN_CONFIG.visualSize, TERRAIN_VISUAL_SIZE, 4000),
    visualSegments: Math.floor(normalizeNumber(rawConfig.visualSegments, DEFAULT_TERRAIN_CONFIG.visualSegments, 20, 360)),
    worldRadius: normalizeNumber(rawConfig.worldRadius, DEFAULT_TERRAIN_CONFIG.worldRadius, 10, 2000)
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
    normalized.worldRadius
  ].join('|');
}

export function getTerrainHeight(x: number, z: number, terrainConfig: Readonly<TerrainConfig> = DEFAULT_TERRAIN_CONFIG): number {
  const centerHeight = terrainConfig.centerHeight;
  const horizontalScale = terrainConfig.horizontalScale;
  const verticalScale = terrainConfig.verticalScale;
  const normalizedRadius = getNormalizedRadius(x, z, horizontalScale);
  const clampedSphereRadius = getClampedSphereRadius(normalizedRadius);

  switch (terrainConfig.preset) {
    case 'plane':
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
