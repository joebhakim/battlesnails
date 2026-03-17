import * as THREE from 'three';

import { createIdleInput } from './MatchSimulation.js';

export class BotController {
  constructor(options = {}) {
    this.setConfig(options);

    this.attackCooldownRemaining = 0.5;
    this.state = 'approach';
    this.stateTimer = 0;
    this.attackSide = 1;
    this.strafeDirection = 1;
    this.attackPattern = 'left';
  }

  setConfig(options = {}) {
    this.preferredDistance = options.preferredDistance ?? 5.2;
    this.attackRange = options.attackRange ?? 6.1;
    this.attackCooldown = options.attackCooldown ?? 0.9;
    this.windupDuration = options.windupDuration ?? 0.35;
    this.strikeDuration = options.strikeDuration ?? 0.24;
    this.recoverDuration = options.recoverDuration ?? 0.3;
    this.approachMoveScale = options.approachMoveScale ?? 1;
    this.backoffMoveScale = options.backoffMoveScale ?? 0.6;
    this.strafeMoveScale = options.strafeMoveScale ?? 0.5;
    this.strikeMoveScale = options.strikeMoveScale ?? 0.8;
    this.recoverMoveScale = options.recoverMoveScale ?? 0.5;
    this.bothAttackChance = options.bothAttackChance ?? 0.25;
  }

  reset() {
    this.attackCooldownRemaining = 0.5;
    this.state = 'approach';
    this.stateTimer = 0;
    this.attackSide = 1;
    this.strafeDirection = 1;
    this.attackPattern = 'left';
  }

  getInput(simulation, botSlot, targetSlot, delta) {
    const bot = simulation.getPlayerState(botSlot);
    const target = simulation.getPlayerState(targetSlot);
    const input = createIdleInput();

    if (!bot || !target || simulation.phase !== 'running') {
      return input;
    }

    this.attackCooldownRemaining = Math.max(0, this.attackCooldownRemaining - delta);
    this.stateTimer += delta;

    const toTarget = target.position.clone().sub(bot.position).setY(0);
    const distanceToTarget = toTarget.length();
    const directionToTarget = distanceToTarget === 0
      ? new THREE.Vector3(0, 0, 1)
      : toTarget.normalize();
    const strafeDirection = new THREE.Vector3(-directionToTarget.z, 0, directionToTarget.x)
      .multiplyScalar(this.strafeDirection);

    input.lockOnHeld = true;
    input.moveX = 0;
    input.moveZ = 0;

    switch (this.state) {
      case 'approach':
        this.fillApproachInput(input, directionToTarget, strafeDirection, distanceToTarget);
        break;
      case 'windup':
        this.fillWindupInput(input, distanceToTarget);
        break;
      case 'strike':
        this.fillStrikeInput(input, directionToTarget, distanceToTarget);
        break;
      case 'recover':
        this.fillRecoverInput(input, directionToTarget, distanceToTarget);
        break;
    }

    return input;
  }

  fillApproachInput(input, directionToTarget, strafeDirection, distanceToTarget) {
    if (distanceToTarget > this.preferredDistance) {
      input.moveX = directionToTarget.x * this.approachMoveScale;
      input.moveZ = directionToTarget.z * this.approachMoveScale;
    } else if (distanceToTarget < this.preferredDistance * 0.7) {
      input.moveX = -directionToTarget.x * this.backoffMoveScale;
      input.moveZ = -directionToTarget.z * this.backoffMoveScale;
    } else {
      input.moveX = strafeDirection.x * this.strafeMoveScale;
      input.moveZ = strafeDirection.z * this.strafeMoveScale;
    }

    if (distanceToTarget <= this.attackRange && this.attackCooldownRemaining === 0) {
      this.attackSide = Math.random() > 0.5 ? 1 : -1;
      this.strafeDirection = -this.attackSide;
      this.attackPattern = Math.random() < this.bothAttackChance
        ? 'both'
        : this.attackSide > 0
          ? 'right'
          : 'left';
      this.setState('windup');
    }
  }

  fillWindupInput(input, distanceToTarget) {
    input.leftHeld = this.attackPattern === 'left' || this.attackPattern === 'both';
    input.rightHeld = this.attackPattern === 'right' || this.attackPattern === 'both';
    input.lookX = this.attackSide * -18;
    input.lookY = -10;

    if (distanceToTarget > this.attackRange * 1.25) {
      this.setState('approach');
      return;
    }

    if (this.stateTimer >= this.windupDuration) {
      this.setState('strike');
    }
  }

  fillStrikeInput(input, directionToTarget, distanceToTarget) {
    input.leftHeld = this.attackPattern === 'left' || this.attackPattern === 'both';
    input.rightHeld = this.attackPattern === 'right' || this.attackPattern === 'both';
    input.lookX = this.attackSide * 8;
    input.lookY = -18;

    if (distanceToTarget <= this.attackRange * 1.1) {
      input.moveX = directionToTarget.x * this.strikeMoveScale;
      input.moveZ = directionToTarget.z * this.strikeMoveScale;
    }

    if (this.stateTimer >= this.strikeDuration) {
      this.attackCooldownRemaining = this.attackCooldown;
      this.setState('recover');
    }
  }

  fillRecoverInput(input, directionToTarget, distanceToTarget) {
    if (distanceToTarget < this.preferredDistance * 1.05) {
      input.moveX = -directionToTarget.x * this.recoverMoveScale;
      input.moveZ = -directionToTarget.z * this.recoverMoveScale;
    }

    if (this.stateTimer >= this.recoverDuration) {
      this.setState('approach');
    }
  }

  setState(nextState) {
    this.state = nextState;
    this.stateTimer = 0;
  }
}
