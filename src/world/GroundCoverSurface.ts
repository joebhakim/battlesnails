import * as THREE from 'three';

const EPSILON = 0.000001;
const GROUND_PATCH_MAX_SUPPORT_SLOPE = 1.8;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fract(value) {
  return value - Math.floor(value);
}

function hashNumber(value) {
  return fract(Math.sin(value * 127.1) * 43758.5453123);
}

function smoothstep01(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - (2 * t));
}

function getGroundPatchShapeHalfHeight(prop) {
  const shape = prop.collisionShape ?? {};
  if (shape.type === 'box') {
    return shape.halfExtents?.y ?? prop.bodyRadius ?? 1;
  }

  if (shape.type === 'cylinder') {
    return Number.isFinite(shape.halfHeight)
      ? shape.halfHeight
      : Number.isFinite(shape.height)
        ? shape.height / 2
        : prop.bodyRadius ?? 1;
  }

  if (shape.type === 'polygon_prism') {
    return Number.isFinite(shape.halfHeight) ? shape.halfHeight : prop.bodyRadius ?? 1;
  }

  return shape.radius ?? prop.bodyRadius ?? 1;
}

export function getPolygonPrismPoints(shape) {
  return Array.isArray(shape?.points)
    ? shape.points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z))
    : [];
}

export function isPointInPolygon2D(point, polygon) {
  let inside = false;
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const intersects = ((current.z > point.z) !== (previous.z > point.z)) &&
      (point.x < ((previous.x - current.x) * (point.z - current.z)) / ((previous.z - current.z) || EPSILON) + current.x);
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function getNearestPolygonEdgeSurface(point, polygon) {
  let best = null;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSq = dx * dx + dz * dz;
    if (lengthSq <= EPSILON) {
      continue;
    }

    const t = clamp((((point.x - start.x) * dx) + ((point.z - start.z) * dz)) / lengthSq, 0, 1);
    const x = start.x + dx * t;
    const z = start.z + dz * t;
    const distance = Math.hypot(point.x - x, point.z - z);
    if (!best || distance < best.distance) {
      const startY = Number.isFinite(start.y) ? start.y : null;
      const endY = Number.isFinite(end.y) ? end.y : null;
      best = {
        distance,
        y: startY !== null && endY !== null
          ? startY + (endY - startY) * t
          : null
      };
    }
  }

  return best;
}

export function getGroundPatchSurfaceOffset(prop, localPoint, points = getPolygonPrismPoints(prop.collisionShape ?? {})) {
  const shape = prop.collisionShape ?? {};
  const thickness = Math.max(
    0.01,
    prop.visual?.thickness ?? (Number.isFinite(shape.halfHeight) ? shape.halfHeight * 2 : 1)
  );
  const collisionRelief = Math.max(0, shape.relief ?? prop.visual?.relief ?? thickness * 0.25);
  const scaleLength = Math.max(0.5, shape.scaleLength ?? prop.visual?.scaleLength ?? 4);
  const scaleWidth = Math.max(0.5, shape.scaleWidth ?? prop.visual?.scaleWidth ?? 2);
  const grainAngle = prop.visual?.grainAngle ?? shape.grainAngle ?? 0;
  const alongX = Math.cos(grainAngle);
  const alongZ = Math.sin(grainAngle);
  const acrossX = -alongZ;
  const acrossZ = alongX;
  const u = (localPoint.x * alongX) + (localPoint.z * alongZ);
  const v = (localPoint.x * acrossX) + (localPoint.z * acrossZ);
  const row = Math.floor(v / scaleWidth);
  const rowPhase = hashNumber(row + (prop.id?.length ?? 0));
  const progress = fract((u / scaleLength) + rowPhase + (Math.abs(row) % 2) * 0.42);
  const lip = smoothstep01(progress);
  const rowLift = (hashNumber(row * 19.17 + 3.3) - 0.5) * collisionRelief * 0.2;
  const minimumSurfaceOffset = Math.max(0, shape.minSurfaceOffset ?? 0);
  const interiorOffset = Math.max(
    minimumSurfaceOffset,
    clamp(thickness * 0.58 + lip * collisionRelief + rowLift, thickness * 0.28, thickness + collisionRelief)
  );
  const edgeBlendInset = Math.max(0, shape.edgeBlendInset ?? prop.visual?.edgeBlendInset ?? 0);
  const edge = edgeBlendInset > 0 ? getNearestPolygonEdgeSurface(localPoint, points) : null;
  if (edge?.y !== null && Number.isFinite(edge?.y)) {
    const edgeOffset = edge.y + getGroundPatchShapeHalfHeight(prop);
    const interior = smoothstep01(edge.distance / edgeBlendInset);
    return edgeOffset + (interiorOffset - edgeOffset) * interior;
  }

  return interiorOffset;
}

export function getGroundPatchSupportNormal(prop, localPoint) {
  const step = Math.max(0.35, Math.min(1.2, (prop.visual?.scaleWidth ?? 3) * 0.18));
  const left = getGroundPatchSurfaceOffset(prop, { x: localPoint.x - step, z: localPoint.z });
  const right = getGroundPatchSurfaceOffset(prop, { x: localPoint.x + step, z: localPoint.z });
  const back = getGroundPatchSurfaceOffset(prop, { x: localPoint.x, z: localPoint.z - step });
  const forward = getGroundPatchSurfaceOffset(prop, { x: localPoint.x, z: localPoint.z + step });
  let slopeX = -(right - left) / (2 * step);
  let slopeZ = -(forward - back) / (2 * step);
  const slopeLength = Math.hypot(slopeX, slopeZ);
  if (slopeLength > GROUND_PATCH_MAX_SUPPORT_SLOPE) {
    const scale = GROUND_PATCH_MAX_SUPPORT_SLOPE / slopeLength;
    slopeX *= scale;
    slopeZ *= scale;
  }

  return new THREE.Vector3(slopeX, 1, slopeZ).normalize();
}
