import * as THREE from 'three';

import { SnailActor } from './SnailActor.js';

export class NPCSnail extends SnailActor {
  constructor(overrides = {}) {
    super({
      position: new THREE.Vector3(0, 1, -6),
      speed: 4.2,
      turnSpeed: 8,
      arenaRadius: 18,
      bodyColor: 0xff6347,
      shellColor: 0xa0522d,
      shellDamagedColor: 0xae6a3a,
      shellCriticalColor: 0xba4f2a,
      stalkNeutralPitch: 0.12,
      stalkYawLimit: 1.05,
      stalkPitchMin: -0.55,
      stalkPitchMax: 0.7,
      stalkResponse: 11,
      stalkRecover: 7,
      impactThreshold: 5.1,
      impactMomentumFactor: 0.28,
      deathBurstEnabled: true,
      ...overrides
    });

    this.attackRange = 6.1;
    this.preferredDistance = 5.2;
    this.attackCooldown = 0.9;
    this.attackCooldownRemaining = 0.5;
    this.windupDuration = 0.4;
    this.strikeDuration = 0.28;
    this.recoverDuration = 0.4;
    this.state = 'approach';
    this.stateTimer = 0;
    this.attackSide = 1;
    this.strafeDirection = 1;
  }

  update(delta, playerPosition) {
    if (this.health <= 0) {
      return;
    }

    this.attackCooldownRemaining = Math.max(0, this.attackCooldownRemaining - delta);
    this.stateTimer += delta;

    const toPlayer = playerPosition.clone().sub(this.mesh.position).setY(0);
    const distanceToPlayer = toPlayer.length();
    const directionToPlayer = distanceToPlayer === 0
      ? this.getFacingVector()
      : toPlayer.normalize();

    this.faceDirection(directionToPlayer, delta);

    switch (this.state) {
      case 'approach':
        this.updateApproach(delta, directionToPlayer, distanceToPlayer);
        break;
      case 'windup':
        this.updateWindup(distanceToPlayer);
        break;
      case 'strike':
        this.updateStrikeState(delta, directionToPlayer, distanceToPlayer);
        break;
      case 'recover':
        this.updateRecover(delta, directionToPlayer, distanceToPlayer);
        break;
    }

    this.updateShared(delta);
    this.clampToArena();
  }

  updateApproach(delta, directionToPlayer, distanceToPlayer) {
    const strafeDirection = new THREE.Vector3(-directionToPlayer.z, 0, directionToPlayer.x)
      .multiplyScalar(this.strafeDirection);

    if (distanceToPlayer > this.preferredDistance) {
      this.moveAlong(directionToPlayer, this.speed, delta);
    } else if (distanceToPlayer < this.preferredDistance * 0.7) {
      this.moveAlong(directionToPlayer, -this.speed * 0.5, delta);
    } else {
      this.moveAlong(strafeDirection, this.speed * 0.4, delta);
    }

    this.setStalkTargetPose({ yaw: 0, pitch: 0.12 }, 'tracking', 0.25);

    if (distanceToPlayer <= this.attackRange && this.attackCooldownRemaining === 0) {
      this.attackSide = Math.random() > 0.5 ? 1 : -1;
      this.strafeDirection = -this.attackSide;
      this.setState('windup');
    }
  }

  updateWindup(distanceToPlayer) {
    this.setStalkTargetPose({
      yaw: this.attackSide * 0.92,
      pitch: 0.4
    }, 'windup', 0.7);

    if (distanceToPlayer > this.attackRange * 1.25) {
      this.setState('approach');
      return;
    }

    if (this.stateTimer >= this.windupDuration) {
      this.setState('strike');
    }
  }

  updateStrikeState(delta, directionToPlayer, distanceToPlayer) {
    this.setStalkTargetPose({
      yaw: -this.attackSide * 0.48,
      pitch: -0.08
    }, 'strike', 1);

    if (distanceToPlayer <= this.attackRange * 1.1) {
      this.moveAlong(directionToPlayer, this.speed * 0.7, delta);
    }

    if (this.stateTimer >= this.strikeDuration) {
      this.attackCooldownRemaining = this.attackCooldown;
      this.setState('recover');
    }
  }

  updateRecover(delta, directionToPlayer, distanceToPlayer) {
    this.setStalkTargetPose({ yaw: 0, pitch: 0.1 }, 'recover', 0.2);

    if (distanceToPlayer < this.preferredDistance * 1.05) {
      this.moveAlong(directionToPlayer, -this.speed * 0.45, delta);
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
