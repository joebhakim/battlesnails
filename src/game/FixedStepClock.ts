export const MAX_FIXED_STEPS_PER_FRAME = 4;

export function accumulateFixedStepTime(
  accumulator: number,
  delta: number,
  tickDuration: number,
  maxSteps = MAX_FIXED_STEPS_PER_FRAME
) {
  const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
  const maxAccumulatedTime = Math.max(tickDuration, tickDuration * Math.max(1, maxSteps));
  return Math.min(accumulator + safeDelta, maxAccumulatedTime);
}

export function getFixedStepCount(
  accumulator: number,
  tickDuration: number,
  maxSteps = MAX_FIXED_STEPS_PER_FRAME
) {
  if (accumulator < tickDuration) {
    return 0;
  }

  return Math.min(Math.max(1, maxSteps), Math.floor(accumulator / tickDuration));
}
