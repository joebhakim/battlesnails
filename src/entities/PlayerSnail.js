import * as THREE from 'three';

import { SnailActor } from './SnailActor.js';

export class PlayerSnail extends SnailActor {
  constructor() {
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
      stalkPitchMin: -0.75,
      stalkPitchMax: 0.85,
      stalkExtensionMin: 0.72,
      stalkExtensionMax: 1.95,
      stalkResponse: 15,
      stalkRecover: 9,
      impactThreshold: 5.8,
      impactMomentumFactor: 0.35
    });

    this.sweepYawSensitivity = 0.0125;
    this.sweepPitchSensitivity = 0.0095;
    this.sweepExtensionSensitivity = 0.0038;
    this.thrustYawSensitivity = 0.0065;
    this.thrustPitchSensitivity = 0.006;
    this.thrustExtensionSensitivity = 0.014;
  }

  move(direction, delta) {
    if (direction.lengthSq() === 0) {
      return;
    }

    this.moveAlong(direction, this.speed, delta);
    this.faceDirection(direction, delta);
  }

  update(delta, combatInput) {
    this.applyCombatInput(combatInput);
    this.updateShared(delta);
  }

  applyCombatInput(combatInput) {
    if (!combatInput?.engaged) {
      this.relaxStalk('idle');
      return;
    }

    const movementAmount = Math.hypot(combatInput.lookX, combatInput.lookY);
    const intensity = Math.min(1, movementAmount / 18);

    if (combatInput.mode === 'thrust') {
      const extensionDelta = Math.max(0, -combatInput.lookY) * this.thrustExtensionSensitivity;
      this.adjustStalkTargetPose({
        yaw: combatInput.lookX * this.thrustYawSensitivity,
        pitch: -combatInput.lookY * this.thrustPitchSensitivity,
        extension: extensionDelta - Math.max(0, combatInput.lookY) * 0.007
      }, 'thrust', intensity);
      return;
    }

    this.adjustStalkTargetPose({
      yaw: combatInput.lookX * this.sweepYawSensitivity,
      pitch: -combatInput.lookY * this.sweepPitchSensitivity,
      extension: (
        Math.abs(combatInput.lookX) + Math.max(0, -combatInput.lookY) * 0.7
      ) * this.sweepExtensionSensitivity - Math.max(0, combatInput.lookY) * 0.004
    }, 'swing', intensity);
  }
}
