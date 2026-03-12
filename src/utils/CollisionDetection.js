import * as THREE from 'three';

export class CollisionDetection {
  constructor() {
    this.lastCollisionResult = false;
    this.lastCollisionDetails = {
      eyeStalkPosition: null,
      eyeStalkVelocity: null,
      targetBodyPosition: null,
      targetBodyRadius: 0,
      distance: 0,
      impactPower: 0,
      closingSpeed: 0,
      movementAssist: 0
    };
  }

  checkImpactCollision(attacker, targetSnail) {
    const eyeStalkPosition = attacker.getEyeStalkPosition();
    const eyeStalkVelocity = attacker.getEyeStalkVelocity();
    const movementAssistVelocity = attacker.getBodyVelocity();
    const targetBodyPosition = targetSnail.getBodyPosition();
    const targetBodyRadius = targetSnail.getBodyRadius();
    const distance = eyeStalkPosition.distanceTo(targetBodyPosition);
    const hasCollision = distance <= targetBodyRadius;
    const directionToTarget = distance === 0
      ? new THREE.Vector3(0, 0, 1)
      : targetBodyPosition.clone().sub(eyeStalkPosition).normalize();
    const closingSpeed = Math.max(0, eyeStalkVelocity.dot(directionToTarget));
    const movementAssist = Math.max(0, movementAssistVelocity.dot(directionToTarget));
    const impactPower = closingSpeed + movementAssist * attacker.getImpactMomentumFactor();

    this.lastCollisionDetails = {
      eyeStalkPosition: eyeStalkPosition.clone(),
      eyeStalkVelocity: eyeStalkVelocity.clone(),
      targetBodyPosition,
      targetBodyRadius,
      distance,
      impactPower,
      closingSpeed,
      movementAssist
    };
    this.lastCollisionResult = hasCollision && impactPower >= attacker.getImpactThreshold();

    return {
      collision: hasCollision,
      impactPower,
      closingSpeed,
      movementAssist,
      distance,
      threshold: attacker.getImpactThreshold()
    };
  }

  checkBodyCollision(snailA, snailB) {
    const positionA = snailA.getBodyPosition();
    const positionB = snailB.getBodyPosition();
    const radiusA = snailA.getBodyRadius();
    const radiusB = snailB.getBodyRadius();
    const delta = new THREE.Vector3().subVectors(positionB, positionA);
    const distance = delta.length();
    const minimumDistance = radiusA + radiusB;
    const collision = distance < minimumDistance;

    if (!collision) {
      return {
        collision: false,
        overlap: 0,
        direction: new THREE.Vector3(1, 0, 0)
      };
    }

    const direction = distance === 0
      ? new THREE.Vector3(1, 0, 0)
      : delta.normalize();

    return {
      collision: true,
      overlap: minimumDistance - distance,
      direction
    };
  }
}
