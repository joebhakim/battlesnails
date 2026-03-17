import * as THREE from 'three';

import { SnailActor } from './SnailActor.js';
import { DEFAULT_JUMP_VELOCITY } from '../sim/MatchSimulation.js';

export class PlayerSnail extends SnailActor {
  constructor(overrides = {}) {
    super({
      position: new THREE.Vector3(0, 1, 6),
      speed: 7.5,
      turnSpeed: 12,
      arenaRadius: 22,
      bodyColor: 0x1e90ff,
      shellColor: 0x8b4513,
      shellDamagedColor: 0x9d5c22,
      shellCriticalColor: 0xa63a1f,
      stalkNeutralPitch: 0.08,
      stalkYawLimit: 1.3,
      stalkPitchMin: -1.2,
      stalkPitchMax: 1.15,
      stalkResponse: 15,
      stalkRecover: 9,
      impactThreshold: 5.4,
      impactMomentumFactor: 0.35,
      ...overrides
    });

    this.lockedMoveSpeed = 7.5;
    this.freeMoveSpeed = 10;
    this.speed = this.freeMoveSpeed;

    this.stalkYawSensitivity = 0.011;
    this.stalkPitchSensitivity = 0.014;

    this.jumpVelocity = DEFAULT_JUMP_VELOCITY;
    this.gravity = 24;
    this.verticalVelocity = 0;
    this.isGrounded = true;
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
    this.mesh.position.y += this.verticalVelocity * delta;

    if (this.mesh.position.y <= groundHeight) {
      this.mesh.position.y = groundHeight;
      this.verticalVelocity = 0;
      this.isGrounded = true;
    }
  }
}
