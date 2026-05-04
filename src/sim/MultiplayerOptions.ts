import { ARENA_TERRAIN_PRESET_OPTIONS, DEFAULT_TERRAIN_CONFIG } from '../world/Terrain.js';

export const MULTIPLAYER_MATCH_MODE = Object.freeze({
  ARENA_PVP: 'arena_pvp',
  ADVENTURE_COOP: 'adventure_coop',
  ADVENTURE_PVP: 'adventure_pvp'
});

export const MULTIPLAYER_MATCH_MODE_OPTIONS = Object.freeze([
  Object.freeze({
    value: MULTIPLAYER_MATCH_MODE.ARENA_PVP,
    label: 'Arena 1v1'
  }),
  Object.freeze({
    value: MULTIPLAYER_MATCH_MODE.ADVENTURE_COOP,
    label: 'Adventure Co-op PvE'
  }),
  Object.freeze({
    value: MULTIPLAYER_MATCH_MODE.ADVENTURE_PVP,
    label: 'Adventure PvP'
  })
]);

export const DEFAULT_MULTIPLAYER_OPTIONS = Object.freeze({
  matchMode: MULTIPLAYER_MATCH_MODE.ARENA_PVP,
  stagePreset: DEFAULT_TERRAIN_CONFIG.preset
});

const VALID_MATCH_MODES = new Set(MULTIPLAYER_MATCH_MODE_OPTIONS.map((option) => option.value));
const VALID_STAGE_PRESETS = new Set(ARENA_TERRAIN_PRESET_OPTIONS.map((option) => option.value));

export const MULTIPLAYER_OPTIONS_SCHEMA = Object.freeze([
  Object.freeze({
    id: 'matchMode',
    label: 'Format',
    section: 'LAN',
    defaultValue: DEFAULT_MULTIPLAYER_OPTIONS.matchMode,
    structural: true,
    kind: 'choice',
    options: MULTIPLAYER_MATCH_MODE_OPTIONS
  }),
  Object.freeze({
    id: 'stagePreset',
    label: 'Arena Stage',
    section: 'LAN',
    defaultValue: DEFAULT_MULTIPLAYER_OPTIONS.stagePreset,
    structural: true,
    kind: 'choice',
    options: ARENA_TERRAIN_PRESET_OPTIONS
  })
]);

export function normalizeMultiplayerOptions(rawOptions: any = {}) {
  return {
    matchMode: VALID_MATCH_MODES.has(rawOptions.matchMode)
      ? rawOptions.matchMode
      : DEFAULT_MULTIPLAYER_OPTIONS.matchMode,
    stagePreset: VALID_STAGE_PRESETS.has(rawOptions.stagePreset)
      ? rawOptions.stagePreset
      : DEFAULT_MULTIPLAYER_OPTIONS.stagePreset
  };
}

export function isAdventureMultiplayerMode(options: any = {}) {
  const normalized = normalizeMultiplayerOptions(options);
  return normalized.matchMode === MULTIPLAYER_MATCH_MODE.ADVENTURE_COOP ||
    normalized.matchMode === MULTIPLAYER_MATCH_MODE.ADVENTURE_PVP;
}

export function getMultiplayerModeLabel(value: string) {
  return MULTIPLAYER_MATCH_MODE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
