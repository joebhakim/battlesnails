import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { KeyboardControls } from '../src/controls/KeyboardControls.js';
import { PlayerSnail } from '../src/entities/PlayerSnail.js';
import { NPCSnail } from '../src/entities/NPCSnail.js';
import { CameraController } from '../src/game/CameraController.js';
import { Game } from '../src/game/Game.js';
import { MatchSimulation, MATCH_TICK_DURATION } from '../src/sim/MatchSimulation.js';
import {
  DEFAULT_TUNING_CONFIG,
  createBotControllerConfig,
  createSimulationProfiles
} from '../src/sim/Tuning.js';
import { getLocalStalkDirection } from '../src/sim/StalkRope.js';
import { getTerrainHeight, normalizeTerrainConfig } from '../src/world/Terrain.js';

function createCombatInput({
  leftHeld = false,
  rightHeld = false,
  lookX = 0,
  lookY = 0
} = {}) {
  return {
    engaged: leftHeld || rightHeld,
    leftHeld,
    rightHeld,
    lookX,
    lookY,
    pointerLocked: true
  };
}

function createKeyboardEvent(key) {
  return {
    key,
    repeat: false,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
}

function vectorToPojo(vector) {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z
  };
}

function getSimulationFacingVector(player) {
  return new THREE.Vector3(Math.sin(player.rotationY), 0, Math.cos(player.rotationY));
}

function angleDelta(left, right) {
  return Math.atan2(Math.sin(left - right), Math.cos(left - right));
}

function createMatchState(actor, overrides = {}) {
  const left = actor.getStalk('left');
  const right = actor.getStalk('right');

  return {
    connected: true,
    health: actor.health,
    maxHealth: actor.maxHealth,
    impactPower: actor.getImpactPower(),
    controlMode: actor.getCombatMode(),
    controlIntensity: actor.getControlIntensity(),
    invincible: false,
    position: {
      x: actor.mesh.position.x,
      y: actor.mesh.position.y,
      z: actor.mesh.position.z
    },
    rotationY: actor.mesh.rotation.y,
    stalks: {
      left: {
        nodes: actor.getStalkNodes('left').map(vectorToPojo),
        segmentRadius: actor.getStalkSegmentRadius('left'),
        held: left.held,
        impactPower: left.impactPower,
        targetVector: vectorToPojo(actor.getStalkTargetVector('left')),
        currentVector: vectorToPojo(actor.getStalkCurrentVector('left')),
        targetYaw: left.targetYaw,
        targetPitch: left.targetPitch
      },
      right: {
        nodes: actor.getStalkNodes('right').map(vectorToPojo),
        segmentRadius: actor.getStalkSegmentRadius('right'),
        held: right.held,
        impactPower: right.impactPower,
        targetVector: vectorToPojo(actor.getStalkTargetVector('right')),
        currentVector: vectorToPojo(actor.getStalkCurrentVector('right')),
        targetYaw: right.targetYaw,
        targetPitch: right.targetPitch
      }
    },
    ...overrides
  };
}

test('left held input updates only the left stalk target', () => {
  const player = new PlayerSnail();
  const neutralLeftYaw = player.getStalk('left').targetYaw;
  const neutralRightYaw = player.getStalk('right').targetYaw;

  player.applyCombatInput(createCombatInput({ leftHeld: true, lookX: 12 }));

  assert(player.getStalk('left').targetYaw < neutralLeftYaw);
  assert.equal(player.getStalk('right').targetYaw, neutralRightYaw);
});

test('game local input forwards mouse wheel reach delta', () => {
  const game = Object.create(Game.prototype);
  game.keyboardControls = {
    getMovementAxes: () => ({ x: 0, z: 0 }),
    consumeJumpRequest: () => false,
    isLockOnHeld: () => true
  };
  game.cameraController = {
    getMovementDirection: () => new THREE.Vector3(0, 0, 0)
  };
  game.mouseControls = {
    consumeCombatInput: () => ({
      lookX: 0,
      lookY: 0,
      reachDelta: 2.5,
      leftHeld: true,
      rightHeld: false
    })
  };

  const input = game.buildLocalInput();

  assert.equal(input.reachDelta, 2.5);
  assert.equal(input.leftHeld, true);
});

test('right held input updates only the right stalk target', () => {
  const player = new PlayerSnail();
  const neutralLeftPitch = player.getStalk('left').targetPitch;
  const neutralRightPitch = player.getStalk('right').targetPitch;

  player.applyCombatInput(createCombatInput({ rightHeld: true, lookY: -12 }));

  assert.equal(player.getStalk('left').targetPitch, neutralLeftPitch);
  assert(player.getStalk('right').targetPitch > neutralRightPitch);
});

test('holding both buttons drives both stalk targets with the same mouse delta', () => {
  const player = new PlayerSnail();
  const leftBefore = player.getStalk('left').targetYaw;
  const rightBefore = player.getStalk('right').targetYaw;

  player.applyCombatInput(createCombatInput({ leftHeld: true, rightHeld: true, lookX: -10, lookY: -8 }));

  assert(player.getStalk('left').targetYaw > leftBefore);
  assert(player.getStalk('right').targetYaw > rightBefore);
  assert.equal(player.getCombatMode(), 'both');
});

test('stalk limit hemisphere is tilted forward enough to reach down', () => {
  const neutral = getLocalStalkDirection(
    DEFAULT_TUNING_CONFIG.stalkNeutralYaw,
    DEFAULT_TUNING_CONFIG.stalkNeutralPitch
  );
  const fullDown = getLocalStalkDirection(0, DEFAULT_TUNING_CONFIG.stalkPitchMax);

  assert(neutral.z > 0.98);
  assert(neutral.y > 0);
  assert(neutral.y < 0.12);
  assert(fullDown.y < -0.8);
  assert(fullDown.z > 0.45);
});

test('released stalk keeps its target vector but continues moving inertially', () => {
  const player = new PlayerSnail();

  player.applyCombatInput(createCombatInput({ leftHeld: true, lookX: 16, lookY: -10 }));
  player.update(1 / 60, createCombatInput({ leftHeld: true, lookX: 16, lookY: -10 }));

  const frozenTarget = player.getStalkTargetVector('left');
  const releaseTip = player.getEyeStalkPosition('left');

  for (let index = 0; index < 20; index += 1) {
    player.update(1 / 60, createCombatInput());
  }

  assert.equal(player.getStalk('left').held, false);
  assert(player.getStalkTargetVector('left').distanceTo(frozenTarget) < 0.0001);
  assert(player.getEyeStalkPosition('left').distanceTo(releaseTip) > 0.05);
});

test('both stalks use longer segmented chains', () => {
  const player = new PlayerSnail();

  for (const side of ['left', 'right']) {
    const nodes = player.getStalkNodes(side);
    const totalLength = nodes.slice(1).reduce((length, node, index) => (
      length + node.distanceTo(nodes[index])
    ), 0);

    assert.equal(nodes.length, player.stalkSegmentCount + 1);
    assert.equal(player.getStalk(side).segments.length, player.stalkSegmentCount);
    assert(totalLength > 3);
  }
});

test('idle dual ropes settle into a visible gravity sag', () => {
  const player = new PlayerSnail();
  const initialLeftY = player.getStalkNodes('left')[3].y;
  const initialRightY = player.getStalkNodes('right')[3].y;

  for (let index = 0; index < 45; index += 1) {
    player.update(1 / 60, createCombatInput());
  }

  assert(player.getStalkNodes('left')[3].y < initialLeftY - 0.2);
  assert(player.getStalkNodes('right')[3].y < initialRightY - 0.2);
});

test('idle stalk tip speed settles well below the full-red visual threshold', () => {
  const player = new PlayerSnail();

  for (let index = 0; index < 120; index += 1) {
    player.update(1 / 60, createCombatInput());
  }

  assert(player.getTipSpeed('left') < 6);
  assert(player.getTipSpeed('right') < 6);
});

test('lock-on camera basis keeps D moving to world-right when facing the enemy head-on', () => {
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);
  const controller = new CameraController(camera);

  controller.setLockOnEnabled(true);
  controller.snapToTarget(
    new THREE.Vector3(0, 1, 6),
    new THREE.Vector3(0, 1, -6),
    new THREE.Vector3(0, 0, -1)
  );

  const rightMove = controller.getMovementDirection({ forward: 0, right: 1 });
  const leftMove = controller.getMovementDirection({ forward: 0, right: -1 });

  assert(rightMove.x > 0);
  assert(leftMove.x < 0);
});

test('keyboard S maps to backward movement intent', () => {
  const controls = Object.create(KeyboardControls.prototype);
  controls.keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    lockOn: false
  };
  controls.pendingJump = false;

  const keydown = createKeyboardEvent('s');
  controls.handleKeyChange(keydown, true);
  assert.equal(keydown.defaultPrevented, true);
  assert.deepEqual(controls.getMovementAxes(), { forward: -1, right: 0 });

  const keyup = createKeyboardEvent('s');
  controls.handleKeyChange(keyup, false);
  assert.deepEqual(controls.getMovementAxes(), { forward: 0, right: 0 });
});

test('S-style movement backs away from the lock-on opponent', () => {
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);
  const controller = new CameraController(camera);
  const playerPosition = new THREE.Vector3(0, 1, 6);
  const enemyPosition = new THREE.Vector3(0, 1, -6);

  controller.setLockOnEnabled(true);
  controller.snapToTarget(playerPosition, enemyPosition, new THREE.Vector3(0, 0, -1));

  const forwardMove = controller.getMovementDirection({ forward: 1, right: 0 });
  const backwardMove = controller.getMovementDirection({ forward: -1, right: 0 });

  assert(forwardMove.z < 0);
  assert(backwardMove.z > 0);
  assert(playerPosition.clone().add(backwardMove).distanceTo(enemyPosition) > playerPosition.distanceTo(enemyPosition));
});

test('shared simulation treats backward lock-on input as retreating from the opponent', () => {
  const forwardSimulation = new MatchSimulation();
  const backwardSimulation = new MatchSimulation();
  const forwardPlayer = forwardSimulation.getPlayerState(1);
  const forwardOpponent = forwardSimulation.getPlayerState(2);
  const backwardPlayer = backwardSimulation.getPlayerState(1);
  const backwardOpponent = backwardSimulation.getPlayerState(2);
  const forwardStartDistance = forwardPlayer.position.distanceTo(forwardOpponent.position);
  const backwardStartDistance = backwardPlayer.position.distanceTo(backwardOpponent.position);

  forwardSimulation.setPlayerInput(1, { moveZ: -1, lockOnHeld: true });
  backwardSimulation.setPlayerInput(1, { moveZ: 1, lockOnHeld: true });
  forwardSimulation.step(MATCH_TICK_DURATION);
  backwardSimulation.step(MATCH_TICK_DURATION);

  assert(forwardSimulation.getPlayerState(1).position.distanceTo(forwardOpponent.position) < forwardStartDistance);
  assert(backwardSimulation.getPlayerState(1).position.distanceTo(backwardOpponent.position) > backwardStartDistance);
});

test('free backward input backpedals without rotating into a camera spin', () => {
  const simulation = new MatchSimulation();
  const camera = new THREE.PerspectiveCamera(120, 1, 0.1, 1000);
  const controller = new CameraController(camera);
  const startPlayer = simulation.getPlayerState(1);
  const opponent = simulation.getPlayerState(2);
  const startRotation = startPlayer.rotationY;
  const startPosition = startPlayer.position.clone();

  controller.setLockOnEnabled(false);
  controller.snapToTarget(
    startPlayer.position.clone(),
    opponent.position.clone(),
    getSimulationFacingVector(startPlayer)
  );

  for (let index = 0; index < 60; index += 1) {
    const player = simulation.getPlayerState(1);
    const movement = controller.getMovementDirection({ forward: -1, right: 0 });
    simulation.setPlayerInput(1, {
      moveX: movement.x,
      moveZ: movement.z,
      lockOnHeld: false
    });
    simulation.step(MATCH_TICK_DURATION);
    controller.update(
      player.position.clone(),
      opponent.position.clone(),
      getSimulationFacingVector(player)
    );
  }

  const endPlayer = simulation.getPlayerState(1);
  assert(endPlayer.position.z > startPosition.z + 1);
  assert(Math.abs(endPlayer.position.x - startPosition.x) < 0.25);
  assert(Math.abs(angleDelta(endPlayer.rotationY, startRotation)) < 0.1);
});

test('player move can decouple movement direction from facing direction', () => {
  const player = new PlayerSnail();
  const moveDirection = new THREE.Vector3(1, 0, 0);
  const facingDirection = new THREE.Vector3(0, 0, -1);

  player.move(moveDirection, 1, facingDirection);

  const facing = player.getFacingVector();
  assert(facing.z < -0.99);
  assert(Math.abs(facing.x) < 0.01);
});

test('free movement speed is higher than lock-on movement speed', () => {
  const freePlayer = new PlayerSnail();
  const lockedPlayer = new PlayerSnail();
  const direction = new THREE.Vector3(0, 0, -1);

  freePlayer.setLockOnEnabled(false);
  lockedPlayer.setLockOnEnabled(true);

  freePlayer.move(direction, 1 / 60, direction);
  lockedPlayer.move(direction, 1 / 60, direction);

  assert(freePlayer.mesh.position.z < lockedPlayer.mesh.position.z);
});

test('presentation actor defaults track shared tuning defaults', () => {
  const player = new PlayerSnail();
  const botProfile = createSimulationProfiles(DEFAULT_TUNING_CONFIG).bot;
  const botControllerConfig = createBotControllerConfig(DEFAULT_TUNING_CONFIG);
  const npc = new NPCSnail();

  assert.equal(player.freeMoveSpeed, DEFAULT_TUNING_CONFIG.freeMoveSpeed);
  assert.equal(player.lockedMoveSpeed, DEFAULT_TUNING_CONFIG.lockedMoveSpeed);
  assert.equal(player.jumpVelocity, DEFAULT_TUNING_CONFIG.jumpVelocity);
  assert.equal(player.gravity, DEFAULT_TUNING_CONFIG.bodyGravity);
  assert.equal(player.getImpactThreshold(), DEFAULT_TUNING_CONFIG.impactThreshold);
  assert.equal(player.stalkLength, DEFAULT_TUNING_CONFIG.stalkTotalLength);

  assert.equal(npc.speed, botProfile.freeMoveSpeed);
  assert.equal(npc.turnSpeed, botProfile.turnSpeed);
  assert.equal(npc.arenaRadius, botProfile.arenaRadius);
  assert.equal(npc.getImpactThreshold(), botProfile.impactThreshold);
  assert.equal(npc.stalkLength, botProfile.stalkTotalLength);
  assert.equal(npc.attackRange, botControllerConfig.attackRange);
  assert.equal(npc.preferredDistance, botControllerConfig.preferredDistance);
  assert.equal(npc.attackCooldown, botControllerConfig.attackCooldown);
});

test('jump lifts the player above ground before settling back down', () => {
  const player = new PlayerSnail();
  const startHeight = player.mesh.position.y;

  assert.equal(player.jump(), true);
  let peakHeight = player.mesh.position.y;

  for (let index = 0; index < 45; index += 1) {
    player.update(1 / 60, createCombatInput());
    peakHeight = Math.max(peakHeight, player.mesh.position.y);
  }

  assert(peakHeight > startHeight + 2.8);
});

test('grounded player actor follows the bowl height when moving uphill', () => {
  const terrain = normalizeTerrainConfig({ preset: 'hyperboloid_bowl' });
  const player = new PlayerSnail({ terrainConfig: terrain });
  const initialHeight = player.mesh.position.y;

  player.move(new THREE.Vector3(1, 0, 0), 0.5, new THREE.Vector3(1, 0, 0));
  player.update(1 / 60, createCombatInput());

  assert(player.mesh.position.y > initialHeight);
  assert.equal(player.mesh.position.y, getTerrainHeight(player.mesh.position.x, player.mesh.position.z, terrain));
});

test('npc death burst scatters pieces, lasts about five seconds, then hides the corpse', () => {
  const npc = new NPCSnail({ health: 2, maxHealth: 2 });
  const aliveState = createMatchState(npc, { health: 2, maxHealth: 2 });

  npc.applyMatchState(aliveState, 1 / 60);
  const initialBodyPosition = npc.body.position.clone();
  const initialShellPosition = npc.shell.position.clone();

  npc.applyMatchState(createMatchState(npc, { health: 0, maxHealth: 2 }), 1 / 60);

  assert.equal(npc.deathBurst.active, true);
  assert.equal(npc.mesh.visible, true);
  assert(npc.mesh.scale.x > 1);
  assert(npc.body.position.distanceTo(initialBodyPosition) > 0.05);
  assert(npc.shell.position.distanceTo(initialShellPosition) > 0.05);

  for (let index = 0; index < 301; index += 1) {
    npc.applyMatchState(createMatchState(npc, { health: 0, maxHealth: 2 }), 1 / 60);
  }

  assert.equal(npc.mesh.visible, false);

  npc.applyMatchState(aliveState, 1 / 60);
  assert.equal(npc.mesh.visible, true);
  assert.equal(npc.deathBurst.completed, false);
  assert(npc.body.position.length() < 0.001);
});
