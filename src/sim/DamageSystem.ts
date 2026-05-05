import * as THREE from 'three';

import {
  STALK_EYE_BOUNCE_RESTITUTION,
  STALK_EYE_BOUNCE_TANGENT_DAMPING,
  STALK_EYE_RADIUS_SCALE,
  STALK_SEGMENT_RADIUS,
  buildStalkEyeSamples,
  evaluateStalkImpact
} from './StalkRope.js';
import { clonePlainVector } from './CollisionShape.js';
import { getPlayerGroundHeight } from './MovementSupportSystem.js';
import {
  getStalkEntries,
  translatePlayerAttachments
} from './StalkControlSystem.js';
import { getSnailDamageMultiplier } from './SnailPowerups.js';

const DAMAGE_EPSILON = 0.000001;
const BASH_DAMAGE_SCALE = 0.2;
const SCRAPE_DAMAGE_SCALE = 0.04;
const SCRAPE_SPEED_DEADZONE = 6;
const BASH_KNOCKBACK_DISTANCE_SCALE = 0.035;
const SCRAPE_KNOCKBACK_TRANSFER = 0.08;
const MIN_BASH_KNOCKBACK_DISTANCE = 1.1;
const MAX_KNOCKBACK_DISTANCE = 8.5;
const GROUNDED_UPWARD_KNOCKBACK_SCALE = 0.65;
const AIRBORNE_KNOCKBACK_VERTICAL_SCALE = 0.45;
const KNOCKBACK_VERTICAL_VELOCITY_SCALE = 0.18;
const MAX_KNOCKBACK_VERTICAL_VELOCITY = 18;
const MIN_DAMAGE_EVENT_AMOUNT = 0.025;
const CONTACT_RENEWAL_IMPULSE_MARGIN = 10;
const CONTACT_HYSTERESIS_TICKS = 5;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const STALK_FORWARD = new THREE.Vector3(0, 0, 1);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cloneVector(vector: { x: number; y: number; z: number }) {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function createContactKey(attacker: any, target: any, side: string) {
  return `${attacker.slot}:${target.slot}:${side}`;
}

function getImpactSite(target: any, contactSample: any) {
  if (contactSample?.surfacePoint) {
    return contactSample.surfacePoint.clone();
  }

  if (!contactSample?.center) {
    return target.position.clone();
  }

  const toSample = contactSample.center.clone().sub(target.position);
  if (toSample.lengthSq() <= DAMAGE_EPSILON) {
    return contactSample.center.clone();
  }

  return target.position.clone().addScaledVector(toSample.normalize(), target.bodyRadius);
}

function getContactSurfaceNormal(target: any, contactSample: any) {
  const normal = contactSample?.surfaceNormal?.clone()
    ?? contactSample?.center?.clone().sub(target.position)
    ?? new THREE.Vector3(1, 0, 0);

  if (normal.lengthSq() <= DAMAGE_EPSILON) {
    return new THREE.Vector3(1, 0, 0);
  }

  return normal.normalize();
}

function computeDamageKnockbackVector(
  target: any,
  surfaceNormal: THREE.Vector3,
  tangentVelocity: THREE.Vector3,
  bashImpulse: number,
  scrapeImpulse: number
) {
  const impulseVector = new THREE.Vector3();

  if (bashImpulse > 0) {
    impulseVector.addScaledVector(surfaceNormal, -bashImpulse);
  }

  if (scrapeImpulse > 0 && tangentVelocity.lengthSq() > DAMAGE_EPSILON) {
    impulseVector.addScaledVector(tangentVelocity.clone().normalize(), scrapeImpulse * SCRAPE_KNOCKBACK_TRANSFER);
  }

  if (target.grounded && impulseVector.y < 0) {
    impulseVector.y = 0;
  }

  if (impulseVector.lengthSq() <= DAMAGE_EPSILON) {
    return new THREE.Vector3();
  }

  const hasBash = bashImpulse > 0;
  const distance = clamp(
    impulseVector.length() * BASH_KNOCKBACK_DISTANCE_SCALE,
    hasBash ? MIN_BASH_KNOCKBACK_DISTANCE : 0,
    MAX_KNOCKBACK_DISTANCE
  );
  const knockback = impulseVector.normalize().multiplyScalar(distance);

  if (target.grounded && knockback.y > 0) {
    knockback.y *= GROUNDED_UPWARD_KNOCKBACK_SCALE;
  } else {
    knockback.y *= AIRBORNE_KNOCKBACK_VERTICAL_SCALE;
  }

  return knockback;
}

function computeImpactDamageDetails(attacker: any, target: any, stalk: any, contactSample: any, contactState: any = null) {
  const threshold = Math.max(0.0001, attacker.profile.impactThreshold);
  const radius = Math.max(0.0001, stalk.segmentRadius ?? STALK_SEGMENT_RADIUS);
  const massScale = clamp((radius / STALK_SEGMENT_RADIUS) ** 2, 0.25, 4);
  const surfaceNormal = getContactSurfaceNormal(target, contactSample);
  const sampleVelocity = contactSample?.velocity?.clone() ?? new THREE.Vector3();
  const targetVelocity = target.bodyVelocity ?? new THREE.Vector3();
  const attackerVelocity = attacker.bodyVelocity ?? new THREE.Vector3();
  const movementAssist = Math.max(0, -attackerVelocity.dot(surfaceNormal));
  const incidentVelocity = sampleVelocity
    .sub(targetVelocity)
    .addScaledVector(surfaceNormal, -movementAssist * attacker.profile.impactMomentumFactor);
  const impactSpeed = Math.max(0, -incidentVelocity.dot(surfaceNormal));
  const normalVelocity = surfaceNormal.clone().multiplyScalar(incidentVelocity.dot(surfaceNormal));
  const tangentVelocity = incidentVelocity.clone().sub(normalVelocity);
  const tangentSpeed = tangentVelocity.length();
  const bashImpulse = impactSpeed * (1 + STALK_EYE_BOUNCE_RESTITUTION) * massScale;
  const contactAlreadyActive = Boolean(contactState?.active && (contactState.peakBashImpulse ?? 0) > 0);
  const renewedBashImpulse = contactAlreadyActive
    ? bashImpulse > (contactState.peakBashImpulse + CONTACT_RENEWAL_IMPULSE_MARGIN)
    : true;
  const activeBashImpulse = renewedBashImpulse ? bashImpulse : 0;
  const scrapeImpulse = Math.max(0, tangentSpeed - SCRAPE_SPEED_DEADZONE) *
    STALK_EYE_BOUNCE_TANGENT_DAMPING *
    massScale;
  const damageMultiplier = getSnailDamageMultiplier(attacker.snailStats);
  const bashDamage = (activeBashImpulse / threshold) * BASH_DAMAGE_SCALE * damageMultiplier;
  const scrapeDamage = (scrapeImpulse / threshold) * SCRAPE_DAMAGE_SCALE * damageMultiplier;
  const amount = bashDamage + scrapeDamage;
  const knockback = computeDamageKnockbackVector(
    target,
    surfaceNormal,
    tangentVelocity,
    activeBashImpulse,
    scrapeImpulse
  );

  return {
    amount,
    impactImpulse: activeBashImpulse + scrapeImpulse,
    bashDamage,
    bashImpulse: activeBashImpulse,
    rawBashImpulse: bashImpulse,
    scrapeDamage,
    scrapeImpulse,
    rawScrapeImpulse: scrapeImpulse,
    impactSpeed,
    tangentSpeed,
    massScale,
    knockback
  };
}

function createDamageEvent({
  tick,
  attacker,
  target,
  side,
  contactSample,
  damageDetails,
  amount
}: any) {
  const detailScale = damageDetails.amount > 0
    ? Math.min(1, amount / damageDetails.amount)
    : 0;
  const bashDamage = damageDetails.bashDamage * detailScale;
  const scrapeDamage = damageDetails.scrapeDamage * detailScale;
  const hasBashDamage = bashDamage > 0;
  const hasScrapeDamage = scrapeDamage > 0;
  const knockback = damageDetails.knockback?.clone?.().multiplyScalar(detailScale) ?? null;

  const event: any = {
    id: `${tick}:damage:${attacker.slot}:${target.slot}:${side}`,
    type: 'damage',
    tick,
    attackerSlot: attacker.slot,
    targetSlot: target.slot,
    side,
    amount,
    measurement: hasBashDamage && hasScrapeDamage
      ? 'mixed'
      : (hasScrapeDamage ? 'scrape' : 'bash'),
    impactSpeed: damageDetails.impactSpeed,
    tangentSpeed: damageDetails.tangentSpeed,
    impactImpulse: damageDetails.impactImpulse,
    bashImpulse: damageDetails.bashImpulse,
    rawBashImpulse: damageDetails.rawBashImpulse,
    bashDamage,
    massScale: damageDetails.massScale,
    position: cloneVector(getImpactSite(target, contactSample))
  };

  if (knockback && knockback.lengthSq() > DAMAGE_EPSILON) {
    event.knockback = cloneVector(knockback);
  }

  if (damageDetails.scrapeImpulse > 0) {
    event.scrapeImpulse = damageDetails.scrapeImpulse;
    event.rawScrapeImpulse = damageDetails.rawScrapeImpulse;
  }

  if (scrapeDamage > 0) {
    event.scrapeDamage = scrapeDamage;
  }

  return event;
}

function getAnalyticStalkSample(stalk: any, delta: number, eyeRadius = STALK_SEGMENT_RADIUS * STALK_EYE_RADIUS_SCALE) {
  const previousTip = stalk.previousTipPosition ?? stalk.tipPosition;
  const safeDelta = Math.max(delta, 1 / 120);
  const movement = stalk.tipPosition.clone().sub(previousTip);
  const direction = movement.lengthSq() > DAMAGE_EPSILON
    ? movement.clone().normalize()
    : stalk.rootWorld
      ? stalk.tipPosition.clone().sub(stalk.rootWorld).normalize()
      : STALK_FORWARD.clone();

  return {
    index: 0,
    isEye: true,
    start: previousTip.clone(),
    end: stalk.tipPosition.clone(),
    center: stalk.tipPosition.clone(),
    velocity: movement.clone().divideScalar(safeDelta),
    radius: eyeRadius,
    direction: direction.lengthSq() > DAMAGE_EPSILON ? direction : STALK_FORWARD.clone(),
    length: movement.length()
  };
}

function canAnalyticStalkReachTarget(attacker: any, target: any) {
  const maximumReach = (
    attacker.bodyRadius +
    target.bodyRadius +
    (attacker.profile.stalkTotalLength * Math.max(1, attacker.profile.stalkReachMax)) +
    (attacker.profile.stalkSegmentRadius * STALK_EYE_RADIUS_SCALE) +
    0.5
  );

  return attacker.position.distanceToSquared(target.position) <= maximumReach * maximumReach;
}

function canAnalyticSampleHitTarget(sample: any, target: any) {
  const maximumDistance = target.bodyRadius + sample.radius + sample.length + 0.25;
  return sample.center.distanceToSquared(target.position) <= maximumDistance * maximumDistance;
}

export function applyImpactKnockbackToTarget({
  target,
  knockback,
  delta,
  terrainConfig,
  clampPlanarPosition,
  resolveWorldPropCollision
}: any) {
  if (
    !target ||
    target.staticBody ||
    target.fixtureKind ||
    knockback.lengthSq() <= DAMAGE_EPSILON
  ) {
    return;
  }

  const safeDelta = Math.max(delta, 0.0001);
  const originalPosition = target.position.clone();
  const hasVerticalLift = knockback.y > DAMAGE_EPSILON;

  target.position.add(knockback);
  clampPlanarPosition(target);
  resolveWorldPropCollision(target);

  if (hasVerticalLift) {
    target.grounded = false;
    target.supportKind = 'air';
    target.supportSurfaceId = null;
    target.supportNormal.copy(WORLD_UP);
    target.verticalVelocity = Math.max(
      target.verticalVelocity,
      clamp(
        knockback.y / safeDelta * KNOCKBACK_VERTICAL_VELOCITY_SCALE,
        0,
        MAX_KNOCKBACK_VERTICAL_VELOCITY
      )
    );
  } else if (target.grounded && target.supportKind === 'terrain') {
    target.position.y = getPlayerGroundHeight(target, terrainConfig);
  } else if (!target.grounded && Math.abs(knockback.y) > DAMAGE_EPSILON) {
    target.verticalVelocity = clamp(
      target.verticalVelocity + (knockback.y / safeDelta * KNOCKBACK_VERTICAL_VELOCITY_SCALE),
      -MAX_KNOCKBACK_VERTICAL_VELOCITY,
      MAX_KNOCKBACK_VERTICAL_VELOCITY
    );
  }

  const appliedDisplacement = target.position.clone().sub(originalPosition);
  if (appliedDisplacement.lengthSq() <= DAMAGE_EPSILON) {
    return;
  }

  translatePlayerAttachments(target, appliedDisplacement);
}

export function resolveImpactForPair({
  attacker,
  target,
  delta,
  tick,
  contactMemory,
  analyticStalkAuthority = false,
  terrainConfig,
  clampPlanarPosition,
  resolveWorldPropCollision
}: any) {
  const events: any[] = [];
  if (
    !attacker.connected ||
    !target.connected ||
    attacker.health <= 0 ||
    target.health <= 0
  ) {
    return events;
  }

  if (analyticStalkAuthority && !canAnalyticStalkReachTarget(attacker, target)) {
    return events;
  }

  let totalDamage = 0;
  let strongestImpact = attacker.impactPower;
  const pendingDamageEvents = [];

  for (const [side, stalk] of getStalkEntries(attacker)) {
    const eyeRadius = (stalk.segmentRadius ?? STALK_SEGMENT_RADIUS) * STALK_EYE_RADIUS_SCALE;
    const eyeSamples = analyticStalkAuthority
      ? (stalk.impactSamples ?? [getAnalyticStalkSample(stalk, delta, eyeRadius)])
      : buildStalkEyeSamples(
        stalk.incidentNodes ?? stalk.nodes,
        stalk.incidentPreviousNodes ?? stalk.previousNodes,
        delta,
        eyeRadius
      );

    if (analyticStalkAuthority && !eyeSamples.some((sample) => canAnalyticSampleHitTarget(sample, target))) {
      continue;
    }

    const impactResult = evaluateStalkImpact(
      eyeSamples,
      target.position,
      target.bodyRadius,
      attacker.bodyVelocity,
      attacker.profile.impactMomentumFactor,
      target.collisionShape
    );

    const contactKey = createContactKey(attacker, target, side);
    const contactState = contactMemory.get(contactKey) ?? {
      active: false,
      peakBashImpulse: 0,
      missedTicks: 0,
      featureId: null,
      normal: null
    };
    if (!impactResult.collision) {
      if (contactState.active || contactState.peakBashImpulse > 0) {
        contactState.missedTicks = (contactState.missedTicks ?? 0) + 1;
        if (contactState.missedTicks > CONTACT_HYSTERESIS_TICKS) {
          contactState.active = false;
          contactState.peakBashImpulse = 0;
          contactState.featureId = null;
          contactState.normal = null;
        }
        contactMemory.set(contactKey, contactState);
      }
    }

    const damageDetails = impactResult.collision
      ? computeImpactDamageDetails(attacker, target, stalk, impactResult.contactSample, contactState)
      : null;
    const measuredImpact = damageDetails
      ? damageDetails.impactImpulse
      : impactResult.impactPower;
    stalk.impactPower = measuredImpact;
    strongestImpact = Math.max(strongestImpact, measuredImpact);

    if (impactResult.collision) {
      contactState.active = true;
      contactState.missedTicks = 0;
      contactState.featureId = impactResult.contactSample.contactFeatureId ?? null;
      contactState.normal = clonePlainVector(impactResult.contactSample.surfaceNormal);
      contactState.peakBashImpulse = Math.max(
        contactState.peakBashImpulse,
        damageDetails.bashDamage >= MIN_DAMAGE_EVENT_AMOUNT
          ? damageDetails.rawBashImpulse
          : 0
      );
      contactMemory.set(contactKey, contactState);
    }

    if (
      impactResult.collision &&
      damageDetails.amount >= MIN_DAMAGE_EVENT_AMOUNT
    ) {
      totalDamage += damageDetails.amount;
      pendingDamageEvents.push({
        side,
        contactSample: impactResult.contactSample,
        damageDetails,
        amount: damageDetails.amount
      });
    }
  }

  attacker.impactPower = strongestImpact;

  if (totalDamage === 0) {
    return events;
  }

  const appliedDamage = target.immortal ? totalDamage : Math.min(target.health, totalDamage);
  if (!target.immortal) {
    target.health = Math.max(0, target.health - totalDamage);
  }

  const totalKnockback = new THREE.Vector3();
  let remainingVisibleDamage = appliedDamage;
  for (const pendingEvent of pendingDamageEvents) {
    if (pendingEvent.damageDetails.knockback) {
      totalKnockback.add(pendingEvent.damageDetails.knockback);
    }

    const visibleAmount = Math.min(pendingEvent.amount, remainingVisibleDamage);
    if (visibleAmount <= 0) {
      continue;
    }

    remainingVisibleDamage -= visibleAmount;
    events.push(createDamageEvent({
      tick,
      attacker,
      target,
      ...pendingEvent,
      amount: visibleAmount
    }));
  }

  applyImpactKnockbackToTarget({
    target,
    knockback: totalKnockback,
    delta,
    terrainConfig,
    clampPlanarPosition,
    resolveWorldPropCollision
  });

  return events;
}
