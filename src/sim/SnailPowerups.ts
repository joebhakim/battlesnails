export const SNAIL_POWERUP_TYPES = Object.freeze(['dew', 'food', 'calcium', 'grit']);

export const SNAIL_POWERUP_LABELS = Object.freeze({
  dew: 'Dew',
  food: 'Soft Food',
  calcium: 'Calcium',
  grit: 'Sharp Grit'
});

const DEFAULT_POWERUPS_BY_KIND = Object.freeze({
  dew_bead: Object.freeze({ type: 'dew', amount: 1 }),
  dew_pool: Object.freeze({ type: 'dew', amount: 2 }),
  soft_food: Object.freeze({ type: 'food', amount: 60 }),
  shell_shard: Object.freeze({ type: 'calcium', amount: 14 }),
  sharp_grit: Object.freeze({ type: 'grit', amount: 1 })
});

export function createEmptySnailStats() {
  return {
    dew: 0,
    food: 0,
    calcium: 0,
    grit: 0,
    pickups: 0,
    speedMultiplier: 1,
    damageMultiplier: 1
  };
}

export function cloneSnailStats(stats: any = null) {
  const source = stats ?? createEmptySnailStats();
  return {
    dew: Number.isFinite(source.dew) ? source.dew : 0,
    food: Number.isFinite(source.food) ? source.food : 0,
    calcium: Number.isFinite(source.calcium) ? source.calcium : 0,
    grit: Number.isFinite(source.grit) ? source.grit : 0,
    pickups: Number.isFinite(source.pickups) ? source.pickups : 0,
    speedMultiplier: Number.isFinite(source.speedMultiplier) ? source.speedMultiplier : 1,
    damageMultiplier: Number.isFinite(source.damageMultiplier) ? source.damageMultiplier : 1
  };
}

export function getPowerupForProp(prop: any = null) {
  if (!prop) {
    return null;
  }

  const powerup = prop.powerup ?? DEFAULT_POWERUPS_BY_KIND[prop.kind];
  if (!powerup || !SNAIL_POWERUP_TYPES.includes(powerup.type)) {
    return null;
  }

  const amount = Number(powerup.amount);
  return {
    type: powerup.type,
    amount: Number.isFinite(amount) ? amount : DEFAULT_POWERUPS_BY_KIND[prop.kind]?.amount ?? 1,
    label: powerup.label ?? SNAIL_POWERUP_LABELS[powerup.type] ?? 'Powerup'
  };
}

export function getSnailSpeedMultiplier(stats: any = null) {
  const dew = Math.max(0, Number(stats?.dew) || 0);
  return 1 + Math.min(1.15, dew * 0.035);
}

export function getSnailDamageMultiplier(stats: any = null) {
  const grit = Math.max(0, Number(stats?.grit) || 0);
  return 1 + Math.min(1.4, grit * 0.09);
}

export function updateSnailStatDerivedValues(stats: any) {
  if (!stats) {
    return createEmptySnailStats();
  }

  stats.speedMultiplier = getSnailSpeedMultiplier(stats);
  stats.damageMultiplier = getSnailDamageMultiplier(stats);
  return stats;
}
