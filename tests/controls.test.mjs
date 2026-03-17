import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { PlayerSnail } from '../src/entities/PlayerSnail.js';
import { NPCSnail } from '../src/entities/NPCSnail.js';
import { CameraController } from '../src/game/CameraController.js';
import { getTerrainHeight } from '../src/world/Terrain.js';

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

function vectorToPojo(vector) {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z
  };
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
  const player = new PlayerSnail();
  const initialHeight = player.mesh.position.y;

  player.move(new THREE.Vector3(1, 0, 0), 0.5, new THREE.Vector3(1, 0, 0));
  player.update(1 / 60, createCombatInput());

  assert(player.mesh.position.y > initialHeight);
  assert.equal(player.mesh.position.y, getTerrainHeight(player.mesh.position.x, player.mesh.position.z));
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
