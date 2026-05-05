const SQRT3 = Math.sqrt(3);

export const HEX_RING_ONE_COORDS = Object.freeze([
  Object.freeze({ q: 0, r: 0 }),
  Object.freeze({ q: 1, r: 0 }),
  Object.freeze({ q: 1, r: -1 }),
  Object.freeze({ q: 0, r: -1 }),
  Object.freeze({ q: -1, r: 0 }),
  Object.freeze({ q: -1, r: 1 }),
  Object.freeze({ q: 0, r: 1 })
]);

export function getFlatTopHexCenter(q: number, r: number, radius: number) {
  return {
    x: 1.5 * radius * q,
    z: SQRT3 * radius * (r + q / 2)
  };
}

export function createHexTile(q: number, r: number, radius: number) {
  const center = getFlatTopHexCenter(q, r, radius);
  return {
    id: `hex-${q}-${r}`,
    q,
    r,
    x: center.x,
    z: center.z,
    radius
  };
}

export function createHexRingOneTiles(radius: number) {
  return HEX_RING_ONE_COORDS.map((coord) => createHexTile(coord.q, coord.r, radius));
}

export function getHexDistance(q: number, r: number) {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
}

export function createHexRingTiles(radius: number, ringCount: number) {
  const safeRingCount = Math.max(0, Math.floor(ringCount));
  if (safeRingCount === 1) {
    return createHexRingOneTiles(radius);
  }

  const tiles = [];
  for (let q = -safeRingCount; q <= safeRingCount; q += 1) {
    for (let r = -safeRingCount; r <= safeRingCount; r += 1) {
      if (getHexDistance(q, r) <= safeRingCount) {
        tiles.push(createHexTile(q, r, radius));
      }
    }
  }

  return tiles.sort((left, right) => (
    getHexDistance(left.q, left.r) - getHexDistance(right.q, right.r) ||
    left.q - right.q ||
    left.r - right.r
  ));
}

export function getRegularHexVertices(center: any, radius: number, rotation = 0) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = rotation + (index / 6) * Math.PI * 2;
    return {
      x: center.x + Math.cos(angle) * radius,
      z: center.z + Math.sin(angle) * radius
    };
  });
}

export function isPointInsideRegularHex(x: number, z: number, center: any, radius: number, rotation = 0) {
  const dx = x - center.x;
  const dz = z - center.z;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const localX = (dx * cos) + (dz * sin);
  const localZ = (-dx * sin) + (dz * cos);
  const absX = Math.abs(localX);
  const absZ = Math.abs(localZ);
  const hexHeight = SQRT3 * radius * 0.5;

  return (
    absX <= radius &&
    absZ <= hexHeight &&
    ((SQRT3 * absX) + absZ) <= (SQRT3 * radius)
  );
}

function cross(origin: any, left: any, right: any) {
  return ((left.x - origin.x) * (right.z - origin.z)) - ((left.z - origin.z) * (right.x - origin.x));
}

export function getConvexHull(points: any[] = []) {
  const uniquePoints = Array.from(new Map(points.map((point) => [
    `${point.x.toFixed(6)}:${point.z.toFixed(6)}`,
    { x: point.x, z: point.z }
  ])).values()).sort((left, right) => left.x === right.x ? left.z - right.z : left.x - right.x);

  if (uniquePoints.length <= 2) {
    return uniquePoints;
  }

  const lower = [];
  for (const point of uniquePoints) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper = [];
  for (let index = uniquePoints.length - 1; index >= 0; index -= 1) {
    const point = uniquePoints[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function getWorldBoundsBoundaryPoints(bounds: any = {}) {
  if (Array.isArray(bounds.boundary) && bounds.boundary.length >= 3) {
    return bounds.boundary.map((point) => ({ x: point.x, z: point.z }));
  }

  if (bounds.shape === 'hex_cluster' && Array.isArray(bounds.tiles)) {
    return getConvexHull(bounds.tiles.flatMap((tile) => (
      getRegularHexVertices(tile, tile.radius ?? bounds.hexRadius ?? 1, bounds.rotation ?? 0)
    )));
  }

  if (bounds.shape === 'hex') {
    return getRegularHexVertices(
      { x: bounds.centerX ?? 0, z: bounds.centerZ ?? 0 },
      bounds.hexRadius ?? bounds.radius ?? 1,
      bounds.hexRotation ?? bounds.rotation ?? 0
    );
  }

  const radius = bounds.radius ?? 1;
  return Array.from({ length: 64 }, (_, index) => {
    const angle = (index / 64) * Math.PI * 2;
    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius
    };
  });
}

export function getWorldBoundsOuterRadius(bounds: any = {}) {
  const boundary = getWorldBoundsBoundaryPoints(bounds);
  return boundary.reduce((radius, point) => Math.max(radius, Math.hypot(point.x, point.z)), bounds.radius ?? 1);
}

export function getScaledBoundary(points: any[] = [], distance = 0) {
  return points.map((point) => {
    const length = Math.hypot(point.x, point.z);
    if (length <= 0.000001) {
      return { x: point.x, z: point.z };
    }

    const scale = (length + distance) / length;
    return {
      x: point.x * scale,
      z: point.z * scale
    };
  });
}

export function getWorldBoundsArea(bounds: any = {}) {
  if (bounds.shape === 'hex_cluster' && Array.isArray(bounds.tiles)) {
    const hexRadius = bounds.hexRadius ?? bounds.tiles[0]?.radius ?? 1;
    return bounds.tiles.length * ((3 * SQRT3) / 2) * hexRadius * hexRadius;
  }

  if (bounds.shape === 'hex') {
    const hexRadius = bounds.hexRadius ?? bounds.radius ?? 1;
    return ((3 * SQRT3) / 2) * hexRadius * hexRadius;
  }

  const radius = bounds.radius ?? 1;
  return Math.PI * radius * radius;
}

export function isPointInPolygon(point: any, polygon: any[] = []) {
  let inside = false;
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const intersects = ((current.z > point.z) !== (previous.z > point.z)) &&
      (point.x < ((previous.x - current.x) * (point.z - current.z)) / ((previous.z - current.z) || 0.000001) + current.x);
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

export function isPointInsideWorldBounds(x: number, z: number, bounds: any = {}) {
  if ((bounds.shape === 'polygon' || bounds.shape === 'coastal_hex_cluster') && Array.isArray(bounds.boundary)) {
    return isPointInPolygon({ x, z }, bounds.boundary);
  }

  if (bounds.shape === 'hex_cluster' && Array.isArray(bounds.tiles)) {
    return bounds.tiles.some((tile) => (
      isPointInsideRegularHex(x, z, tile, tile.radius ?? bounds.hexRadius ?? 1, bounds.rotation ?? 0)
    ));
  }

  if (bounds.shape === 'hex') {
    return isPointInsideRegularHex(
      x,
      z,
      { x: bounds.centerX ?? 0, z: bounds.centerZ ?? 0 },
      bounds.hexRadius ?? bounds.radius ?? 1,
      bounds.hexRotation ?? bounds.rotation ?? 0
    );
  }

  const radius = bounds.radius ?? 1;
  const centerX = bounds.centerX ?? 0;
  const centerZ = bounds.centerZ ?? 0;
  return Math.hypot(x - centerX, z - centerZ) <= radius;
}

export function getClosestPointOnSegment(point: any, start: any, end: any) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dz * dz;
  const alpha = lengthSq <= 0.000001
    ? 0
    : Math.min(1, Math.max(0, (((point.x - start.x) * dx) + ((point.z - start.z) * dz)) / lengthSq));

  return {
    x: start.x + dx * alpha,
    z: start.z + dz * alpha
  };
}

export function getDistanceToWorldBoundsBoundary(x: number, z: number, bounds: any = {}) {
  const boundary = getWorldBoundsBoundaryPoints(bounds);
  if (boundary.length < 2) {
    return Infinity;
  }

  const point = { x, z };
  let bestDistanceSq = Infinity;
  for (let index = 0; index < boundary.length; index += 1) {
    const start = boundary[index];
    const end = boundary[(index + 1) % boundary.length];
    const candidate = getClosestPointOnSegment(point, start, end);
    const distanceSq = ((candidate.x - x) ** 2) + ((candidate.z - z) ** 2);
    bestDistanceSq = Math.min(bestDistanceSq, distanceSq);
  }

  return Math.sqrt(bestDistanceSq);
}

export function clampPointToWorldBounds(x: number, z: number, bounds: any = {}) {
  if (isPointInsideWorldBounds(x, z, bounds)) {
    return { x, z };
  }

  const boundary = getWorldBoundsBoundaryPoints(bounds);
  if (boundary.length < 2) {
    return { x, z };
  }

  const point = { x, z };
  let bestPoint = boundary[0];
  let bestDistanceSq = Infinity;
  for (let index = 0; index < boundary.length; index += 1) {
    const start = boundary[index];
    const end = boundary[(index + 1) % boundary.length];
    const candidate = getClosestPointOnSegment(point, start, end);
    const distanceSq = ((candidate.x - x) ** 2) + ((candidate.z - z) ** 2);
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestPoint = candidate;
    }
  }

  return bestPoint;
}
