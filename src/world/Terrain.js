import * as THREE from 'three';

export const TERRAIN_VISUAL_SIZE = 60;
export const TERRAIN_VISUAL_SEGMENTS = 120;
export const EXPLORER_TERRAIN_PRESET = 'explorer_mossland';
export const EXPLORER_REFERENCE_WORLD_RADIUS = 100;

export const TERRAIN_PRESET_OPTIONS = Object.freeze([
  { value: 'plane', label: 'Plane' },
  { value: 'hyperboloid_bowl', label: 'Hyperboloid Bowl' },
  { value: 'sphere_dome', label: 'Sphere Dome' },
  { value: 'sphere_bowl', label: 'Sphere Bowl' },
  { value: 'cone', label: 'Cone' },
  { value: 'paraboloid_bowl', label: 'Paraboloid Bowl' },
  { value: 'saddle', label: 'Saddle' },
  { value: 'ripple_bowl', label: 'Ripple Bowl' }
]);

export const EXPLORER_TERRAIN_PRESET_OPTIONS = Object.freeze([
  { value: EXPLORER_TERRAIN_PRESET, label: 'Explorer Mossland' }
]);

export const ALL_TERRAIN_PRESET_OPTIONS = Object.freeze([
  ...TERRAIN_PRESET_OPTIONS,
  ...EXPLORER_TERRAIN_PRESET_OPTIONS
]);

const VALID_TERRAIN_PRESETS = new Set(ALL_TERRAIN_PRESET_OPTIONS.map((entry) => entry.value));

export const DEFAULT_TERRAIN_CONFIG = Object.freeze({
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeNumber(value, fallback, min, max) {
  const numericValue = Number.isFinite(value) ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return clamp(numericValue, min, max);
}

function getNormalizedRadius(x, z, scale) {
  return Math.hypot(x, z) / Math.max(0.0001, scale);
}

function getClampedSphereRadius(normalizedRadius) {
  return Math.min(1, Math.max(0, normalizedRadius));
}

function getHyperboloidHeight(normalizedRadius, centerHeight, verticalScale) {
  return centerHeight + (
    verticalScale * (Math.sqrt(1 + (normalizedRadius * normalizedRadius)) - 1)
  );
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }

  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - (2 * t));
}

function fract(value) {
  return value - Math.floor(value);
}

function hash2(ix, iz, seed) {
  return fract(Math.sin((ix * 127.1) + (iz * 311.7) + (seed * 74.7)) * 43758.5453123);
}

function valueNoise2(x, z, seed) {
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

function fbm2(x, z, seed, octaves = 4, roughness = 0.52) {
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

function getRegionWeight(x, z, centerX, centerZ, radius, falloff) {
  const distance = Math.hypot(x - centerX, z - centerZ);
  return 1 - smoothstep(radius, radius + falloff, distance);
}

function getExplorerScale(terrainConfig) {
  return Math.max(
    1,
    (terrainConfig.worldRadius ?? EXPLORER_REFERENCE_WORLD_RADIUS) / EXPLORER_REFERENCE_WORLD_RADIUS
  );
}

export function getExplorerTerrainRegionWeights(x, z, terrainConfig = DEFAULT_TERRAIN_CONFIG) {
  const scale = getExplorerScale(terrainConfig);
  const mountainWeight = getRegionWeight(x, z, 56 * scale, -58 * scale, 22 * scale, 30 * scale);
  const desertWeight = getRegionWeight(x, z, -58 * scale, -52 * scale, 34 * scale, 34 * scale);
  const gravelWeight = getRegionWeight(x, z, 34 * scale, -30 * scale, 38 * scale, 34 * scale) *
    (1 - mountainWeight * 0.35);

  return {
    scale,
    mountainWeight,
    desertWeight,
    gravelWeight
  };
}

function getExplorerMosslandHeight(x, z, terrainConfig) {
  const seed = terrainConfig.explorerSeed;
  const { scale, mountainWeight, desertWeight, gravelWeight } = getExplorerTerrainRegionWeights(x, z, terrainConfig);
  const safeScale = Math.max(1, terrainConfig.horizontalScale);
  const amplitude = terrainConfig.verticalScale;
  const mossNoise = fbm2(x / safeScale, z / safeScale, seed, 4, 0.52);
  const sandNoise = fbm2((x + (41 * scale)) / (34 * scale), (z - (13 * scale)) / (34 * scale), seed + 101, 3, 0.48);
  const gravelNoise = fbm2((x - (17 * scale)) / (11 * scale), (z + (23 * scale)) / (11 * scale), seed + 211, 3, 0.57);
  const mountainNoise = fbm2((x + (7 * scale)) / (9 * scale), (z - (5 * scale)) / (9 * scale), seed + 307, 4, 0.6);
  const mountainDistance = Math.hypot(x - (56 * scale), z + (58 * scale));
  const mountainCore = Math.max(0, 1 - (mountainDistance / (36 * scale)));
  const mountainHeight = (mountainCore ** 2.2) * amplitude * 2.4;
  const desertDunes = Math.sin((x * (0.085 / scale)) + (z * (0.035 / scale))) * amplitude * 0.09;
  const mossHeight = mossNoise * amplitude * 0.16;
  const sandHeight = (sandNoise * amplitude * 0.13) + desertDunes - (desertWeight * amplitude * 0.1);
  const gravelHeight = gravelNoise * amplitude * 0.22;
  const rockyHeight = mountainHeight + (mountainNoise * amplitude * 0.45 * mountainWeight);
  const blendedLowland = (
    mossHeight * (1 - desertWeight) +
    sandHeight * desertWeight
  );

  return terrainConfig.centerHeight +
    blendedLowland +
    (gravelHeight * gravelWeight) +
    (rockyHeight * mountainWeight);
}

export function getTerrainColor(x, z, terrainConfig = DEFAULT_TERRAIN_CONFIG) {
  if (terrainConfig.preset !== EXPLORER_TERRAIN_PRESET) {
    return new THREE.Color(0x6e9f55);
  }

  const seed = terrainConfig.explorerSeed;
  const { scale, mountainWeight, desertWeight, gravelWeight } = getExplorerTerrainRegionWeights(x, z, terrainConfig);
  const mossSpeckle = fbm2(x / (5.5 * scale), z / (5.5 * scale), seed + 509, 2, 0.5) * 0.08;
  const moss = new THREE.Color(0x4f7f4c).offsetHSL(0, 0, mossSpeckle);
  const sand = new THREE.Color(0xb9a66f);
  const gravel = new THREE.Color(0x7d7767);
  const rock = new THREE.Color(0x5f6260);
  const color = moss.clone().lerp(sand, desertWeight);
  color.lerp(gravel, gravelWeight * 0.7);
  color.lerp(rock, mountainWeight * 0.9);
  return color;
}

export function normalizeTerrainConfig(rawConfig = {}) {
  const preset = VALID_TERRAIN_PRESETS.has(rawConfig.preset)
    ? rawConfig.preset
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

export function getTerrainConfigKey(terrainConfig = DEFAULT_TERRAIN_CONFIG) {
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

export function getTerrainHeight(x, z, terrainConfig = DEFAULT_TERRAIN_CONFIG) {
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

export function createTerrainPosition(x, z, terrainConfig = DEFAULT_TERRAIN_CONFIG) {
  return new THREE.Vector3(x, getTerrainHeight(x, z, terrainConfig), z);
}

export function createTerrainGeometry(
  terrainConfig = DEFAULT_TERRAIN_CONFIG,
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
