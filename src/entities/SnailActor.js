import * as THREE from 'three';

import {
  STALK_ACTIVE_PULL,
  STALK_CONSTRAINT_ITERATIONS,
  STALK_DAMPING,
  STALK_GRAVITY,
  STALK_IDLE_PULL,
  STALK_SEGMENT_COUNT,
  STALK_SEGMENT_RADIUS,
  STALK_TOTAL_LENGTH,
  buildStalkSegmentSamples,
  copyNodesInto,
  createInitialStalkNodes,
  deserializeNodes,
  getStalkGoalWorldPosition,
  getStalkRootWorldPosition,
  simulateStalkRope
} from '../sim/StalkRope.js';

const LOCAL_UP = new THREE.Vector3(0, 1, 0);
const LOCAL_FORWARD = new THREE.Vector3(0, 0, 1);

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

    this.health = config.health ?? config.maxHealth ?? 40;
    this.maxHealth = config.maxHealth ?? this.health;
    this.invincibilityDuration = config.invincibilityDuration ?? 0.45;
    this.invincibilityTime = 0;
    this.damageFlashDuration = config.damageFlashDuration ?? 0.2;
    this.damageFlashTime = 0;
    this.isDamaged = false;

    this.stalkNeutralPose = {
      yaw: config.stalkNeutralYaw ?? 0,
      pitch: config.stalkNeutralPitch ?? 0.08
    };
    this.stalkPose = { ...this.stalkNeutralPose };
    this.stalkTargetPose = { ...this.stalkNeutralPose };
    this.stalkYawLimit = config.stalkYawLimit ?? 1.15;
    this.stalkPitchMin = config.stalkPitchMin ?? -0.7;
    this.stalkPitchMax = config.stalkPitchMax ?? 0.8;
    this.stalkResponse = config.stalkResponse ?? 12;
    this.stalkRecover = config.stalkRecover ?? 8;
    this.stalkSegmentCount = config.stalkSegmentCount ?? STALK_SEGMENT_COUNT;
    this.stalkLength = config.stalkLength ?? STALK_TOTAL_LENGTH;
    this.stalkSegmentLength = this.stalkLength / this.stalkSegmentCount;
    this.stalkSegmentRadius = config.stalkSegmentRadius ?? STALK_SEGMENT_RADIUS;
    this.stalkGravity = config.stalkGravity ?? STALK_GRAVITY;
    this.stalkDamping = config.stalkDamping ?? STALK_DAMPING;
    this.stalkConstraintIterations = config.stalkConstraintIterations ?? STALK_CONSTRAINT_ITERATIONS;
    this.stalkDrivePull = config.stalkDrivePull ?? STALK_ACTIVE_PULL;
    this.stalkIdlePull = config.stalkIdlePull ?? STALK_IDLE_PULL;

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

    this.stalkNodes = [];
    this.previousStalkNodes = [];
    this.eyeTipPosition = new THREE.Vector3();
    this.bodyPosition = new THREE.Vector3();
    this.eyeTipVelocity = new THREE.Vector3();
    this.bodyVelocity = new THREE.Vector3();
    this.lastMotionDelta = 1 / 60;

    this.initializeLocalStalkState();
    this.renderStalk();
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
    const stalk = new THREE.Group();
    const stalkMaterial = new THREE.MeshStandardMaterial({
      color: 0x98fb98,
      roughness: 0.7,
      metalness: 0.05
    });
    const segmentGeometry = new THREE.CylinderGeometry(
      this.stalkSegmentRadius,
      this.stalkSegmentRadius,
      1,
      6
    );
    segmentGeometry.translate(0, 0.5, 0);

    this.stalkSegments = [];
    for (let index = 0; index < this.stalkSegmentCount; index += 1) {
      const segment = new THREE.Mesh(segmentGeometry, stalkMaterial);
      segment.castShadow = true;
      segment.receiveShadow = true;
      this.stalkSegments.push(segment);
      stalk.add(segment);
    }

    this.eye = new THREE.Mesh(
      new THREE.SphereGeometry(this.stalkSegmentRadius * 1.35, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.2,
        metalness: 0.05
      })
    );

    this.pupil = new THREE.Mesh(
      new THREE.SphereGeometry(this.stalkSegmentRadius * 0.55, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x000000 })
    );
    this.pupil.position.set(0, 0, this.stalkSegmentRadius * 0.9);

    this.eyeStalkTip = new THREE.Object3D();
    this.eyeStalkTip.position.set(0, 0, this.stalkSegmentRadius * 1.2);

    this.eye.add(this.pupil);
    this.eye.add(this.eyeStalkTip);
    stalk.add(this.eye);

    return stalk;
  }

  initializeLocalStalkState() {
    const rootWorld = getStalkRootWorldPosition(this.mesh.position, this.mesh.rotation.y);
    const goalWorld = getStalkGoalWorldPosition(
      this.mesh.position,
      this.mesh.rotation.y,
      this.stalkPose.yaw,
      this.stalkPose.pitch,
      this.stalkLength
    );
    const nodes = createInitialStalkNodes(rootWorld, goalWorld, this.stalkSegmentCount);
    copyNodesInto(this.stalkNodes, nodes);
    copyNodesInto(this.previousStalkNodes, nodes);
  }

  updateShared(delta) {
    this.updateStalkControlPose(delta);
    this.simulateLocalStalk(delta);
    this.renderStalk();
    this.updateDamageState(delta);
    this.updateShellColor();
    this.updateMotionState(delta);
  }

  updateStalkControlPose(delta) {
    const response = this.controlMode === 'idle' ? this.stalkRecover : this.stalkResponse;
    const alpha = Math.min(1, response * delta);

    this.stalkPose.yaw = THREE.MathUtils.lerp(this.stalkPose.yaw, this.stalkTargetPose.yaw, alpha);
    this.stalkPose.pitch = THREE.MathUtils.lerp(this.stalkPose.pitch, this.stalkTargetPose.pitch, alpha);
  }

  simulateLocalStalk(delta) {
    const rootWorld = getStalkRootWorldPosition(this.mesh.position, this.mesh.rotation.y);
    const goalWorld = getStalkGoalWorldPosition(
      this.mesh.position,
      this.mesh.rotation.y,
      this.stalkPose.yaw,
      this.stalkPose.pitch,
      this.stalkLength
    );

    simulateStalkRope({
      nodes: this.stalkNodes,
      previousNodes: this.previousStalkNodes,
      rootWorld,
      goalWorld,
      delta,
      segmentLength: this.stalkSegmentLength,
      gravity: this.stalkGravity,
      damping: this.stalkDamping,
      goalPull: this.controlMode === 'idle' ? this.stalkIdlePull : this.stalkDrivePull,
      constraintIterations: this.stalkConstraintIterations
    });
  }

  renderStalk() {
    this.mesh.updateMatrixWorld(true);
    const inverseWorld = this.mesh.matrixWorld.clone().invert();

    for (let index = 0; index < this.stalkSegments.length; index += 1) {
      const segment = this.stalkSegments[index];
      const startLocal = this.stalkNodes[index]?.clone().applyMatrix4(inverseWorld);
      const endLocal = this.stalkNodes[index + 1]?.clone().applyMatrix4(inverseWorld);

      if (!startLocal || !endLocal) {
        segment.visible = false;
        continue;
      }

      const direction = endLocal.clone().sub(startLocal);
      const length = direction.length();
      segment.visible = length > 0;

      if (length === 0) {
        continue;
      }

      segment.position.copy(startLocal);
      segment.quaternion.setFromUnitVectors(LOCAL_UP, direction.normalize());
      segment.scale.set(1, length, 1);
    }

    const tipNode = this.stalkNodes[this.stalkNodes.length - 1];
    const previousNode = this.stalkNodes[this.stalkNodes.length - 2] ?? tipNode;
    if (!tipNode || !previousNode) {
      return;
    }

    const tipLocal = tipNode.clone().applyMatrix4(inverseWorld);
    const previousLocal = previousNode.clone().applyMatrix4(inverseWorld);
    const eyeForward = tipLocal.clone().sub(previousLocal);
    if (eyeForward.lengthSq() === 0) {
      eyeForward.copy(LOCAL_FORWARD);
    } else {
      eyeForward.normalize();
    }

    this.eye.position.copy(tipLocal);
    this.eye.quaternion.setFromUnitVectors(LOCAL_FORWARD, eyeForward);
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
    this.clampPlanarPosition();
  }

  clampPlanarPosition() {
    this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -this.arenaRadius, this.arenaRadius);
    this.mesh.position.z = THREE.MathUtils.clamp(this.mesh.position.z, -this.arenaRadius, this.arenaRadius);
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
    this.controlMode = mode;
    this.controlIntensity = intensity;
  }

  adjustStalkTargetPose(pose, mode = this.controlMode, intensity = this.controlIntensity) {
    this.setStalkTargetPose({
      yaw: this.stalkTargetPose.yaw + (pose.yaw ?? 0),
      pitch: this.stalkTargetPose.pitch + (pose.pitch ?? 0)
    }, mode, intensity);
  }

  relaxStalk(mode = 'idle') {
    this.setStalkTargetPose(this.stalkNeutralPose, mode, 0);
  }

  applyMatchState(state, delta = 0) {
    if (!state) {
      this.mesh.visible = false;
      return;
    }

    this.mesh.visible = state.connected !== false;
    if (!this.mesh.visible) {
      return;
    }

    this.health = state.health;
    this.maxHealth = state.maxHealth;
    this.impactPower = state.impactPower;
    this.controlMode = state.controlMode;
    this.controlIntensity = state.controlIntensity ?? 0;
    this.invincibilityTime = state.invincible ? this.invincibilityDuration * 0.5 : 0;
    this.stalkSegmentRadius = state.stalkSegmentRadius ?? this.stalkSegmentRadius;

    this.mesh.position.set(state.position.x, state.position.y, state.position.z);
    this.mesh.rotation.y = state.rotationY;

    this.stalkTargetPose.yaw = state.stalkYaw;
    this.stalkTargetPose.pitch = state.stalkPitch;
    this.stalkPose.yaw = state.stalkYaw;
    this.stalkPose.pitch = state.stalkPitch;

    const incomingNodes = deserializeNodes(state.stalkNodes ?? []);
    if (incomingNodes.length > 0) {
      if (!this.mesh.userData.hasAppliedMatchState) {
        copyNodesInto(this.stalkNodes, incomingNodes);
        copyNodesInto(this.previousStalkNodes, incomingNodes);
        this.mesh.userData.hasAppliedMatchState = true;
      } else {
        copyNodesInto(this.previousStalkNodes, this.stalkNodes);
        copyNodesInto(this.stalkNodes, incomingNodes);
      }
    }

    this.renderStalk();
    this.updateDamageState(delta);
    this.updateShellColor();
    this.updateMotionState(delta);
  }

  setVisible(visible) {
    this.mesh.visible = visible;
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
    this.clampPlanarPosition();
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

  getStalkNodes() {
    return this.stalkNodes.map((node) => node.clone());
  }

  getStalkSegmentRadius() {
    return this.stalkSegmentRadius;
  }

  getStalkSegmentSamples() {
    return buildStalkSegmentSamples(
      this.stalkNodes,
      this.previousStalkNodes,
      this.lastMotionDelta,
      this.stalkSegmentRadius
    );
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
    copyNodesInto(this.previousStalkNodes, this.stalkNodes);
    this.bodyVelocity.set(0, 0, 0);
    this.eyeTipVelocity.set(0, 0, 0);
    this.lastMotionDelta = 1 / 60;
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
      this.lastMotionDelta = delta;
    } else {
      this.bodyVelocity.set(0, 0, 0);
      this.eyeTipVelocity.set(0, 0, 0);
    }

    this.bodyPosition.copy(nextBodyPosition);
    this.eyeTipPosition.copy(nextEyeTipPosition);
  }
}
