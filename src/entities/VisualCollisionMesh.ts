import * as THREE from 'three';

import { createPropMesh } from './WorldPropActor.js';

const DEFAULT_NEAR_TRIANGLE_LIMIT = 520;
const DEFAULT_FAR_TRIANGLE_LIMIT = 96;
const CACHE = new WeakMap<object, Map<string, any>>();

function getTriangleLimit(prop, lod) {
  const shape = prop?.collisionShape ?? {};
  if (lod === 'far') {
    return Number.isFinite(shape.farTriangleLimit)
      ? shape.farTriangleLimit
      : DEFAULT_FAR_TRIANGLE_LIMIT;
  }

  return Number.isFinite(shape.nearTriangleLimit)
    ? shape.nearTriangleLimit
    : DEFAULT_NEAR_TRIANGLE_LIMIT;
}

export function isVisualMeshCollisionShape(shape) {
  return shape?.type === 'visual_mesh' || shape?.type === 'triangle_mesh';
}

function cloneTriangle(triangle, nextIndex) {
  return {
    index: nextIndex,
    a: triangle.a.clone(),
    b: triangle.b.clone(),
    c: triangle.c.clone(),
    normal: triangle.normal.clone(),
    center: triangle.center.clone(),
    radius: triangle.radius,
    area: triangle.area
  };
}

function simplifyTriangles(triangles, limit) {
  if (!Number.isFinite(limit) || limit <= 0 || triangles.length <= limit) {
    return triangles.map((triangle, index) => cloneTriangle(triangle, index));
  }

  const keep = triangles
    .map((triangle, originalIndex) => ({ triangle, originalIndex }))
    .sort((left, right) => {
      const areaDelta = right.triangle.area - left.triangle.area;
      return Math.abs(areaDelta) > 1e-9 ? areaDelta : left.originalIndex - right.originalIndex;
    })
    .slice(0, Math.max(1, Math.floor(limit)))
    .sort((left, right) => left.originalIndex - right.originalIndex);

  return keep.map(({ triangle }, index) => cloneTriangle(triangle, index));
}

function addTriangle(rawTriangles, a, b, c) {
  const edgeAB = b.clone().sub(a);
  const edgeAC = c.clone().sub(a);
  const cross = edgeAB.clone().cross(edgeAC);
  const area = cross.length() * 0.5;
  if (area <= 1e-8) {
    return;
  }

  const normal = cross.normalize();
  const center = a.clone().add(b).add(c).multiplyScalar(1 / 3);
  const radius = Math.max(
    center.distanceTo(a),
    center.distanceTo(b),
    center.distanceTo(c)
  );
  rawTriangles.push({
    index: rawTriangles.length,
    a,
    b,
    c,
    normal,
    center,
    radius,
    area
  });
}

function extractRawTriangles(prop) {
  const object = createPropMesh(prop);
  object.updateWorldMatrix(true, true);
  const triangles = [];

  object.traverse((node: any) => {
    if (!node.isMesh || !node.geometry?.getAttribute?.('position')) {
      return;
    }

    node.updateWorldMatrix(true, false);
    const geometry = node.geometry;
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex?.() ?? null;
    const readVertex = (vertexIndex) => new THREE.Vector3()
      .fromBufferAttribute(position, vertexIndex)
      .applyMatrix4(node.matrixWorld);

    if (index) {
      for (let item = 0; item < index.count; item += 3) {
        addTriangle(
          triangles,
          readVertex(index.getX(item)),
          readVertex(index.getX(item + 1)),
          readVertex(index.getX(item + 2))
        );
      }
      return;
    }

    for (let item = 0; item < position.count; item += 3) {
      addTriangle(
        triangles,
        readVertex(item),
        readVertex(item + 1),
        readVertex(item + 2)
      );
    }
  });

  object.traverse((node: any) => {
    node.geometry?.dispose?.();
    if (Array.isArray(node.material)) {
      for (const material of node.material) {
        material?.dispose?.();
      }
    } else {
      node.material?.dispose?.();
    }
  });

  return triangles;
}

function buildMesh(prop, lod = 'near') {
  const rawTriangles = extractRawTriangles(prop);
  const triangles = simplifyTriangles(rawTriangles, getTriangleLimit(prop, lod));
  const bounds = {
    min: new THREE.Vector3(Infinity, Infinity, Infinity),
    max: new THREE.Vector3(-Infinity, -Infinity, -Infinity)
  };
  let radius = 0;

  for (const triangle of triangles) {
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      bounds.min.min(point);
      bounds.max.max(point);
      radius = Math.max(radius, Math.hypot(point.x, point.z));
    }
  }

  if (triangles.length === 0) {
    const shape = prop.collisionShape ?? {};
    const fallbackRadius = shape.radius ?? shape.meshRadius ?? prop.bodyRadius ?? 1;
    const fallbackHalfHeight = shape.halfHeight ?? shape.radius ?? prop.bodyRadius ?? 1;
    bounds.min.set(-fallbackRadius, -fallbackHalfHeight, -fallbackRadius);
    bounds.max.set(fallbackRadius, fallbackHalfHeight, fallbackRadius);
    radius = fallbackRadius;
  }

  return {
    lod,
    triangles,
    bounds,
    radius,
    halfHeight: Math.max(Math.abs(bounds.min.y), Math.abs(bounds.max.y))
  };
}

export function getVisualCollisionMesh(prop, { lod = 'near' } = {}) {
  if (prop?.collisionShape?.type === 'triangle_mesh' && Array.isArray(prop.collisionShape.triangles)) {
    return {
      lod,
      triangles: prop.collisionShape.triangles,
      bounds: prop.collisionShape.bounds ?? {
        min: new THREE.Vector3(
          -(prop.collisionShape.radius ?? prop.bodyRadius ?? 1),
          -(prop.collisionShape.halfHeight ?? prop.bodyRadius ?? 1),
          -(prop.collisionShape.radius ?? prop.bodyRadius ?? 1)
        ),
        max: new THREE.Vector3(
          prop.collisionShape.radius ?? prop.bodyRadius ?? 1,
          prop.collisionShape.halfHeight ?? prop.bodyRadius ?? 1,
          prop.collisionShape.radius ?? prop.bodyRadius ?? 1
        )
      },
      radius: prop.collisionShape.radius ?? prop.bodyRadius ?? 1,
      halfHeight: prop.collisionShape.halfHeight ?? prop.bodyRadius ?? 1
    };
  }

  let byLod = CACHE.get(prop);
  if (!byLod) {
    byLod = new Map();
    CACHE.set(prop, byLod);
  }

  if (!byLod.has(lod)) {
    byLod.set(lod, buildMesh(prop, lod));
  }

  return byLod.get(lod);
}

export function createTriangleMeshShapeFromProp(prop, { lod = 'near' } = {}) {
  const mesh = getVisualCollisionMesh(prop, { lod });
  return {
    type: 'triangle_mesh',
    radius: mesh.radius,
    halfHeight: mesh.halfHeight,
    triangles: mesh.triangles,
    bounds: mesh.bounds
  };
}

export function createVisualMeshCollisionGeometry(prop, { lod = 'near' } = {}) {
  const mesh = getVisualCollisionMesh(prop, { lod });
  const positions = [];

  for (const triangle of mesh.triangles) {
    positions.push(
      triangle.a.x, triangle.a.y, triangle.a.z,
      triangle.b.x, triangle.b.y, triangle.b.z,
      triangle.c.x, triangle.c.y, triangle.c.z
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function closestPointOnTriangle(point, a, b, c) {
  const ab = b.clone().sub(a);
  const ac = c.clone().sub(a);
  const ap = point.clone().sub(a);
  const d1 = ab.dot(ap);
  const d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) {
    return a.clone();
  }

  const bp = point.clone().sub(b);
  const d3 = ab.dot(bp);
  const d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) {
    return b.clone();
  }

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return a.clone().addScaledVector(ab, v);
  }

  const cp = point.clone().sub(c);
  const d5 = ab.dot(cp);
  const d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) {
    return c.clone();
  }

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return a.clone().addScaledVector(ac, w);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return b.clone().addScaledVector(c.clone().sub(b), w);
  }

  const denominator = 1 / (va + vb + vc);
  const v = vb * denominator;
  const w = vc * denominator;
  return a.clone().addScaledVector(ab, v).addScaledVector(ac, w);
}

export function findClosestTriangleContact(localPoint, triangles, maximumDistance = Infinity) {
  let best = null;
  let bestDistanceSquared = maximumDistance * maximumDistance;

  for (const triangle of triangles) {
    const centerDistance = localPoint.distanceTo(triangle.center);
    if (centerDistance > maximumDistance + triangle.radius) {
      continue;
    }

    const closestPoint = closestPointOnTriangle(localPoint, triangle.a, triangle.b, triangle.c);
    const delta = localPoint.clone().sub(closestPoint);
    const distanceSquared = delta.lengthSq();
    if (distanceSquared > bestDistanceSquared) {
      continue;
    }

    const normal = distanceSquared > 1e-10
      ? delta.clone().normalize()
      : triangle.normal.clone();
    if (normal.dot(triangle.normal) < 0) {
      normal.multiplyScalar(-1);
    }

    bestDistanceSquared = distanceSquared;
    best = {
      triangle,
      point: closestPoint,
      normal,
      distance: Math.sqrt(distanceSquared),
      distanceSquared
    };
  }

  return best;
}
