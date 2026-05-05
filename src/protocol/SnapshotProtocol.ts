export function createTrailCellKey(cell: { x: number; z: number }): string {
  return `${cell.x}:${cell.z}`;
}

export function mergeNetworkSnapshot(previous: any, update: any, { replace = false }: any = {}) {
  if (!update) {
    return replace ? null : previous;
  }

  const base = replace ? null : previous;
  const previousPlayersBySlot = new Map<number, any>((base?.players ?? []).map((player: any) => [player.slot, player]));
  const players = (update.players ?? base?.players ?? []).map((player: any) => ({
    ...(previousPlayersBySlot.get(player.slot) ?? {}),
    ...player
  }));
  const trailCells = update.trailCells
    ? [...update.trailCells]
    : [...(base?.trailCells ?? [])];
  const trailCellKeys = new Set(trailCells.map(createTrailCellKey));

  for (const cell of update.trailCellsDelta ?? []) {
    const key = createTrailCellKey(cell);
    if (trailCellKeys.has(key)) {
      continue;
    }

    trailCellKeys.add(key);
    trailCells.push(cell);
  }

  return {
    ...(base ?? {}),
    ...update,
    terrain: update.terrain ?? base?.terrain,
    trailCellSize: update.trailCellSize ?? base?.trailCellSize,
    trailCells,
    worldProps: update.worldProps ?? base?.worldProps ?? [],
    creatures: update.creatures ?? base?.creatures ?? [],
    events: update.events ?? [],
    players
  };
}
