import * as THREE from 'three';

import {
  STALK_ACTIVE_PULL,
  STALK_CONSTRAINT_ITERATIONS,
  STALK_DAMPING,
  STALK_GRAVITY,
  STALK_ROOT_OFFSETS,
  STALK_SEGMENT_COUNT,
  STALK_SEGMENT_RADIUS,
  STALK_TOTAL_LENGTH,
  buildStalkSegmentSamples,
  copyNodesInto,
  createInitialStalkNodes,
  deserializeNodes,
  getBodyLocalDirection,
  getLocalStalkDirection,
  getStalkGoalWorldPosition,
  getStalkRootWorldPosition,
  simulateStalkRope
} from '../sim/StalkRope.js';
import { DEFAULT_TERRAIN_CONFIG, normalizeTerrainConfig } from '../world/Terrain.js';
import { getTerrainBodyGroundHeight } from '../world/TerrainClearance.js';

const LOCAL_UP = new THREE.Vector3(0, 1, 0);
const LOCAL_FORWARD = new THREE.Vector3(0, 0, 1);
const STALK_SIDE_KEYS = ['left', 'right'];
const DEATH_BURST_DURATION = 5;
const DEATH_BURST_SWELL_TIME = 0.2;
const DEATH_BURST_MAX_SCALE = 2.4;
const DEATH_BURST_GRAVITY = 12;
const STALK_VISUAL_SPEED_REFERENCE = 14;

function angleDifference(current, target) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function lerpAngle(current, target, alpha) {
  return current + angleDifference(current, target) * alpha;
}

function getControlModeForHeldState(leftHeld, rightHeld) {
  if (leftHeld && rightHeld) {
    return 'both';
  }

  if (leftHeld) {
    return 'left';
  }

  if (rightHeld) {
    return 'right';
  }

  return 'idle';
}

export class SnailActor {
  constructor(config) {
    this.speed = config.speed;
    this.turnSpeed = config.turnSpeed;
    this.groundHeight = config.groundHeight ?? 1;
    this.spawnDropHeight = Math.max(0, config.spawnDropHeight ?? 0);
    this.arenaRadius = config.arenaRadius;
    this.terrainConfig = normalizeTerrainConfig(config.terrainConfig ?? DEFAULT_TERRAIN_CONFIG);

    this.health = config.health ?? config.maxHealth ?? 3;
    this.maxHealth = config.maxHealth ?? this.health;
    this.damageFlashDuration = config.damageFlashDuration ?? 0.2;
    this.damageFlashTime = 0;
    this.isDamaged = false;

    this.stalkNeutralPose = {
      yaw: config.stalkNeutralYaw ?? 0,
      pitch: config.stalkNeutralPitch ?? 0.08
    };
    this.stalkYawLimit = config.stalkYawLimit ?? 1.15;
    this.stalkPitchMin = config.stalkPitchMin ?? -0.7;
    this.stalkPitchMax = config.stalkPitchMax ?? 0.8;
    this.stalkSegmentCount = config.stalkSegmentCount ?? STALK_SEGMENT_COUNT;
    this.stalkLength = config.stalkLength ?? STALK_TOTAL_LENGTH;
    this.stalkSegmentLength = this.stalkLength / this.stalkSegmentCount;
    this.stalkSegmentRadius = config.stalkSegmentRadius ?? STALK_SEGMENT_RADIUS;
    this.stalkGravity = config.stalkGravity ?? STALK_GRAVITY;
    this.stalkDamping = config.stalkDamping ?? STALK_DAMPING;
    this.stalkConstraintIterations = config.stalkConstraintIterations ?? STALK_CONSTRAINT_ITERATIONS;
    this.stalkDrivePull = config.stalkDrivePull ?? STALK_ACTIVE_PULL;
    this.stalkIdlePull = config.stalkIdlePull ?? 0;

    this.controlMode = 'idle';
    this.controlIntensity = 0;
    this.impactPower = 0;
    this.impactThreshold = config.impactThreshold ?? 5.4;
    this.impactMomentumFactor = config.impactMomentumFactor ?? 0.3;
    this.deathBurstEnabled = config.deathBurstEnabled ?? false;
    this.deathBurstDuration = config.deathBurstDuration ?? DEATH_BURST_DURATION;
    this.deathBurstGravity = config.deathBurstGravity ?? DEATH_BURST_GRAVITY;
    this.hasReceivedMatchState = false;

    this.mesh = new THREE.Group();
    this.mesh.position.copy(config.position);
    this.mesh.position.y = this.getGroundHeightAt(this.mesh.position.x, this.mesh.position.z) + this.spawnDropHeight;

    this.body = this.createBody(config.bodyColor);
    this.shell = this.createShell(config.shellColor);
    this.bodyCenter = new THREE.Object3D();
    this.bodyCenter.position.set(0, 0, 0);
    this.body.add(this.bodyCenter);
    this.bodyRadius = config.bodyRadius ?? 1.8;

    this.shellHealthyColor = new THREE.Color(config.shellColor);
    this.shellDamagedColor = new THREE.Color(config.shellDamagedColor);
    this.shellCriticalColor = new THREE.Color(config.shellCriticalColor);

    this.tiltRoot = new THREE.Group();
    this.tiltRoot.add(this.body);
    this.tiltRoot.add(this.shell);
    this.mesh.add(this.tiltRoot);

    this.stalks = {
      left: this.createEyeStalk('left'),
      right: this.createEyeStalk('right')
    };
    this.mesh.add(this.stalks.left.group);
    this.mesh.add(this.stalks.right.group);

    this.eyeTipPosition = new THREE.Vector3();
    this.previousEyeTipPosition = new THREE.Vector3();
    this.bodyPosition = new THREE.Vector3();
    this.eyeTipVelocity = new THREE.Vector3();
    this.bodyVelocity = new THREE.Vector3();
    this.lastMotionDelta = 1 / 60;

    this.initializeLocalStalkState();
    this.renderStalks();
    this.initializeDeathBurstState();
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

  createEyeStalk(side) {
    const group = new THREE.Group();
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

    const segments = [];
    for (let index = 0; index < this.stalkSegmentCount; index += 1) {
      const segment = new THREE.Mesh(segmentGeometry, stalkMaterial);
      segment.castShadow = true;
      segment.receiveShadow = true;
      segments.push(segment);
      group.add(segment);
    }

    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(this.stalkSegmentRadius * 1.35, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.2,
        metalness: 0.05
      })
    );

    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(this.stalkSegmentRadius * 0.55, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x000000 })
    );
    pupil.position.set(0, 0, this.stalkSegmentRadius * 0.9);

    const tipAnchor = new THREE.Object3D();
    tipAnchor.position.set(0, 0, this.stalkSegmentRadius * 1.2);

    eye.add(pupil);
    eye.add(tipAnchor);
    group.add(eye);

    return {
      side,
      group,
      segments,
      eye,
      pupil,
      tipAnchor,
      stalkMaterial,
      eyeMaterial: eye.material,
      baseStalkColor: new THREE.Color(0x98fb98),
      baseEyeColor: new THREE.Color(0xffffff),
      velocityColor: new THREE.Color(0xff0000),
      rootOffset: STALK_ROOT_OFFSETS[side].clone(),
      nodes: [],
      previousNodes: [],
      tipPosition: new THREE.Vector3(),
      previousTipPosition: new THREE.Vector3(),
      tipVelocity: new THREE.Vector3(),
      targetYaw: this.stalkNeutralPose.yaw,
      targetPitch: this.stalkNeutralPose.pitch,
      targetVector: getLocalStalkDirection(this.stalkNeutralPose.yaw, this.stalkNeutralPose.pitch),
      currentVector: getLocalStalkDirection(this.stalkNeutralPose.yaw, this.stalkNeutralPose.pitch),
      impactPower: 0,
      held: false,
      segmentRadius: this.stalkSegmentRadius
    };
  }

  initializeLocalStalkState() {
    for (const stalk of Object.values(this.stalks)) {
      const rootWorld = getStalkRootWorldPosition(this.mesh.position, this.mesh.rotation.y, stalk.rootOffset);
      const goalWorld = getStalkGoalWorldPosition(
        this.mesh.position,
        this.mesh.rotation.y,
        stalk.targetYaw,
        stalk.targetPitch,
        this.stalkLength,
        stalk.rootOffset
      );
      const nodes = createInitialStalkNodes(rootWorld, goalWorld, this.stalkSegmentCount);
      copyNodesInto(stalk.nodes, nodes);
      copyNodesInto(stalk.previousNodes, nodes);
      stalk.tipPosition.copy(nodes[nodes.length - 1]);
      stalk.previousTipPosition.copy(stalk.tipPosition);
      stalk.currentVector.copy(stalk.targetVector);
    }
  }

  initializeDeathBurstState() {
    const burstMeshes = [
      this.body,
      this.shell,
      ...Object.values(this.stalks).flatMap((stalk) => [stalk.eye, stalk.pupil, ...stalk.segments])
    ];

    this.deathBurstPieces = burstMeshes.map((mesh) => ({
      mesh,
      defaultPosition: mesh.position.clone(),
      defaultQuaternion: mesh.quaternion.clone(),
      defaultScale: mesh.scale.clone(),
      burstPosition: mesh.position.clone(),
      burstQuaternion: mesh.quaternion.clone(),
      burstScale: mesh.scale.clone(),
      offset: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      scaleBoost: 1,
      radialScale: 1
    }));

    this.deathBurst = {
      active: false,
      elapsed: 0,
      completed: false
    };
  }

  updateShared(delta) {
    this.simulateLocalStalks(delta);
    this.renderStalks();
    this.updateDamageState(delta);
    this.updateShellColor();
    this.updateMotionState(delta);
    this.updateStalkVisualState();
  }

  getGroundHeightAt(x, z) {
    return getTerrainBodyGroundHeight({
      x,
      z,
      rotationY: this.mesh.rotation.y,
      terrainConfig: this.terrainConfig,
      aboveGroundHeight: this.groundHeight
    });
  }

  getGroundHeight() {
    return this.getGroundHeightAt(this.mesh.position.x, this.mesh.position.z);
  }

  setTerrainConfig(nextTerrainConfig = DEFAULT_TERRAIN_CONFIG) {
    this.terrainConfig = normalizeTerrainConfig(nextTerrainConfig);
  }

  simulateLocalStalks(delta) {
    for (const stalk of Object.values(this.stalks)) {
      stalk.previousTipPosition.copy(stalk.tipPosition);

      const rootWorld = getStalkRootWorldPosition(this.mesh.position, this.mesh.rotation.y, stalk.rootOffset);
      const goalWorld = getStalkGoalWorldPosition(
        this.mesh.position,
        this.mesh.rotation.y,
        stalk.targetYaw,
        stalk.targetPitch,
        this.stalkLength,
        stalk.rootOffset
      );

      simulateStalkRope({
        nodes: stalk.nodes,
        previousNodes: stalk.previousNodes,
        rootWorld,
        goalWorld,
        delta,
        segmentLength: this.stalkSegmentLength,
        gravity: this.stalkGravity,
        damping: this.stalkDamping,
        goalPull: stalk.held ? this.stalkDrivePull : this.stalkIdlePull,
        constraintIterations: this.stalkConstraintIterations
      });

      stalk.tipPosition.copy(stalk.nodes[stalk.nodes.length - 1]);
      if (delta > 0) {
        stalk.tipVelocity.copy(stalk.tipPosition).sub(stalk.previousTipPosition).divideScalar(delta);
      } else {
        stalk.tipVelocity.set(0, 0, 0);
      }

      const rootToTip = stalk.tipPosition.clone().sub(rootWorld);
      if (rootToTip.lengthSq() > 0) {
        stalk.currentVector.copy(getBodyLocalDirection(rootToTip.normalize(), this.mesh.rotation.y));
      } else {
        stalk.currentVector.copy(stalk.targetVector);
      }
    }
  }

  renderStalks() {
    for (const stalk of Object.values(this.stalks)) {
      this.renderStalk(stalk);
    }
  }

  renderStalk(stalk) {
    this.mesh.updateMatrixWorld(true);
    const inverseWorld = this.mesh.matrixWorld.clone().invert();

    for (let index = 0; index < stalk.segments.length; index += 1) {
      const segment = stalk.segments[index];
      const startLocal = stalk.nodes[index]?.clone().applyMatrix4(inverseWorld);
      const endLocal = stalk.nodes[index + 1]?.clone().applyMatrix4(inverseWorld);

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

    const tipNode = stalk.nodes[stalk.nodes.length - 1];
    const previousNode = stalk.nodes[stalk.nodes.length - 2] ?? tipNode;
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

    stalk.eye.position.copy(tipLocal);
    stalk.eye.quaternion.setFromUnitVectors(LOCAL_FORWARD, eyeForward);
  }

  updateStalkVisualState() {
    for (const stalk of Object.values(this.stalks)) {
      const speedRatio = THREE.MathUtils.clamp(
        stalk.tipVelocity.length() / STALK_VISUAL_SPEED_REFERENCE,
        0,
        1
      );
      const stalkTint = stalk.held
        ? Math.max(0.28, speedRatio)
        : speedRatio * 0.08;

      stalk.eyeMaterial.color.copy(stalk.baseEyeColor).lerp(stalk.velocityColor, speedRatio);
      stalk.stalkMaterial.color.copy(stalk.baseStalkColor).lerp(stalk.velocityColor, stalkTint);
    }
  }

  resetDeathBurst() {
    for (const piece of this.deathBurstPieces) {
      piece.mesh.position.copy(piece.defaultPosition);
      piece.mesh.quaternion.copy(piece.defaultQuaternion);
      piece.mesh.scale.copy(piece.defaultScale);
      piece.offset.set(0, 0, 0);
      piece.velocity.set(0, 0, 0);
      piece.angularVelocity.set(0, 0, 0);
      piece.scaleBoost = 1;
      piece.radialScale = 1;
    }

    this.mesh.scale.setScalar(1);
    this.deathBurst.active = false;
    this.deathBurst.elapsed = 0;
    this.deathBurst.completed = false;
  }

  startDeathBurst() {
    if (!this.deathBurstEnabled) {
      return;
    }

    this.deathBurst.active = true;
    this.deathBurst.elapsed = 0;
    this.deathBurst.completed = false;

    for (const [index, piece] of this.deathBurstPieces.entries()) {
      piece.burstPosition.copy(piece.mesh.position);
      piece.burstQuaternion.copy(piece.mesh.quaternion);
      piece.burstScale.copy(piece.mesh.scale);
      piece.offset.set(0, 0, 0);

      const velocity = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 0.7 + 0.35,
        Math.random() * 2 - 1
      );
      if (velocity.lengthSq() === 0) {
        velocity.z = 1;
      }

      velocity.normalize().multiplyScalar(3.5 + Math.random() * 6 + index * 0.1);
      velocity.y += 2 + Math.random() * 4;

      piece.velocity.copy(velocity);
      piece.angularVelocity.set(
        (Math.random() * 2 - 1) * 10,
        (Math.random() * 2 - 1) * 10,
        (Math.random() * 2 - 1) * 10
      );
      piece.scaleBoost = 0.35 + Math.random() * 0.8;
      piece.radialScale = 1 + Math.random() * 0.9;
    }
  }

  updateDeathBurst(delta) {
    if (!this.deathBurst.active) {
      return;
    }

    this.deathBurst.elapsed += delta;
    const burstAlpha = Math.min(1, this.deathBurst.elapsed / DEATH_BURST_SWELL_TIME);
    const fadeAlpha = Math.min(1, this.deathBurst.elapsed / this.deathBurstDuration);
    const volumeScale = 1 + (DEATH_BURST_MAX_SCALE - 1) * burstAlpha * (1 - fadeAlpha * 0.15);
    const spinEuler = new THREE.Euler();
    const spinQuaternion = new THREE.Quaternion();

    this.mesh.scale.setScalar(volumeScale);

    for (const piece of this.deathBurstPieces) {
      piece.velocity.y -= this.deathBurstGravity * delta;
      piece.offset.addScaledVector(piece.velocity, delta);

      piece.mesh.position.copy(piece.burstPosition)
        .multiplyScalar(1 + burstAlpha * piece.radialScale)
        .add(piece.offset);

      spinEuler.set(
        piece.angularVelocity.x * this.deathBurst.elapsed,
        piece.angularVelocity.y * this.deathBurst.elapsed,
        piece.angularVelocity.z * this.deathBurst.elapsed
      );
      spinQuaternion.setFromEuler(spinEuler);
      piece.mesh.quaternion.copy(piece.burstQuaternion).multiply(spinQuaternion);
      piece.mesh.scale.copy(piece.burstScale).multiplyScalar(1 + piece.scaleBoost * burstAlpha);
    }

    if (this.deathBurst.elapsed >= this.deathBurstDuration) {
      this.deathBurst.active = false;
      this.deathBurst.completed = true;
      this.mesh.visible = false;
      this.mesh.scale.setScalar(1);
    }
  }

  updateDamageState(delta) {
    if (this.isDamaged) {
      this.damageFlashTime += delta;
      if (this.damageFlashTime >= this.damageFlashDuration) {
        this.isDamaged = false;
        this.damageFlashTime = 0;
        this.body.material.color.copy(this.originalBodyColor);
      }
    }

    if (!this.isDamaged) {
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

  updateStalkTargetVector(stalk) {
    stalk.targetVector.copy(getLocalStalkDirection(stalk.targetYaw, stalk.targetPitch));
  }

  applyPoseToSides(pose, side, mode, intensity, held) {
    const sides = side === 'both' ? STALK_SIDE_KEYS : [side];

    for (const stalkSide of sides) {
      const stalk = this.stalks[stalkSide];
      stalk.targetYaw = THREE.MathUtils.clamp(
        pose.yaw ?? stalk.targetYaw,
        -this.stalkYawLimit,
        this.stalkYawLimit
      );
      stalk.targetPitch = THREE.MathUtils.clamp(
        pose.pitch ?? stalk.targetPitch,
        this.stalkPitchMin,
        this.stalkPitchMax
      );
      if (typeof held === 'boolean') {
        stalk.held = held;
      }
      this.updateStalkTargetVector(stalk);
    }

    this.controlMode = mode;
    this.controlIntensity = intensity;
  }

  setStalkTargetPose(pose, mode = this.controlMode, intensity = this.controlIntensity, side = 'both', held = true) {
    this.applyPoseToSides(pose, side, mode, intensity, held);
  }

  adjustStalkTargetPose(pose, mode = this.controlMode, intensity = this.controlIntensity, side = 'both', held = true) {
    const sides = side === 'both' ? STALK_SIDE_KEYS : [side];

    for (const stalkSide of sides) {
      const stalk = this.stalks[stalkSide];
      this.applyPoseToSides({
        yaw: stalk.targetYaw + (pose.yaw ?? 0),
        pitch: stalk.targetPitch + (pose.pitch ?? 0)
      }, stalkSide, mode, intensity, held);
    }
  }

  setStalkHeld(side, held) {
    const sides = side === 'both' ? STALK_SIDE_KEYS : [side];
    for (const stalkSide of sides) {
      this.stalks[stalkSide].held = held;
    }

    this.controlMode = getControlModeForHeldState(this.stalks.left.held, this.stalks.right.held);
    if (this.controlMode === 'idle') {
      this.controlIntensity = 0;
    }
  }

  relaxStalk(mode = 'idle', side = 'both') {
    this.applyPoseToSides(this.stalkNeutralPose, side, mode, 0, false);
    this.controlMode = mode;
    this.controlIntensity = 0;
  }

  applyMatchState(state, delta = 0) {
    if (!state) {
      this.resetDeathBurst();
      this.mesh.visible = false;
      return;
    }

    if (state.health > 0 && (this.deathBurst.active || this.deathBurst.completed)) {
      this.resetDeathBurst();
    }

    if (this.deathBurstEnabled && !this.hasReceivedMatchState && state.health <= 0) {
      this.deathBurst.completed = true;
    }

    const shouldStartDeathBurst = this.deathBurstEnabled
      && this.hasReceivedMatchState
      && this.health > 0
      && state.health <= 0;
    const shouldHideDeadState = this.deathBurstEnabled
      && state.health <= 0
      && (this.deathBurst.completed || !this.hasReceivedMatchState);

    this.mesh.visible = state.connected !== false && !shouldHideDeadState;
    if (!this.mesh.visible) {
      this.hasReceivedMatchState = true;
      return;
    }

    this.health = state.health;
    this.maxHealth = state.maxHealth;
    this.impactPower = state.impactPower;
    this.controlMode = state.controlMode;
    this.controlIntensity = state.controlIntensity ?? 0;

    this.mesh.position.set(state.position.x, state.position.y, state.position.z);
    this.mesh.rotation.y = state.rotationY;
    this.applySupportNormal(state.supportNormal);

    for (const side of STALK_SIDE_KEYS) {
      const stalk = this.stalks[side];
      const incoming = state.stalks?.[side];
      if (!incoming) {
        continue;
      }

      stalk.held = Boolean(incoming.held);
      stalk.impactPower = incoming.impactPower ?? 0;
      stalk.segmentRadius = incoming.segmentRadius ?? this.stalkSegmentRadius;
      stalk.targetYaw = incoming.targetYaw ?? stalk.targetYaw;
      stalk.targetPitch = incoming.targetPitch ?? stalk.targetPitch;

      if (incoming.targetVector) {
        stalk.targetVector.set(
          incoming.targetVector.x,
          incoming.targetVector.y,
          incoming.targetVector.z
        );
      } else {
        this.updateStalkTargetVector(stalk);
      }

      if (incoming.currentVector) {
        stalk.currentVector.set(
          incoming.currentVector.x,
          incoming.currentVector.y,
          incoming.currentVector.z
        );
      }

      const incomingNodes = deserializeNodes(incoming.nodes ?? []);
      if (incomingNodes.length > 0) {
        const previousTipPosition = stalk.tipPosition.clone();
        if (!this.mesh.userData.hasAppliedMatchState) {
          copyNodesInto(stalk.nodes, incomingNodes);
          copyNodesInto(stalk.previousNodes, incomingNodes);
        } else {
          copyNodesInto(stalk.previousNodes, stalk.nodes);
          copyNodesInto(stalk.nodes, incomingNodes);
        }

        stalk.previousTipPosition.copy(previousTipPosition);
        stalk.tipPosition.copy(stalk.nodes[stalk.nodes.length - 1]);
        if (this.mesh.userData.hasAppliedMatchState && delta > 0) {
          stalk.tipVelocity.copy(stalk.tipPosition).sub(previousTipPosition).divideScalar(delta);
        } else {
          stalk.tipVelocity.set(0, 0, 0);
        }
      }
    }

    if (!this.deathBurst.active) {
      this.renderStalks();
    }

    if (shouldStartDeathBurst) {
      this.startDeathBurst();
    }

    this.updateDamageState(delta);
    this.updateShellColor();
    this.updateDeathBurst(delta);
    this.updateMotionState(delta);
    this.updateStalkVisualState();
    this.mesh.userData.hasAppliedMatchState = true;
    this.hasReceivedMatchState = true;
  }

  setVisible(visible) {
    if (!visible) {
      this.resetDeathBurst();
    }
    this.mesh.visible = visible;
  }

  applySupportNormal(supportNormal = LOCAL_UP) {
    const normal = new THREE.Vector3(
      Number.isFinite(supportNormal?.x) ? supportNormal.x : 0,
      Number.isFinite(supportNormal?.y) ? supportNormal.y : 1,
      Number.isFinite(supportNormal?.z) ? supportNormal.z : 0
    );

    if (normal.lengthSq() === 0) {
      normal.copy(LOCAL_UP);
    } else {
      normal.normalize();
    }

    this.tiltRoot.quaternion.setFromUnitVectors(LOCAL_UP, normal);
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
    this.mesh.position.y = this.getGroundHeight();
  }

  takeDamage(amount = 1) {
    if (this.health <= 0) {
      return false;
    }

    this.health = Math.max(0, this.health - amount);
    this.isDamaged = true;
    this.damageFlashTime = 0;
    this.body.material.color.copy(this.damageColor);
    return true;
  }

  getStalk(side = 'left') {
    return this.stalks[side] ?? this.stalks.left;
  }

  getEyeStalkPosition(side = null) {
    if (side) {
      const position = new THREE.Vector3();
      this.getStalk(side).tipAnchor.getWorldPosition(position);
      return position;
    }

    return this.getEyeStalkPosition('left')
      .add(this.getEyeStalkPosition('right'))
      .multiplyScalar(0.5);
  }

  getStalkNodes(side = 'left') {
    return this.getStalk(side).nodes.map((node) => node.clone());
  }

  getStalkSegmentRadius(side = 'left') {
    return this.getStalk(side).segmentRadius;
  }

  getStalkSegmentSamples(side = 'left') {
    const stalk = this.getStalk(side);
    return buildStalkSegmentSamples(
      stalk.nodes,
      stalk.previousNodes,
      this.lastMotionDelta,
      stalk.segmentRadius
    );
  }

  getStalkCollisionSources() {
    return STALK_SIDE_KEYS.map((side) => ({
      side,
      tipPosition: this.getEyeStalkPosition(side),
      tipVelocity: this.getEyeStalkVelocity(side),
      segmentRadius: this.getStalkSegmentRadius(side),
      segmentSamples: this.getStalkSegmentSamples(side)
    }));
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

  getEyeStalkVelocity(side = null) {
    if (side) {
      return this.getStalk(side).tipVelocity.clone();
    }

    return this.getEyeStalkVelocity('left')
      .add(this.getEyeStalkVelocity('right'))
      .multiplyScalar(0.5);
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

  getStalkImpactPower(side = 'left') {
    return this.getStalk(side).impactPower;
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

  getTipSpeed(side = null) {
    return this.getEyeStalkVelocity(side).length();
  }

  getFacingVector() {
    return new THREE.Vector3(
      Math.sin(this.mesh.rotation.y),
      0,
      Math.cos(this.mesh.rotation.y)
    );
  }

  getStalkTargetVector(side = 'left') {
    return this.getStalk(side).targetVector.clone();
  }

  getStalkCurrentVector(side = 'left') {
    return this.getStalk(side).currentVector.clone();
  }

  syncMotionState() {
    this.refreshPositionCache();
    for (const stalk of Object.values(this.stalks)) {
      copyNodesInto(stalk.previousNodes, stalk.nodes);
      stalk.tipVelocity.set(0, 0, 0);
      stalk.previousTipPosition.copy(stalk.tipPosition);
    }

    this.bodyVelocity.set(0, 0, 0);
    this.eyeTipVelocity.set(0, 0, 0);
    this.lastMotionDelta = 1 / 60;
  }

  refreshPositionCache() {
    this.mesh.updateMatrixWorld(true);
    this.bodyCenter.getWorldPosition(this.bodyPosition);
    this.eyeTipPosition.copy(this.getEyeStalkPosition());
    this.previousEyeTipPosition.copy(this.eyeTipPosition);
  }

  updateMotionState(delta) {
    this.mesh.updateMatrixWorld(true);

    const nextBodyPosition = new THREE.Vector3();
    this.bodyCenter.getWorldPosition(nextBodyPosition);

    if (delta > 0) {
      this.bodyVelocity.copy(nextBodyPosition).sub(this.bodyPosition).divideScalar(delta);
      this.lastMotionDelta = delta;
    } else {
      this.bodyVelocity.set(0, 0, 0);
    }

    this.bodyPosition.copy(nextBodyPosition);

    const nextEyeTipPosition = this.getEyeStalkPosition();
    if (delta > 0) {
      this.eyeTipVelocity.copy(nextEyeTipPosition).sub(this.eyeTipPosition).divideScalar(delta);
    } else {
      this.eyeTipVelocity.set(0, 0, 0);
    }

    this.previousEyeTipPosition.copy(this.eyeTipPosition);
    this.eyeTipPosition.copy(nextEyeTipPosition);
  }
}
