import * as THREE from 'three';

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
    const targetBodyPosition = targetSnail.getBodyPosition();
    const targetBodyRadius = targetSnail.getBodyRadius();
    const movementAssistVelocity = attacker.getBodyVelocity();
    const stalkSources = attacker.getStalkCollisionSources?.() ?? [
      {
        side: 'left',
        tipPosition: attacker.getEyeStalkPosition(),
        tipVelocity: attacker.getEyeStalkVelocity(),
        segmentSamples: attacker.getStalkSegmentSamples()
      }
    ];

    let selectedSource = stalkSources[0];
    let selectedResult = {
      collision: false,
      impactPower: 0,
      contactImpactPower: 0,
      strongestSample: null,
      contactSample: null
    };

    for (const source of stalkSources) {
      const impactResult = evaluateStalkImpact(
        source.segmentSamples,
        targetBodyPosition,
        targetBodyRadius,
        movementAssistVelocity,
        attacker.getImpactMomentumFactor()
      );
      const impactPower = impactResult.collision
        ? impactResult.contactImpactPower
        : impactResult.impactPower;
      const selectedImpactPower = selectedResult.collision
        ? selectedResult.contactImpactPower
        : selectedResult.impactPower;

      if (
        (impactResult.collision && !selectedResult.collision) ||
        (impactResult.collision === selectedResult.collision && impactPower > selectedImpactPower)
      ) {
        selectedSource = source;
        selectedResult = impactResult;
      }
    }

    const activeSample = selectedResult.contactSample ?? selectedResult.strongestSample;
    const distance = activeSample?.surfaceDistance ?? selectedSource.tipPosition.distanceTo(targetBodyPosition);
    const impactPower = selectedResult.collision
      ? selectedResult.contactImpactPower
      : selectedResult.impactPower;
    const closingSpeed = activeSample?.closingSpeed ?? 0;
    const movementAssist = activeSample?.movementAssist ?? 0;

    this.lastCollisionDetails = {
      eyeStalkPosition: activeSample?.center?.clone() ?? selectedSource.tipPosition.clone(),
      eyeStalkVelocity: activeSample?.velocity?.clone() ?? selectedSource.tipVelocity.clone(),
      targetBodyPosition,
      targetBodyRadius,
      distance,
      impactPower,
      closingSpeed,
      movementAssist
    };
    this.lastCollisionResult = selectedResult.collision && impactPower >= attacker.getImpactThreshold();

    return {
      collision: selectedResult.collision,
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
