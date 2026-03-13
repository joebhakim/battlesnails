import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { PlayerSnail } from '../src/entities/PlayerSnail.js';
import { CameraController } from '../src/game/CameraController.js';

function createCombatInput(mode, lookX, lookY) {
  return {
    engaged: true,
    mode,
    primaryHeld: mode === 'swing',
    secondaryHeld: mode === 'thrust',
    lookX,
    lookY,
    pointerLocked: true
  };
}

test('swing input maps horizontal mouse delta to lateral stalk bend with the corrected sign', () => {
  const player = new PlayerSnail();
  const neutralYaw = player.stalkTargetPose.yaw;
  const neutralPitch = player.stalkTargetPose.pitch;

  player.applyCombatInput(createCombatInput('swing', 12, 0));
  assert(player.stalkTargetPose.yaw < neutralYaw);
  assert.equal(player.stalkTargetPose.pitch, neutralPitch);

  player.relaxStalk();
  player.applyCombatInput(createCombatInput('swing', -12, 0));
  assert(player.stalkTargetPose.yaw > neutralYaw);
});

test('swing input maps vertical mouse delta to pitch only', () => {
  const player = new PlayerSnail();
  const neutralPitch = player.stalkTargetPose.pitch;
  const neutralYaw = player.stalkTargetPose.yaw;

  player.applyCombatInput(createCombatInput('swing', 0, -12));
  assert(player.stalkTargetPose.pitch > neutralPitch);
  assert.equal(player.stalkTargetPose.yaw, neutralYaw);

  player.relaxStalk();
  player.applyCombatInput(createCombatInput('swing', 0, 12));
  assert(player.stalkTargetPose.pitch < neutralPitch);
});

test('stalk length stays fixed regardless of control mode', () => {
  const swingPlayer = new PlayerSnail();
  const thrustPlayer = new PlayerSnail();

  swingPlayer.update(1 / 60, createCombatInput('swing', 12, -8));
  thrustPlayer.update(1 / 60, createCombatInput('thrust', -12, 8));

  assert.equal(swingPlayer.eyeStalk.scale.y, 1);
  assert.equal(thrustPlayer.eyeStalk.scale.y, 1);
  assert.equal('extension' in swingPlayer.stalkTargetPose, false);
  assert.equal('extension' in thrustPlayer.stalkTargetPose, false);
});

test('stalk pose update uses roll for lateral bend instead of local yaw spin', () => {
  const player = new PlayerSnail();

  player.applyCombatInput(createCombatInput('swing', 12, 0));
  player.update(1 / 60, createCombatInput('swing', 0, 0));

  assert.equal(player.eyeStalk.rotation.y, 0);
  assert.notEqual(player.eyeStalk.rotation.z, 0);
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

  assert.equal(player.jump(), true);
  player.update(1 / 60, { engaged: false, mode: 'idle', lookX: 0, lookY: 0 });
  assert(player.mesh.position.y > player.groundHeight);
});
