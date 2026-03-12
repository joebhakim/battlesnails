import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

function angleDifference(current, target) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function lerpAngle(current, target, alpha) {
  return current + angleDifference(current, target) * alpha;
}

export class SnailActor {
  constructor(config) {
    this.speed = config.speed;
    this.turnSpeed = config.turnSpeed;
    this.groundHeight = config.groundHeight ?? 1;
    this.arenaRadius = config.arenaRadius;

    this.health = config.health ?? 3;
    this.maxHealth = config.maxHealth ?? this.health;
    this.invincibilityDuration = config.invincibilityDuration ?? 0.45;
    this.invincibilityTime = 0;
    this.damageFlashDuration = config.damageFlashDuration ?? 0.2;
    this.damageFlashTime = 0;
    this.isDamaged = false;

    this.stalkNeutralPose = {
      yaw: config.stalkNeutralYaw ?? 0,
      pitch: config.stalkNeutralPitch ?? 0.08,
      extension: config.stalkNeutralExtension ?? 1
    };
    this.stalkPose = { ...this.stalkNeutralPose };
    this.stalkTargetPose = { ...this.stalkNeutralPose };
    this.stalkYawLimit = config.stalkYawLimit ?? 1.15;
    this.stalkPitchMin = config.stalkPitchMin ?? -0.7;
    this.stalkPitchMax = config.stalkPitchMax ?? 0.8;
    this.stalkExtensionMin = config.stalkExtensionMin ?? 0.72;
    this.stalkExtensionMax = config.stalkExtensionMax ?? 1.85;
    this.stalkResponse = config.stalkResponse ?? 12;
    this.stalkRecover = config.stalkRecover ?? 8;

    this.controlMode = 'idle';
    this.controlIntensity = 0;
    this.impactPower = 0;
    this.impactThreshold = config.impactThreshold ?? 5.4;
    this.impactMomentumFactor = config.impactMomentumFactor ?? 0.3;

    this.mesh = new THREE.Group();
    this.mesh.position.copy(config.position);

    this.body = this.createBody(config.bodyColor);
    this.shell = this.createShell(config.shellColor);
    this.eyeStalk = this.createEyeStalk();

    this.bodyCenter = new THREE.Object3D();
    this.bodyCenter.position.set(0, 0, 0);
    this.body.add(this.bodyCenter);
    this.bodyRadius = config.bodyRadius ?? 1.8;

    this.shellHealthyColor = new THREE.Color(config.shellColor);
    this.shellDamagedColor = new THREE.Color(config.shellDamagedColor);
    this.shellCriticalColor = new THREE.Color(config.shellCriticalColor);

    this.mesh.add(this.body);
    this.mesh.add(this.shell);
    this.mesh.add(this.eyeStalk);

    this.eyeTipPosition = new THREE.Vector3();
    this.bodyPosition = new THREE.Vector3();
    this.eyeTipVelocity = new THREE.Vector3();
    this.bodyVelocity = new THREE.Vector3();
    this.syncMotionState();
  }

  createBody(bodyColor) {
    const material = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.7,
      metalness: 0.1
    });

    this.originalBodyColor = material.color.clone();
    this.damageColor = new THREE.Color(0xff4d4d);
    this.invincibilityColor = new THREE.Color(0xffd166);

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1, 2, 4, 8), material);
    body.rotation.x = Math.PI / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    return body;
  }

  createShell(shellColor) {
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: shellColor,
        roughness: 0.8,
        metalness: 0.15
      })
    );

    shell.position.set(0, 0.5, -0.8);
    shell.castShadow = true;
    shell.receiveShadow = true;
    return shell;
  }

  createEyeStalk() {
    const stalkGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1.5, 8);
    stalkGeometry.translate(0, 0.75, 0);

    const stalk = new THREE.Mesh(
      stalkGeometry,
      new THREE.MeshStandardMaterial({
        color: 0x98fb98,
        roughness: 0.7,
        metalness: 0.05
      })
    );
    stalk.position.set(0.4, 0.5, 1.5);
    stalk.castShadow = true;

    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.2,
        metalness: 0.05
      })
    );
    eye.position.set(0, 1.5, 0);

    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x000000 })
    );
    pupil.position.set(0, 0, 0.15);

    this.eyeStalkTip = new THREE.Object3D();
    this.eyeStalkTip.position.set(0, 0.15, 0);

    eye.add(pupil);
    eye.add(this.eyeStalkTip);
    stalk.add(eye);

    return stalk;
  }

  updateShared(delta) {
    this.updateStalkPose(delta);
    this.updateDamageState(delta);
    this.updateShellColor();
    this.updateMotionState(delta);
  }

  updateStalkPose(delta) {
    const response = this.controlMode === 'idle' ? this.stalkRecover : this.stalkResponse;
    const alpha = Math.min(1, response * delta);

    this.stalkPose.yaw = THREE.MathUtils.lerp(this.stalkPose.yaw, this.stalkTargetPose.yaw, alpha);
    this.stalkPose.pitch = THREE.MathUtils.lerp(this.stalkPose.pitch, this.stalkTargetPose.pitch, alpha);
    this.stalkPose.extension = THREE.MathUtils.lerp(
      this.stalkPose.extension,
      this.stalkTargetPose.extension,
      alpha
    );

    this.eyeStalk.rotation.x = this.stalkPose.pitch;
    this.eyeStalk.rotation.y = this.stalkPose.yaw;
    this.eyeStalk.scale.y = this.stalkPose.extension;
  }

  updateDamageState(delta) {
    if (this.invincibilityTime > 0) {
      this.invincibilityTime = Math.max(0, this.invincibilityTime - delta);
      const pulse = (Math.sin((this.invincibilityDuration - this.invincibilityTime) * 16) + 1) / 2;
      this.body.material.color.copy(this.originalBodyColor).lerp(this.invincibilityColor, pulse * 0.8);
    }

    if (this.isDamaged) {
      this.damageFlashTime += delta;
      if (this.damageFlashTime >= this.damageFlashDuration) {
        this.isDamaged = false;
        this.damageFlashTime = 0;

        if (!this.isInvincible()) {
          this.body.material.color.copy(this.originalBodyColor);
        }
      }
    }

    if (!this.isDamaged && !this.isInvincible()) {
      this.body.material.color.copy(this.originalBodyColor);
    }
  }

  updateShellColor() {
    if (this.health === this.maxHealth) {
      this.shell.material.color.copy(this.shellHealthyColor);
    } else if (this.health > 1) {
      this.shell.material.color.copy(this.shellDamagedColor);
    } else {
      this.shell.material.color.copy(this.shellCriticalColor);
    }
  }

  moveAlong(direction, speed, delta) {
    const planarDirection = direction.clone().setY(0);
    if (planarDirection.lengthSq() === 0) {
      return;
    }

    planarDirection.normalize();
    this.mesh.position.addScaledVector(planarDirection, speed * delta);
    this.clampToArena();
  }

  setStalkTargetPose(pose, mode = this.controlMode, intensity = this.controlIntensity) {
    this.stalkTargetPose.yaw = THREE.MathUtils.clamp(
      pose.yaw ?? this.stalkTargetPose.yaw,
      -this.stalkYawLimit,
      this.stalkYawLimit
    );
    this.stalkTargetPose.pitch = THREE.MathUtils.clamp(
      pose.pitch ?? this.stalkTargetPose.pitch,
      this.stalkPitchMin,
      this.stalkPitchMax
    );
    this.stalkTargetPose.extension = THREE.MathUtils.clamp(
      pose.extension ?? this.stalkTargetPose.extension,
      this.stalkExtensionMin,
      this.stalkExtensionMax
    );
    this.controlMode = mode;
    this.controlIntensity = intensity;
  }

  adjustStalkTargetPose(pose, mode = this.controlMode, intensity = this.controlIntensity) {
    this.setStalkTargetPose({
      yaw: this.stalkTargetPose.yaw + (pose.yaw ?? 0),
      pitch: this.stalkTargetPose.pitch + (pose.pitch ?? 0),
      extension: this.stalkTargetPose.extension + (pose.extension ?? 0)
    }, mode, intensity);
  }

  relaxStalk(mode = 'idle') {
    this.setStalkTargetPose(this.stalkNeutralPose, mode, 0);
  }

  faceDirection(direction, delta, turnSpeed = this.turnSpeed) {
    const planarDirection = direction.clone().setY(0);
    if (planarDirection.lengthSq() === 0) {
      return;
    }

    planarDirection.normalize();
    const desiredRotation = Math.atan2(planarDirection.x, planarDirection.z);
    const turnAlpha = Math.min(1, turnSpeed * delta);
    this.mesh.rotation.y = lerpAngle(this.mesh.rotation.y, desiredRotation, turnAlpha);
  }

  clampToArena() {
    this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -this.arenaRadius, this.arenaRadius);
    this.mesh.position.z = THREE.MathUtils.clamp(this.mesh.position.z, -this.arenaRadius, this.arenaRadius);
    this.mesh.position.y = this.groundHeight;
  }

  takeDamage(amount = 1) {
    if (this.isInvincible() || this.health <= 0) {
      return false;
    }

    this.health = Math.max(0, this.health - amount);
    this.invincibilityTime = this.invincibilityDuration;
    this.isDamaged = true;
    this.damageFlashTime = 0;
    this.body.material.color.copy(this.damageColor);
    return true;
  }

  isInvincible() {
    return this.invincibilityTime > 0;
  }

  getEyeStalkPosition() {
    this.mesh.updateMatrixWorld(true);
    const position = new THREE.Vector3();
    this.eyeStalkTip.getWorldPosition(position);
    return position;
  }

  getBodyPosition() {
    this.mesh.updateMatrixWorld(true);
    const position = new THREE.Vector3();
    this.bodyCenter.getWorldPosition(position);
    return position;
  }

  getBodyRadius() {
    return this.bodyRadius;
  }

  getEyeStalkVelocity() {
    return this.eyeTipVelocity.clone();
  }

  getBodyVelocity() {
    return this.bodyVelocity.clone();
  }

  getImpactThreshold() {
    return this.impactThreshold;
  }

  getImpactMomentumFactor() {
    return this.impactMomentumFactor;
  }

  getImpactPower() {
    return this.impactPower;
  }

  setImpactPower(value) {
    this.impactPower = value;
  }

  getCombatMode() {
    return this.controlMode;
  }

  getControlIntensity() {
    return this.controlIntensity;
  }

  getTipSpeed() {
    return this.eyeTipVelocity.length();
  }

  getFacingVector() {
    return new THREE.Vector3(
      Math.sin(this.mesh.rotation.y),
      0,
      Math.cos(this.mesh.rotation.y)
    );
  }

  syncMotionState() {
    this.refreshPositionCache();
    this.bodyVelocity.set(0, 0, 0);
    this.eyeTipVelocity.set(0, 0, 0);
  }

  refreshPositionCache() {
    this.mesh.updateMatrixWorld(true);
    this.bodyCenter.getWorldPosition(this.bodyPosition);
    this.eyeStalkTip.getWorldPosition(this.eyeTipPosition);
  }

  updateMotionState(delta) {
    this.mesh.updateMatrixWorld(true);

    const nextBodyPosition = new THREE.Vector3();
    const nextEyeTipPosition = new THREE.Vector3();
    this.bodyCenter.getWorldPosition(nextBodyPosition);
    this.eyeStalkTip.getWorldPosition(nextEyeTipPosition);

    if (delta > 0) {
      this.bodyVelocity.copy(nextBodyPosition).sub(this.bodyPosition).divideScalar(delta);
      this.eyeTipVelocity.copy(nextEyeTipPosition).sub(this.eyeTipPosition).divideScalar(delta);
    } else {
      this.bodyVelocity.set(0, 0, 0);
      this.eyeTipVelocity.set(0, 0, 0);
    }

    this.bodyPosition.copy(nextBodyPosition);
    this.eyeTipPosition.copy(nextEyeTipPosition);
  }
}
