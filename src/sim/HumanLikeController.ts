import { createIdleInput } from '../protocol/InputProtocol.js';
import { SeededRandom } from './SeededRandom.js';

export const DEFAULT_HUMANLIKE_CONFIG = Object.freeze({
  preferredDistance: 4.9,
  retreatDistance: 2.9,
  attackRange: 6.2,
  attackCooldown: 0.72,
  windupDuration: 0.18,
  strikeDuration: 0.22,
  recoverDuration: 0.28,
  strafeMoveScale: 0.72,
  approachMoveScale: 1,
  retreatMoveScale: 0.82,
  strikeMoveScale: 0.72,
  movementNoise: 0.16,
  mouseNoise: 2.6,
  windupLookX: 16,
  windupLookY: -8,
  strikeLookX: 24,
  strikeLookY: -21,
  bothAttackChance: 0.18,
  jumpChancePerSecond: 0.08,
  targetMemoryAttackMaxAge: 0.75
});

function normalizePlanar(dx, dz) {
  const length = Math.hypot(dx, dz);
  if (length === 0) {
    return { x: 0, z: 1, length: 0 };
  }

  return {
    x: dx / length,
    z: dz / length,
    length
  };
}

function clampUnitMovement(input) {
  const length = Math.hypot(input.moveX, input.moveZ);
  if (length > 1) {
    input.moveX /= length;
    input.moveZ /= length;
  }
}

function getFacingVector(rotationY = 0) {
  return {
    x: Math.sin(rotationY),
    z: Math.cos(rotationY)
  };
}

export class HumanLikeController {
  declare attackCooldownRemaining: any;
  declare attackPattern: any;
  declare attackSide: any;
  declare config: any;
  declare rng: any;
  declare state: any;
  declare stateTimer: any;
  declare strafeDirection: any;
  constructor(options: any = {}) {
    this.rng = options.rng instanceof SeededRandom
      ? options.rng
      : new SeededRandom(options.seed ?? 1);
    this.config = {
      ...DEFAULT_HUMANLIKE_CONFIG,
      ...options
    };
    delete this.config.rng;
    delete this.config.seed;
    this.reset();
  }

  reset() {
    this.state = 'approach';
    this.stateTimer = 0;
    this.attackCooldownRemaining = 0.3;
    this.strafeDirection = this.rng.chance(0.5) ? 1 : -1;
    this.attackSide = this.rng.chance(0.5) ? 1 : -1;
    this.attackPattern = 'left';
  }

  getInput(observation, delta) {
    const input = createIdleInput();
    const self = observation?.self;
    const target = observation?.target;
    if (!self || self.health <= 0) {
      return input;
    }

    this.attackCooldownRemaining = Math.max(0, this.attackCooldownRemaining - delta);
    this.stateTimer += delta;

    if (!target) {
      const facing = getFacingVector(self.rotationY);
      const sidestep = {
        x: -facing.z,
        z: facing.x
      };
      input.moveX = facing.x * 0.32 + sidestep.x * this.rng.signed(0.22);
      input.moveZ = facing.z * 0.32 + sidestep.z * this.rng.signed(0.22);
      clampUnitMovement(input);
      return input;
    }

    const direction = normalizePlanar(
      target.position.x - self.position.x,
      target.position.z - self.position.z
    );
    const strafe = {
      x: -direction.z * this.strafeDirection,
      z: direction.x * this.strafeDirection
    };

    input.lockOnHeld = observation.canSeeTarget || (observation.rememberedTarget?.age ?? Infinity) <= 0.5;

    switch (this.state) {
      case 'approach':
        this.fillApproachInput(input, observation, direction, strafe);
        break;
      case 'windup':
        this.fillWindupInput(input, observation, direction);
        break;
      case 'strike':
        this.fillStrikeInput(input, direction);
        break;
      case 'recover':
        this.fillRecoverInput(input, direction, strafe);
        break;
    }

    input.moveX += this.rng.signed(this.config.movementNoise);
    input.moveZ += this.rng.signed(this.config.movementNoise);
    input.jumpPressed = this.rng.chance(this.config.jumpChancePerSecond * delta);
    clampUnitMovement(input);
    return input;
  }

  fillApproachInput(input, observation, direction, strafe) {
    const distance = direction.length;
    if (distance > this.config.preferredDistance) {
      input.moveX = direction.x * this.config.approachMoveScale;
      input.moveZ = direction.z * this.config.approachMoveScale;
    } else if (distance < this.config.retreatDistance) {
      input.moveX = -direction.x * this.config.retreatMoveScale;
      input.moveZ = -direction.z * this.config.retreatMoveScale;
    } else {
      input.moveX = strafe.x * this.config.strafeMoveScale;
      input.moveZ = strafe.z * this.config.strafeMoveScale;
    }

    const memoryAge = observation.rememberedTarget?.age ?? Infinity;
    const hasRecentTarget = observation.canSeeTarget || memoryAge <= this.config.targetMemoryAttackMaxAge;
    if (
      hasRecentTarget &&
      distance <= this.config.attackRange &&
      this.attackCooldownRemaining === 0
    ) {
      this.attackSide = this.rng.chance(0.5) ? 1 : -1;
      this.strafeDirection = -this.attackSide;
      this.attackPattern = this.rng.chance(this.config.bothAttackChance)
        ? 'both'
        : this.attackSide > 0
          ? 'right'
          : 'left';
      this.setState('windup');
    }
  }

  fillWindupInput(input, observation, direction) {
    this.applyAttackHolds(input);
    input.lookX = this.attackSide * -this.config.windupLookX + this.rng.signed(this.config.mouseNoise);
    input.lookY = this.config.windupLookY + this.rng.signed(this.config.mouseNoise);

    if (!observation.target || direction.length > this.config.attackRange * 1.35) {
      this.setState('approach');
      return;
    }

    if (this.stateTimer >= this.config.windupDuration) {
      this.setState('strike');
    }
  }

  fillStrikeInput(input, direction) {
    this.applyAttackHolds(input);
    input.lookX = this.attackSide * this.config.strikeLookX + this.rng.signed(this.config.mouseNoise);
    input.lookY = this.config.strikeLookY + this.rng.signed(this.config.mouseNoise);
    input.moveX = direction.x * this.config.strikeMoveScale;
    input.moveZ = direction.z * this.config.strikeMoveScale;

    if (this.stateTimer >= this.config.strikeDuration) {
      this.attackCooldownRemaining = this.config.attackCooldown;
      this.setState('recover');
    }
  }

  fillRecoverInput(input, direction, strafe) {
    input.moveX = (-direction.x * 0.55) + (strafe.x * 0.25);
    input.moveZ = (-direction.z * 0.55) + (strafe.z * 0.25);

    if (this.stateTimer >= this.config.recoverDuration) {
      this.setState('approach');
    }
  }

  applyAttackHolds(input) {
    input.leftHeld = this.attackPattern === 'left' || this.attackPattern === 'both';
    input.rightHeld = this.attackPattern === 'right' || this.attackPattern === 'both';
  }

  setState(nextState) {
    this.state = nextState;
    this.stateTimer = 0;
  }
}
