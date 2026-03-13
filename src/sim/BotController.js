import * as THREE from 'three';

import { createIdleInput } from './MatchSimulation.js';

export class BotController {
  constructor(options = {}) {
    this.preferredDistance = options.preferredDistance ?? 5.2;
    this.attackRange = options.attackRange ?? 6.1;
    this.attackCooldown = options.attackCooldown ?? 0.9;
    this.windupDuration = options.windupDuration ?? 0.35;
    this.recoverDuration = options.recoverDuration ?? 0.3;

    this.attackCooldownRemaining = 0.5;
    this.state = 'approach';
    this.stateTimer = 0;
    this.attackSide = 1;
    this.strafeDirection = 1;
  }

  reset() {
    this.attackCooldownRemaining = 0.5;
    this.state = 'approach';
    this.stateTimer = 0;
    this.attackSide = 1;
    this.strafeDirection = 1;
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
      input.moveX = directionToTarget.x;
      input.moveZ = directionToTarget.z;
    } else if (distanceToTarget < this.preferredDistance * 0.7) {
      input.moveX = -directionToTarget.x * 0.6;
      input.moveZ = -directionToTarget.z * 0.6;
    } else {
      input.moveX = strafeDirection.x * 0.5;
      input.moveZ = strafeDirection.z * 0.5;
    }

    if (distanceToTarget <= this.attackRange && this.attackCooldownRemaining === 0) {
      this.attackSide = Math.random() > 0.5 ? 1 : -1;
      this.strafeDirection = -this.attackSide;
      this.setState('windup');
    }
  }

  fillWindupInput(input, distanceToTarget) {
    input.combatMode = 'swing';
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
    input.combatMode = 'thrust';
    input.lookX = this.attackSide * 8;
    input.lookY = -18;

    if (distanceToTarget <= this.attackRange * 1.1) {
      input.moveX = directionToTarget.x * 0.8;
      input.moveZ = directionToTarget.z * 0.8;
    }

    if (this.stateTimer >= 0.24) {
      this.attackCooldownRemaining = this.attackCooldown;
      this.setState('recover');
    }
  }

  fillRecoverInput(input, directionToTarget, distanceToTarget) {
    if (distanceToTarget < this.preferredDistance * 1.05) {
      input.moveX = -directionToTarget.x * 0.5;
      input.moveZ = -directionToTarget.z * 0.5;
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
