import { DEFAULT_TUNING_CONFIG, normalizeTuningConfig } from './Tuning.js';
import { ARENA_TERRAIN_PRESET_OPTIONS, DEFAULT_TERRAIN_CONFIG } from '../world/Terrain.js';

export const ENCOUNTER_PRESETS = Object.freeze([
  Object.freeze({
    value: 'one_strong',
    label: 'One Strong',
    botCount: 1,
    botMaxHealth: DEFAULT_TUNING_CONFIG.botMaxHealth,
    botMoveSpeed: DEFAULT_TUNING_CONFIG.botMoveSpeed,
    attackCooldown: DEFAULT_TUNING_CONFIG.attackCooldown
  }),
  Object.freeze({
    value: 'many_weak',
    label: 'Many Weak',
    botCount: 8,
    botMaxHealth: 80,
    botMoveSpeed: 3.8,
    attackCooldown: 1.25
  }),
  Object.freeze({
    value: 'one_weak',
    label: 'One Weak',
    botCount: 1,
    botMaxHealth: 120,
    botMoveSpeed: 3.7,
    attackCooldown: 1.4
  }),
  Object.freeze({
    value: 'many_strong_comical',
    label: 'Many Strong (Comical)',
    botCount: 8,
    botMaxHealth: 300,
    botMoveSpeed: DEFAULT_TUNING_CONFIG.botMoveSpeed,
    attackCooldown: DEFAULT_TUNING_CONFIG.attackCooldown
  })
]);

export const ENCOUNTER_PRESET_MAP = new Map(ENCOUNTER_PRESETS.map((preset) => [preset.value, preset]));

export const DEFAULT_SINGLE_PLAYER_OPTIONS = Object.freeze({
  stagePreset: DEFAULT_TERRAIN_CONFIG.preset,
  encounterPreset: 'one_strong'
});

const VALID_STAGE_PRESETS = new Set(ARENA_TERRAIN_PRESET_OPTIONS.map((option) => option.value));
const VALID_ENCOUNTER_PRESETS = new Set(ENCOUNTER_PRESETS.map((preset) => preset.value));

export function getEncounterPreset(value) {
  return ENCOUNTER_PRESET_MAP.get(value) ?? ENCOUNTER_PRESET_MAP.get(DEFAULT_SINGLE_PLAYER_OPTIONS.encounterPreset)!;
}

export function getStagePresetLabel(value) {
  return ARENA_TERRAIN_PRESET_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function normalizeScenarioOptions(rawOptions: any = {}) {
  return {
    stagePreset: VALID_STAGE_PRESETS.has(rawOptions.stagePreset)
      ? rawOptions.stagePreset
      : DEFAULT_SINGLE_PLAYER_OPTIONS.stagePreset,
    encounterPreset: VALID_ENCOUNTER_PRESETS.has(rawOptions.encounterPreset)
      ? rawOptions.encounterPreset
      : DEFAULT_SINGLE_PLAYER_OPTIONS.encounterPreset
  };
}

export function createTuningConfigFromScenario(options, baseConfig = DEFAULT_TUNING_CONFIG) {
  const normalizedOptions = normalizeScenarioOptions(options);
  const encounter = getEncounterPreset(normalizedOptions.encounterPreset);
  const normalizedBase = normalizeTuningConfig(baseConfig);
  const encounterOverrides = normalizedOptions.encounterPreset === DEFAULT_SINGLE_PLAYER_OPTIONS.encounterPreset
    ? {}
    : {
      botMaxHealth: encounter.botMaxHealth,
      botMoveSpeed: encounter.botMoveSpeed,
      attackCooldown: encounter.attackCooldown
    };

  return normalizeTuningConfig({
    ...normalizedBase,
    terrainPreset: normalizedOptions.stagePreset,
    botCount: encounter.botCount,
    ...encounterOverrides
  });
}

export function createParticipantsForScenario(options) {
  const encounter = getEncounterPreset(normalizeScenarioOptions(options).encounterPreset);

  return [
    { slot: 1, profile: 'human', connected: true },
    ...Array.from({ length: encounter.botCount }, (_, index) => ({
      slot: index + 2,
      profile: 'bot',
      connected: true
    }))
  ];
}

export function createScenarioDescriptor(options) {
  const normalizedOptions = normalizeScenarioOptions(options);
  const encounter = getEncounterPreset(normalizedOptions.encounterPreset);

  return {
    id: `${normalizedOptions.stagePreset}:${normalizedOptions.encounterPreset}`,
    stagePreset: normalizedOptions.stagePreset,
    stageLabel: getStagePresetLabel(normalizedOptions.stagePreset),
    encounterPreset: normalizedOptions.encounterPreset,
    encounterLabel: encounter.label,
    botCount: encounter.botCount,
    label: `${getStagePresetLabel(normalizedOptions.stagePreset)} / ${encounter.label}`
  };
}
