import { EXPLORER_TERRAIN_PRESET } from '../world/Terrain.js';
import { createExplorerWorld } from '../world/ExplorerWorld.js';

export function createArenaEnvironment(options: any = {}) {
  if (options.stagePreset !== EXPLORER_TERRAIN_PRESET) {
    return null;
  }

  const world = createExplorerWorld(options.explorerSeed);
  return {
    terrainConfig: world.terrainConfig,
    arenaRadius: world.worldBounds.radius,
    worldProps: world.props
  };
}
