import {
  DEFAULT_TERRAIN_CONFIG,
  TERRAIN_PRESET_OPTIONS,
  normalizeTerrainConfig
} from '../world/Terrain.js';

const TERRAIN_SECTION = 'Terrain';
const STALK_CONTROL_OPTIONS = Object.freeze([
  { value: 'top_down_plane', label: 'Top-Down Plane' },
  { value: 'yaw_pitch', label: 'Yaw/Pitch Chart' },
  { value: 'absolute_dome', label: 'Absolute Dome Reticle' },
  { value: 'trackball', label: 'Virtual Trackball' },
  { value: 'tangent_velocity', label: 'Tangent Velocity' },
  { value: 'spring_dome', label: 'Spring Dome Reticle' }
]);

const RAW_TUNING_SCHEMA = Object.freeze([
  {
    id: 'terrainPreset',
    label: 'Preset',
    section: TERRAIN_SECTION,
    defaultValue: DEFAULT_TERRAIN_CONFIG.preset,
    structural: true,
    kind: 'choice',
    options: TERRAIN_PRESET_OPTIONS
  },
  {
    id: 'terrainCenterHeight',
    label: 'Center Height',
    section: TERRAIN_SECTION,
    min: -40,
    max: 40,
    step: 0.1,
    defaultValue: DEFAULT_TERRAIN_CONFIG.centerHeight,
    structural: true
  },
  {
    id: 'terrainHorizontalScale',
    label: 'Horizontal Scale',
    section: TERRAIN_SECTION,
    min: 1,
    max: 80,
    step: 0.1,
    defaultValue: DEFAULT_TERRAIN_CONFIG.horizontalScale,
    structural: true
  },
  {
    id: 'terrainVerticalScale',
    label: 'Vertical Scale',
    section: TERRAIN_SECTION,
    min: 0.1,
    max: 80,
    step: 0.1,
    defaultValue: DEFAULT_TERRAIN_CONFIG.verticalScale,
    structural: true
  },
  {
    id: 'terrainRippleAmplitude',
    label: 'Ripple Amp',
    section: TERRAIN_SECTION,
    min: 0,
    max: 40,
    step: 0.1,
    defaultValue: DEFAULT_TERRAIN_CONFIG.rippleAmplitude,
    structural: true,
    visibleWhen: {
      id: 'terrainPreset',
      equals: 'ripple_bowl'
    }
  },
  {
    id: 'terrainRippleFrequency',
    label: 'Ripple Freq',
    section: TERRAIN_SECTION,
    min: 0.1,
    max: 20,
    step: 0.05,
    defaultValue: DEFAULT_TERRAIN_CONFIG.rippleFrequency,
    structural: true,
    visibleWhen: {
      id: 'terrainPreset',
      equals: 'ripple_bowl'
    }
  },
  {
    id: 'botCount',
    label: 'Bot Count',
    section: 'Population',
    min: 0,
    max: 40,
    step: 1,
    defaultValue: 1,
    structural: true,
    kind: 'int'
  },
  {
    id: 'playerMaxHealth',
    label: 'Player Health',
    section: 'Health',
    min: 1,
    max: 2000,
    step: 1,
    defaultValue: 600,
    structural: true,
    kind: 'int'
  },
  {
    id: 'botMaxHealth',
    label: 'Bot Health',
    section: 'Health',
    min: 1,
    max: 2000,
    step: 1,
    defaultValue: 600,
    structural: true,
    kind: 'int'
  },
  {
    id: 'freeMoveSpeed',
    label: 'Free Move Speed',
    section: 'Movement',
    min: 0,
    max: 30,
    step: 0.1,
    defaultValue: 10
  },
  {
    id: 'lockedMoveSpeed',
    label: 'Lock Move Speed',
    section: 'Movement',
    min: 0,
    max: 30,
    step: 0.1,
    defaultValue: 7.5
  },
  {
    id: 'botMoveSpeed',
    label: 'Bot Move Speed',
    section: 'Movement',
    min: 0,
    max: 20,
    step: 0.1,
    defaultValue: 4.2
  },
  {
    id: 'jumpVelocity',
    label: 'Jump Velocity',
    section: 'Movement',
    min: 0,
    max: 30,
    step: 0.1,
    defaultValue: 8.5 * Math.SQRT2
  },
  {
    id: 'bodyGravity',
    label: 'Body Gravity',
    section: 'Movement',
    min: 0,
    max: 60,
    step: 0.5,
    defaultValue: 24
  },
  {
    id: 'turnSpeed',
    label: 'Turn Speed',
    section: 'Movement',
    min: 0,
    max: 30,
    step: 0.1,
    defaultValue: 12
  },
  {
    id: 'bodyRadius',
    label: 'Body Radius',
    section: 'Movement',
    min: 0.5,
    max: 4,
    step: 0.05,
    defaultValue: 1.8,
    structural: true
  },
  {
    id: 'trailSpeedMultiplier',
    label: 'Trail Speed Multiplier',
    section: 'Trails',
    min: 1,
    max: 20,
    step: 0.1,
    defaultValue: 6
  },
  {
    id: 'trailCellSize',
    label: 'Trail Cell Size',
    section: 'Trails',
    min: 0.25,
    max: 4,
    step: 0.05,
    defaultValue: 1.5,
    structural: true
  },
  {
    id: 'trailContactRadius',
    label: 'Trail Contact Radius',
    section: 'Trails',
    min: 0.1,
    max: 4,
    step: 0.05,
    defaultValue: 1.2
  },
  {
    id: 'impactThreshold',
    label: 'Impact Threshold',
    section: 'Combat',
    min: 0,
    max: 20,
    step: 0.1,
    defaultValue: 5.4
  },
  {
    id: 'impactMomentumFactor',
    label: 'Momentum Factor',
    section: 'Combat',
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: 0.35
  },
  {
    id: 'innervatedDamageMultiplier',
    label: 'Innervated Damage Multiplier',
    section: 'Combat',
    min: 1,
    max: 12,
    step: 0.1,
    defaultValue: 5
  },
  {
    id: 'invincibilityDuration',
    label: 'Invincibility Duration',
    section: 'Combat',
    min: 0,
    max: 3,
    step: 0.01,
    defaultValue: 0.45
  },
  {
    id: 'stalkControlMode',
    label: 'Control Mode',
    section: 'Stalk Controls',
    defaultValue: 'top_down_plane',
    kind: 'choice',
    options: STALK_CONTROL_OPTIONS
  },
  {
    id: 'stalkTurgidity',
    label: 'Turgidity',
    section: 'Stalk Controls',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0
  },
  {
    id: 'stalkReachSensitivity',
    label: 'Wheel Sensitivity',
    section: 'Stalk Controls',
    min: 0,
    max: 0.5,
    step: 0.01,
    defaultValue: 0.08
  },
  {
    id: 'stalkReachMin',
    label: 'Min Reach',
    section: 'Stalk Controls',
    min: 0.1,
    max: 1,
    step: 0.01,
    defaultValue: 0.45
  },
  {
    id: 'stalkReachMax',
    label: 'Max Reach',
    section: 'Stalk Controls',
    min: 1,
    max: 2,
    step: 0.01,
    defaultValue: 1.35
  },
  {
    id: 'stalkMass',
    label: 'Stalk Mass',
    section: 'Stalk',
    min: 0.25,
    max: 8,
    step: 0.05,
    defaultValue: 1
  },
  {
    id: 'stalkSegmentCount',
    label: 'Segment Count',
    section: 'Stalk',
    min: 2,
    max: 16,
    step: 1,
    defaultValue: 6,
    structural: true,
    kind: 'int'
  },
  {
    id: 'stalkTotalLength',
    label: 'Total Length',
    section: 'Stalk',
    min: 1,
    max: 8,
    step: 0.05,
    defaultValue: 3.3,
    structural: true
  },
  {
    id: 'stalkSegmentRadius',
    label: 'Segment Radius',
    section: 'Stalk',
    min: 0.05,
    max: 0.5,
    step: 0.01,
    defaultValue: 0.18,
    structural: true
  },
  {
    id: 'stalkGravity',
    label: 'Stalk Gravity',
    section: 'Stalk',
    min: 0,
    max: 100,
    step: 0.5,
    defaultValue: 34
  },
  {
    id: 'stalkDamping',
    label: 'Stalk Damping',
    section: 'Stalk',
    min: 0.5,
    max: 0.999,
    step: 0.001,
    defaultValue: 0.96
  },
  {
    id: 'stalkConstraintIterations',
    label: 'Constraint Iterations',
    section: 'Stalk',
    min: 1,
    max: 10,
    step: 1,
    defaultValue: 3,
    kind: 'int'
  },
  {
    id: 'stalkDrivePull',
    label: 'Held Pull',
    section: 'Stalk',
    min: 0,
    max: 80,
    step: 0.5,
    defaultValue: 10
  },
  {
    id: 'stalkIdlePull',
    label: 'Idle Pull',
    section: 'Stalk',
    min: 0,
    max: 40,
    step: 0.5,
    defaultValue: 0
  },
  {
    id: 'stalkTargetApproachSpeed',
    label: 'Target Approach Speed',
    section: 'Stalk',
    min: 0,
    max: 240,
    step: 1,
    defaultValue: 120
  },
  {
    id: 'stalkNeutralYaw',
    label: 'Neutral Yaw',
    section: 'Stalk',
    min: -1.5,
    max: 1.5,
    step: 0.01,
    defaultValue: 0
  },
  {
    id: 'stalkNeutralPitch',
    label: 'Neutral Pitch',
    section: 'Stalk',
    min: -1.5,
    max: 1.5,
    step: 0.01,
    defaultValue: 0.08
  },
  {
    id: 'stalkYawLimit',
    label: 'Yaw Limit',
    section: 'Stalk',
    min: 0.2,
    max: 3,
    step: 0.01,
    defaultValue: 1.3
  },
  {
    id: 'stalkPitchMin',
    label: 'Pitch Min',
    section: 'Stalk',
    min: -3,
    max: 0,
    step: 0.01,
    defaultValue: -1.2
  },
  {
    id: 'stalkPitchMax',
    label: 'Pitch Max',
    section: 'Stalk',
    min: 0,
    max: 3,
    step: 0.01,
    defaultValue: 1.15
  },
  {
    id: 'stalkYawSensitivity',
    label: 'Yaw Sensitivity',
    section: 'Stalk',
    min: 0,
    max: 0.1,
    step: 0.001,
    defaultValue: 0.011
  },
  {
    id: 'stalkPitchSensitivity',
    label: 'Pitch Sensitivity',
    section: 'Stalk',
    min: 0,
    max: 0.1,
    step: 0.001,
    defaultValue: 0.014
  },
  {
    id: 'preferredDistance',
    label: 'Preferred Distance',
    section: 'Bot AI',
    min: 0,
    max: 15,
    step: 0.1,
    defaultValue: 5.2
  },
  {
    id: 'attackRange',
    label: 'Attack Range',
    section: 'Bot AI',
    min: 0,
    max: 20,
    step: 0.1,
    defaultValue: 6.1
  },
  {
    id: 'attackCooldown',
    label: 'Attack Cooldown',
    section: 'Bot AI',
    min: 0,
    max: 5,
    step: 0.05,
    defaultValue: 0.9
  },
  {
    id: 'windupDuration',
    label: 'Windup Duration',
    section: 'Bot AI',
    min: 0,
    max: 3,
    step: 0.05,
    defaultValue: 0.35
  },
  {
    id: 'strikeDuration',
    label: 'Strike Duration',
    section: 'Bot AI',
    min: 0.05,
    max: 3,
    step: 0.01,
    defaultValue: 0.24
  },
  {
    id: 'recoverDuration',
    label: 'Recover Duration',
    section: 'Bot AI',
    min: 0,
    max: 3,
    step: 0.05,
    defaultValue: 0.3
  },
  {
    id: 'approachMoveScale',
    label: 'Approach Move Scale',
    section: 'Bot AI',
    min: 0,
    max: 3,
    step: 0.05,
    defaultValue: 1
  },
  {
    id: 'backoffMoveScale',
    label: 'Backoff Move Scale',
    section: 'Bot AI',
    min: 0,
    max: 3,
    step: 0.05,
    defaultValue: 0.6
  },
  {
    id: 'strafeMoveScale',
    label: 'Strafe Move Scale',
    section: 'Bot AI',
    min: 0,
    max: 3,
    step: 0.05,
    defaultValue: 0.5
  },
  {
    id: 'strikeMoveScale',
    label: 'Strike Move Scale',
    section: 'Bot AI',
    min: 0,
    max: 3,
    step: 0.05,
    defaultValue: 0.8
  },
  {
    id: 'recoverMoveScale',
    label: 'Recover Move Scale',
    section: 'Bot AI',
    min: 0,
    max: 3,
    step: 0.05,
    defaultValue: 0.5
  },
  {
    id: 'bothAttackChance',
    label: 'Both Attack Chance',
    section: 'Bot AI',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.25
  }
]);

export const TUNING_SCHEMA = RAW_TUNING_SCHEMA.map((entry) => Object.freeze({ ...entry }));
export const DUEL_TUNING_SCHEMA = Object.freeze(
  TUNING_SCHEMA.filter((entry) => entry.id !== 'botCount')
);
export const TUNING_STORAGE_KEY = 'battlesnails:test-mode-tuning-v5';
export const STRUCTURAL_TUNING_KEYS = new Set(
  TUNING_SCHEMA.filter((entry) => entry.structural).map((entry) => entry.id)
);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value, step) {
  if (!Number.isFinite(step) || step <= 0) {
    return value;
  }

  const stepDecimals = `${step}`.includes('.')
    ? `${step}`.split('.')[1].length
    : 0;
  const rounded = Math.round(value / step) * step;
  return Number(rounded.toFixed(stepDecimals));
}

function normalizeChoiceValue(entry, rawValue) {
  const options = new Set((entry.options ?? []).map((option) => option.value));
  return options.has(rawValue) ? rawValue : entry.defaultValue;
}

function normalizeEntryValue(entry, rawValue) {
  if (entry.kind === 'choice') {
    return normalizeChoiceValue(entry, rawValue);
  }

  const fallback = entry.defaultValue;
  const numericValue = Number.isFinite(rawValue) ? rawValue : Number(rawValue);
  const clamped = clamp(
    Number.isFinite(numericValue) ? numericValue : fallback,
    entry.min,
    entry.max
  );
  const stepped = roundToStep(clamped, entry.step);
  return entry.kind === 'int' ? Math.round(stepped) : stepped;
}

export const DEFAULT_TUNING_CONFIG = Object.freeze(
  Object.fromEntries(
    TUNING_SCHEMA.map((entry) => [entry.id, normalizeEntryValue(entry, entry.defaultValue)])
  )
);

export function getDefaultTuningConfig() {
  return { ...DEFAULT_TUNING_CONFIG };
}

export function normalizeTuningConfig(rawConfig = {}) {
  const normalized = {};

  for (const entry of TUNING_SCHEMA) {
    normalized[entry.id] = normalizeEntryValue(entry, rawConfig[entry.id]);
  }

  if (normalized.stalkPitchMin > normalized.stalkPitchMax) {
    const midpoint = (normalized.stalkPitchMin + normalized.stalkPitchMax) / 2;
    normalized.stalkPitchMin = midpoint;
    normalized.stalkPitchMax = midpoint;
  }

  if (normalized.stalkReachMin > normalized.stalkReachMax) {
    const midpoint = (normalized.stalkReachMin + normalized.stalkReachMax) / 2;
    normalized.stalkReachMin = midpoint;
    normalized.stalkReachMax = midpoint;
  }

  return normalized;
}

export function normalizeDuelTuningConfig(rawConfig = {}) {
  return {
    ...normalizeTuningConfig(rawConfig),
    botCount: DEFAULT_TUNING_CONFIG.botCount
  };
}

export function hasStructuralTuningChanges(previousConfig, nextConfig) {
  const previous = normalizeTuningConfig(previousConfig);
  const next = normalizeTuningConfig(nextConfig);

  for (const key of STRUCTURAL_TUNING_KEYS) {
    if (previous[key] !== next[key]) {
      return true;
    }
  }

  return false;
}

export function createTerrainConfigFromTuning(config = DEFAULT_TUNING_CONFIG) {
  const tuning = normalizeTuningConfig(config);
  return normalizeTerrainConfig({
    preset: tuning.terrainPreset,
    centerHeight: tuning.terrainCenterHeight,
    horizontalScale: tuning.terrainHorizontalScale,
    verticalScale: tuning.terrainVerticalScale,
    rippleAmplitude: tuning.terrainRippleAmplitude,
    rippleFrequency: tuning.terrainRippleFrequency
  });
}

export function isTuningEntryVisible(entry, values = DEFAULT_TUNING_CONFIG) {
  const condition = entry.visibleWhen;
  if (!condition) {
    return true;
  }

  return values?.[condition.id] === condition.equals;
}

export function createSimulationProfiles(config = DEFAULT_TUNING_CONFIG) {
  const tuning = normalizeTuningConfig(config);
  const sharedProfile = {
    groundHeight: 1,
    arenaRadius: 22,
    bodyRadius: tuning.bodyRadius,
    invincibilityDuration: tuning.invincibilityDuration,
    jumpVelocity: tuning.jumpVelocity,
    gravity: tuning.bodyGravity,
    turnSpeed: tuning.turnSpeed,
    stalkNeutralYaw: tuning.stalkNeutralYaw,
    stalkNeutralPitch: tuning.stalkNeutralPitch,
    stalkYawLimit: tuning.stalkYawLimit,
    stalkPitchMin: tuning.stalkPitchMin,
    stalkPitchMax: tuning.stalkPitchMax,
    stalkSegmentCount: tuning.stalkSegmentCount,
    stalkTotalLength: tuning.stalkTotalLength,
    stalkSegmentRadius: tuning.stalkSegmentRadius,
    stalkGravity: tuning.stalkGravity,
    stalkDamping: tuning.stalkDamping,
    stalkConstraintIterations: tuning.stalkConstraintIterations,
    stalkDrivePull: tuning.stalkDrivePull,
    stalkIdlePull: tuning.stalkIdlePull,
    stalkTargetApproachSpeed: tuning.stalkTargetApproachSpeed,
    stalkControlMode: tuning.stalkControlMode,
    stalkTurgidity: tuning.stalkTurgidity,
    stalkReachSensitivity: tuning.stalkReachSensitivity,
    stalkReachMin: tuning.stalkReachMin,
    stalkReachMax: tuning.stalkReachMax,
    stalkMass: tuning.stalkMass,
    impactThreshold: tuning.impactThreshold,
    impactMomentumFactor: tuning.impactMomentumFactor,
    innervatedDamageMultiplier: tuning.innervatedDamageMultiplier,
    stalkYawSensitivity: tuning.stalkYawSensitivity,
    stalkPitchSensitivity: tuning.stalkPitchSensitivity
  };

  return {
    human: {
      ...sharedProfile,
      maxHealth: tuning.playerMaxHealth,
      turnSpeed: tuning.turnSpeed,
      lockedMoveSpeed: tuning.lockedMoveSpeed,
      freeMoveSpeed: tuning.freeMoveSpeed
    },
    bot: {
      ...sharedProfile,
      maxHealth: tuning.botMaxHealth,
      turnSpeed: 8,
      lockedMoveSpeed: tuning.botMoveSpeed,
      freeMoveSpeed: tuning.botMoveSpeed,
      stalkNeutralPitch: 0.12,
      stalkYawLimit: Math.min(sharedProfile.stalkYawLimit, 1.05),
      stalkPitchMin: Math.max(sharedProfile.stalkPitchMin, -0.55),
      stalkPitchMax: Math.min(sharedProfile.stalkPitchMax, 0.7),
      impactThreshold: Math.max(0, sharedProfile.impactThreshold - 0.3),
      impactMomentumFactor: Math.max(0, sharedProfile.impactMomentumFactor * 0.8),
      stalkYawSensitivity: sharedProfile.stalkYawSensitivity * (0.009 / 0.011),
      stalkPitchSensitivity: sharedProfile.stalkPitchSensitivity * (0.009 / 0.014)
    }
  };
}

export function createBotControllerConfig(config = DEFAULT_TUNING_CONFIG) {
  const tuning = normalizeTuningConfig(config);
  return {
    preferredDistance: tuning.preferredDistance,
    attackRange: tuning.attackRange,
    attackCooldown: tuning.attackCooldown,
    windupDuration: tuning.windupDuration,
    strikeDuration: tuning.strikeDuration,
    recoverDuration: tuning.recoverDuration,
    approachMoveScale: tuning.approachMoveScale,
    backoffMoveScale: tuning.backoffMoveScale,
    strafeMoveScale: tuning.strafeMoveScale,
    strikeMoveScale: tuning.strikeMoveScale,
    recoverMoveScale: tuning.recoverMoveScale,
    bothAttackChance: tuning.bothAttackChance
  };
}

export function formatTuningValue(entry, value) {
  if (entry.kind === 'choice') {
    return entry.options?.find((option) => option.value === value)?.label ?? `${value}`;
  }

  if (entry.kind === 'int') {
    return `${Math.round(value)}`;
  }

  const stepDecimals = `${entry.step}`.includes('.')
    ? `${entry.step}`.split('.')[1].length
    : 0;
  return Number(value).toFixed(stepDecimals);
}
