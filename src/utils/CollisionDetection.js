import { evaluateStalkImpact } from '../sim/StalkRope.js';

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
    const segmentSamples = attacker.getStalkSegmentSamples();
    const movementAssistVelocity = attacker.getBodyVelocity();
    const targetBodyPosition = targetSnail.getBodyPosition();
    const targetBodyRadius = targetSnail.getBodyRadius();
    const impactResult = evaluateStalkImpact(
      segmentSamples,
      targetBodyPosition,
      targetBodyRadius,
      movementAssistVelocity,
      attacker.getImpactMomentumFactor()
    );
    const activeSample = impactResult.contactSample ?? impactResult.strongestSample;
    const distance = activeSample?.surfaceDistance ?? eyeStalkPosition.distanceTo(targetBodyPosition);
    const impactPower = impactResult.collision
      ? impactResult.contactImpactPower
      : impactResult.impactPower;
    const closingSpeed = activeSample?.closingSpeed ?? 0;
    const movementAssist = activeSample?.movementAssist ?? 0;

    this.lastCollisionDetails = {
      eyeStalkPosition: activeSample?.center?.clone() ?? eyeStalkPosition.clone(),
      eyeStalkVelocity: activeSample?.velocity?.clone() ?? attacker.getEyeStalkVelocity(),
      targetBodyPosition,
      targetBodyRadius,
      distance,
      impactPower,
      closingSpeed,
      movementAssist
    };
    this.lastCollisionResult = impactResult.collision && impactPower >= attacker.getImpactThreshold();

    return {
      collision: impactResult.collision,
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
