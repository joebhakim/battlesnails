export function clonePlainVector(vector: any) {
  return vector ? { x: vector.x, y: vector.y, z: vector.z } : null;
}

export function cloneCollisionShape(shape: any) {
  if (!shape) {
    return null;
  }

  return {
    ...shape,
    halfExtents: clonePlainVector(shape.halfExtents),
    points: Array.isArray(shape.points)
      ? shape.points.map((point) => ({
        x: point.x,
        z: point.z,
        ...(Number.isFinite(point.y) ? { y: point.y } : {})
      }))
      : shape.points,
    meshParts: Array.isArray(shape.meshParts)
      ? shape.meshParts.map((part) => ({
        ...part,
        center: clonePlainVector(part.center),
        start: clonePlainVector(part.start),
        end: clonePlainVector(part.end),
        halfExtents: clonePlainVector(part.halfExtents)
      }))
      : shape.meshParts
  };
}

export function getFixtureHalfHeight(fixture: any) {
  const shape = fixture.collisionShape ?? {};
  if (shape.type === 'box') {
    return Number.isFinite(shape.halfExtents?.y) ? shape.halfExtents.y : fixture.bodyRadius ?? 1;
  }

  if (shape.type === 'cylinder') {
    return Number.isFinite(shape.halfHeight)
      ? shape.halfHeight
      : Number.isFinite(shape.height)
        ? shape.height / 2
        : fixture.bodyRadius ?? 1;
  }

  return null;
}

export function getCollisionShapeHalfHeight(shape: any, fallback = 1) {
  if (shape?.type === 'visual_mesh' || shape?.type === 'triangle_mesh') {
    return Number.isFinite(shape.halfHeight) ? shape.halfHeight : fallback;
  }

  if (shape?.type === 'box') {
    return Number.isFinite(shape.halfExtents?.y) ? shape.halfExtents.y : fallback;
  }

  if (shape?.type === 'cylinder') {
    return Number.isFinite(shape.halfHeight)
      ? shape.halfHeight
      : Number.isFinite(shape.height)
        ? shape.height / 2
        : fallback;
  }

  if (shape?.type === 'polygon_prism') {
    return Number.isFinite(shape.halfHeight) ? shape.halfHeight : fallback;
  }

  return Number.isFinite(shape?.radius) ? shape.radius : fallback;
}

export function getCollisionShapeRadius(shape: any, fallback = 1) {
  if (Number.isFinite(shape?.meshRadius)) {
    return shape.meshRadius;
  }

  if (shape?.type === 'box') {
    const halfExtents = shape.halfExtents ?? {};
    return Math.hypot(halfExtents.x ?? fallback, halfExtents.z ?? fallback);
  }

  if (shape?.type === 'polygon_prism' && Array.isArray(shape.points)) {
    return shape.points.reduce((radius: number, point: any) => (
      Math.max(radius, Math.hypot(point.x ?? 0, point.z ?? 0))
    ), fallback);
  }

  return Number.isFinite(shape?.radius) ? shape.radius : fallback;
}
