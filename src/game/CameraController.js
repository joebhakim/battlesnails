import * as THREE from 'three';

export class CameraController {
  constructor(camera) {
    this.camera = camera;
    this.focus = new THREE.Vector3();
    this.lookAtTarget = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.positionTarget = new THREE.Vector3();
    this.lookAtBuffer = new THREE.Vector3();
    this.focusBuffer = new THREE.Vector3();

    this.distance = 10.5;
    this.height = 4.6;
    this.playerFocusHeight = 1.4;
    this.enemyFocusHeight = 1.1;
    this.positionLerp = 0.12;
    this.lookLerp = 0.16;
    this.playerFocusBias = 0.35;
  }

  snapToTarget(playerPosition, enemyPosition, fallbackForward) {
    const layout = this.computeLayout(playerPosition, enemyPosition, fallbackForward);
    this.focus.copy(layout.focus);
    this.lookAtTarget.copy(layout.lookAt);
    this.camera.position.copy(layout.position);
    this.camera.lookAt(this.lookAtTarget);
  }

  update(playerPosition, enemyPosition, fallbackForward) {
    const layout = this.computeLayout(playerPosition, enemyPosition, fallbackForward);
    this.camera.position.lerp(layout.position, this.positionLerp);
    this.focus.lerp(layout.focus, this.lookLerp);
    this.lookAtTarget.lerp(layout.lookAt, this.lookLerp);
    this.camera.lookAt(this.lookAtTarget);
  }

  computeLayout(playerPosition, enemyPosition, fallbackForward) {
    const duelForward = enemyPosition.clone().sub(playerPosition).setY(0);
    if (duelForward.lengthSq() < 0.0001) {
      duelForward.copy(fallbackForward ?? new THREE.Vector3(0, 0, -1)).setY(0);
    }

    if (duelForward.lengthSq() < 0.0001) {
      duelForward.set(0, 0, -1);
    } else {
      duelForward.normalize();
    }

    const playerFocus = this.focusBuffer.copy(playerPosition);
    playerFocus.y += this.playerFocusHeight;

    const enemyFocus = this.lookAtBuffer.copy(enemyPosition);
    enemyFocus.y += this.enemyFocusHeight;

    const focus = playerFocus.clone().lerp(enemyFocus, 1 - this.playerFocusBias);
    const position = playerFocus.clone()
      .addScaledVector(duelForward, -this.distance)
      .addScaledVector(this.up, this.height);
    const lookAt = focus.clone();

    return { position, focus, lookAt };
  }

  getMovementBasis() {
    const forward = this.lookAtTarget.clone().sub(this.camera.position).setY(0);
    if (forward.lengthSq() === 0) {
      forward.set(0, 0, -1);
    } else {
      forward.normalize();
    }

    const right = new THREE.Vector3().crossVectors(this.up, forward).normalize();
    return { forward, right };
  }

  getMovementDirection(axes) {
    const { forward, right } = this.getMovementBasis();
    const direction = new THREE.Vector3();

    direction.addScaledVector(forward, axes.forward);
    direction.addScaledVector(right, axes.right);

    if (direction.lengthSq() > 1) {
      direction.normalize();
    }

    return direction;
  }
}
