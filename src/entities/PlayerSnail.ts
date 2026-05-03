import * as THREE from 'three';

import { SnailActor } from './SnailActor.js';
import { DEFAULT_TUNING_CONFIG } from '../sim/Tuning.js';

export class PlayerSnail extends SnailActor {
  declare controlIntensity: any;
  declare controlMode: any;
  declare freeMoveSpeed: any;
  declare gravity: any;
  declare isGrounded: any;
  declare jumpVelocity: any;
  declare lockedMoveSpeed: any;
  declare mesh: any;
  declare speed: any;
  declare stalkPitchSensitivity: any;
  declare stalkYawSensitivity: any;
  declare verticalDamping: any;
  declare verticalVelocity: any;
  constructor(overrides: any = {}) {
    super({
      position: new THREE.Vector3(0, 1, 6),
      speed: DEFAULT_TUNING_CONFIG.freeMoveSpeed,
      turnSpeed: DEFAULT_TUNING_CONFIG.turnSpeed,
      groundHeight: DEFAULT_TUNING_CONFIG.aboveGroundHeight,
      spawnDropHeight: DEFAULT_TUNING_CONFIG.spawnDropHeight,
      arenaRadius: 22,
      bodyRadius: DEFAULT_TUNING_CONFIG.bodyRadius,
      maxHealth: DEFAULT_TUNING_CONFIG.playerMaxHealth,
      bodyColor: 0x1e90ff,
      shellColor: 0x8b4513,
      shellDamagedColor: 0x9d5c22,
      shellCriticalColor: 0xa63a1f,
      stalkNeutralYaw: DEFAULT_TUNING_CONFIG.stalkNeutralYaw,
      stalkNeutralPitch: DEFAULT_TUNING_CONFIG.stalkNeutralPitch,
      stalkYawLimit: DEFAULT_TUNING_CONFIG.stalkYawLimit,
      stalkPitchMin: DEFAULT_TUNING_CONFIG.stalkPitchMin,
      stalkPitchMax: DEFAULT_TUNING_CONFIG.stalkPitchMax,
      stalkSegmentCount: DEFAULT_TUNING_CONFIG.stalkSegmentCount,
      stalkLength: DEFAULT_TUNING_CONFIG.stalkTotalLength,
      stalkSegmentRadius: DEFAULT_TUNING_CONFIG.stalkSegmentRadius,
      stalkGravity: DEFAULT_TUNING_CONFIG.stalkGravity,
      stalkDamping: DEFAULT_TUNING_CONFIG.stalkDamping,
      stalkConstraintIterations: DEFAULT_TUNING_CONFIG.stalkConstraintIterations,
      stalkDrivePull: DEFAULT_TUNING_CONFIG.stalkDrivePull,
      stalkIdlePull: DEFAULT_TUNING_CONFIG.stalkIdlePull,
      impactThreshold: DEFAULT_TUNING_CONFIG.impactThreshold,
      impactMomentumFactor: DEFAULT_TUNING_CONFIG.impactMomentumFactor,
      ...overrides
    });

    this.lockedMoveSpeed = DEFAULT_TUNING_CONFIG.lockedMoveSpeed;
    this.freeMoveSpeed = DEFAULT_TUNING_CONFIG.freeMoveSpeed;
    this.speed = this.freeMoveSpeed;

    this.stalkYawSensitivity = DEFAULT_TUNING_CONFIG.stalkYawSensitivity;
    this.stalkPitchSensitivity = DEFAULT_TUNING_CONFIG.stalkPitchSensitivity;

    this.jumpVelocity = DEFAULT_TUNING_CONFIG.jumpVelocity;
    this.gravity = DEFAULT_TUNING_CONFIG.bodyGravity;
    this.verticalDamping = DEFAULT_TUNING_CONFIG.bodyVerticalDamping;
    this.verticalVelocity = 0;
    this.isGrounded = this.mesh.position.y <= this.getGroundHeight();
  }

  move(direction, delta, facingDirection = direction) {
    if (direction.lengthSq() > 0) {
      this.moveAlong(direction, this.speed, delta);
    }

    if (facingDirection.lengthSq() > 0) {
      this.faceDirection(facingDirection, delta);
    }
  }

  update(delta, combatInput) {
    this.applyCombatInput(combatInput);
    this.updateJump(delta);
    this.updateShared(delta);
  }

  applyCombatInput(combatInput) {
    if (!combatInput?.engaged) {
      this.setStalkHeld('both', false);
      this.controlMode = 'idle';
      this.controlIntensity = 0;
      return;
    }

    const movementAmount = Math.hypot(combatInput.lookX, combatInput.lookY);
    const intensity = Math.min(1, movementAmount / 18);
    this.controlMode = combatInput.leftHeld && combatInput.rightHeld
      ? 'both'
      : combatInput.leftHeld
        ? 'left'
        : combatInput.rightHeld
          ? 'right'
          : 'idle';
    this.controlIntensity = intensity;
    this.setStalkHeld('left', combatInput.leftHeld);
    this.setStalkHeld('right', combatInput.rightHeld);

    for (const side of ['left', 'right']) {
      if (!(side === 'left' ? combatInput.leftHeld : combatInput.rightHeld)) {
        continue;
      }

      this.adjustStalkTargetPose({
        yaw: -combatInput.lookX * this.stalkYawSensitivity,
        pitch: -combatInput.lookY * this.stalkPitchSensitivity
      }, this.controlMode, intensity, side, true);
    }
  }

  setLockOnEnabled(isLockedOn) {
    this.speed = isLockedOn ? this.lockedMoveSpeed : this.freeMoveSpeed;
  }

  jump() {
    if (!this.isGrounded) {
      return false;
    }

    this.isGrounded = false;
    this.verticalVelocity = this.jumpVelocity;
    return true;
  }

  updateJump(delta) {
    const groundHeight = this.getGroundHeight();

    if (this.isGrounded) {
      this.mesh.position.y = groundHeight;
      return;
    }

    this.verticalVelocity -= this.gravity * delta;
    this.verticalVelocity *= Math.exp(-Math.max(0, this.verticalDamping) * delta);
    this.mesh.position.y += this.verticalVelocity * delta;

    if (this.mesh.position.y <= groundHeight) {
      this.mesh.position.y = groundHeight;
      this.verticalVelocity = 0;
      this.isGrounded = true;
    }
  }
}
