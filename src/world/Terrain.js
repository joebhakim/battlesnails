import * as THREE from 'three';

export const TERRAIN_VISUAL_SIZE = 60;
export const TERRAIN_VISUAL_SEGMENTS = 120;

export const TERRAIN_PRESET_OPTIONS = Object.freeze([
  { value: 'hyperboloid_bowl', label: 'Hyperboloid Bowl' },
  { value: 'sphere_dome', label: 'Sphere Dome' },
  { value: 'sphere_bowl', label: 'Sphere Bowl' },
  { value: 'cone', label: 'Cone' },
  { value: 'paraboloid_bowl', label: 'Paraboloid Bowl' },
  { value: 'saddle', label: 'Saddle' },
  { value: 'ripple_bowl', label: 'Ripple Bowl' }
]);

const VALID_TERRAIN_PRESETS = new Set(TERRAIN_PRESET_OPTIONS.map((entry) => entry.value));

export const DEFAULT_TERRAIN_CONFIG = Object.freeze({
  preset: 'hyperboloid_bowl',
  centerHeight: 0.2,
  horizontalScale: 10,
  verticalScale: 12,
  rippleAmplitude: 2,
  rippleFrequency: 1.25
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

export function normalizeTerrainConfig(rawConfig = {}) {
  const preset = VALID_TERRAIN_PRESETS.has(rawConfig.preset)
    ? rawConfig.preset
    : DEFAULT_TERRAIN_CONFIG.preset;

  return {
    preset,
    centerHeight: normalizeNumber(rawConfig.centerHeight, DEFAULT_TERRAIN_CONFIG.centerHeight, -40, 40),
    horizontalScale: normalizeNumber(rawConfig.horizontalScale, DEFAULT_TERRAIN_CONFIG.horizontalScale, 1, 80),
    verticalScale: normalizeNumber(rawConfig.verticalScale, DEFAULT_TERRAIN_CONFIG.verticalScale, 0.1, 80),
    rippleAmplitude: normalizeNumber(rawConfig.rippleAmplitude, DEFAULT_TERRAIN_CONFIG.rippleAmplitude, 0, 40),
    rippleFrequency: normalizeNumber(rawConfig.rippleFrequency, DEFAULT_TERRAIN_CONFIG.rippleFrequency, 0.1, 20)
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
    normalized.rippleFrequency
  ].join('|');
}

export function getTerrainHeight(x, z, terrainConfig = DEFAULT_TERRAIN_CONFIG) {
  const centerHeight = terrainConfig.centerHeight;
  const horizontalScale = terrainConfig.horizontalScale;
  const verticalScale = terrainConfig.verticalScale;
  const normalizedRadius = getNormalizedRadius(x, z, horizontalScale);
  const clampedSphereRadius = getClampedSphereRadius(normalizedRadius);

  switch (terrainConfig.preset) {
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

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = -positions.getY(index);
    positions.setZ(index, getTerrainHeight(x, z, terrainConfig));
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
