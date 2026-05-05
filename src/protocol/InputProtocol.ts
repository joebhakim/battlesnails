export interface PlayerInput {
  moveX: number;
  moveZ: number;
  jumpPressed: boolean;
  lockOnHeld: boolean;
  lookX: number;
  lookY: number;
  turnX: number;
  reachDelta: number;
  interactPressed: boolean;
  leftHeld: boolean;
  rightHeld: boolean;
}

export const DEFAULT_PLAYER_INPUT: Readonly<PlayerInput> = Object.freeze({
  moveX: 0,
  moveZ: 0,
  jumpPressed: false,
  lockOnHeld: false,
  lookX: 0,
  lookY: 0,
  turnX: 0,
  reachDelta: 0,
  interactPressed: false,
  leftHeld: false,
  rightHeld: false
});

function finiteNumber(value: unknown, fallback = 0): number {
  return Number.isFinite(value) ? value as number : fallback;
}

export function createIdleInput(): PlayerInput {
  return { ...DEFAULT_PLAYER_INPUT };
}

export function createBufferedInput(): PlayerInput {
  return createIdleInput();
}

export function normalizePlayerInput(input: Partial<PlayerInput> = {}): PlayerInput {
  return {
    moveX: finiteNumber(input.moveX),
    moveZ: finiteNumber(input.moveZ),
    jumpPressed: Boolean(input.jumpPressed),
    lockOnHeld: Boolean(input.lockOnHeld),
    lookX: finiteNumber(input.lookX),
    lookY: finiteNumber(input.lookY),
    turnX: finiteNumber(input.turnX),
    reachDelta: finiteNumber(input.reachDelta),
    interactPressed: Boolean(input.interactPressed),
    leftHeld: Boolean(input.leftHeld),
    rightHeld: Boolean(input.rightHeld)
  };
}
