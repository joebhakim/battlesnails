import * as THREE from 'three';

import { SnailActor } from './SnailActor.js';
import {
  DEFAULT_TUNING_CONFIG,
  createBotControllerConfig,
  createSimulationProfiles
} from '../sim/Tuning.js';

const DEFAULT_BOT_PROFILE = createSimulationProfiles(DEFAULT_TUNING_CONFIG).bot;
const DEFAULT_BOT_CONTROLLER_CONFIG = createBotControllerConfig(DEFAULT_TUNING_CONFIG);

export class NPCSnail extends SnailActor {
  constructor(overrides = {}) {
    super({
      position: new THREE.Vector3(0, 1, -6),
      speed: DEFAULT_BOT_PROFILE.freeMoveSpeed,
      turnSpeed: DEFAULT_BOT_PROFILE.turnSpeed,
      arenaRadius: DEFAULT_BOT_PROFILE.arenaRadius,
      bodyRadius: DEFAULT_BOT_PROFILE.bodyRadius,
      maxHealth: DEFAULT_BOT_PROFILE.maxHealth,
      bodyColor: 0xff6347,
      shellColor: 0xa0522d,
      shellDamagedColor: 0xae6a3a,
      shellCriticalColor: 0xba4f2a,
      stalkNeutralYaw: DEFAULT_BOT_PROFILE.stalkNeutralYaw,
      stalkNeutralPitch: DEFAULT_BOT_PROFILE.stalkNeutralPitch,
      stalkYawLimit: DEFAULT_BOT_PROFILE.stalkYawLimit,
      stalkPitchMin: DEFAULT_BOT_PROFILE.stalkPitchMin,
      stalkPitchMax: DEFAULT_BOT_PROFILE.stalkPitchMax,
      stalkSegmentCount: DEFAULT_BOT_PROFILE.stalkSegmentCount,
      stalkLength: DEFAULT_BOT_PROFILE.stalkTotalLength,
      stalkSegmentRadius: DEFAULT_BOT_PROFILE.stalkSegmentRadius,
      stalkGravity: DEFAULT_BOT_PROFILE.stalkGravity,
      stalkDamping: DEFAULT_BOT_PROFILE.stalkDamping,
      stalkConstraintIterations: DEFAULT_BOT_PROFILE.stalkConstraintIterations,
      stalkDrivePull: DEFAULT_BOT_PROFILE.stalkDrivePull,
      stalkIdlePull: DEFAULT_BOT_PROFILE.stalkIdlePull,
      impactThreshold: DEFAULT_BOT_PROFILE.impactThreshold,
      impactMomentumFactor: DEFAULT_BOT_PROFILE.impactMomentumFactor,
      deathBurstEnabled: true,
      ...overrides
    });

    this.attackRange = DEFAULT_BOT_CONTROLLER_CONFIG.attackRange;
    this.preferredDistance = DEFAULT_BOT_CONTROLLER_CONFIG.preferredDistance;
    this.attackCooldown = DEFAULT_BOT_CONTROLLER_CONFIG.attackCooldown;
    this.attackCooldownRemaining = 0.5;
    this.windupDuration = DEFAULT_BOT_CONTROLLER_CONFIG.windupDuration;
    this.strikeDuration = DEFAULT_BOT_CONTROLLER_CONFIG.strikeDuration;
    this.recoverDuration = DEFAULT_BOT_CONTROLLER_CONFIG.recoverDuration;
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
