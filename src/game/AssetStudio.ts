import * as THREE from 'three';

import { shouldRenderWorldPropIndividually } from '../entities/WorldPropBatchActor.js';
import { DEFAULT_TERRAIN_CONFIG } from '../world/Terrain.js';
import {
  getGroundPatchSurfaceOffset,
  isPointInPolygon2D
} from '../world/GroundCoverSurface.js';
import {
  EXPLORER_DEFAULT_SEED,
  createExplorerWorld
} from '../world/ExplorerWorld.js';
import {
  createVisualMeshCollisionGeometry,
  isVisualMeshCollisionShape
} from '../entities/VisualCollisionMesh.js';

const DEFAULT_KIND = 'dry_leaf_patch';
const DEFAULT_VIEW = 'three-quarter';
const VALID_LODS = new Set(['near', 'far']);
const VALID_VIEWS = new Set(['three-quarter', 'top', 'side']);

function toInteger(value, fallback, min, max) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(numericValue)));
}

function toNumber(value, fallback, min, max) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numericValue));
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }

  return value === true || value === 'true' || value === '1' || value === 'yes';
}

function getShapeHalfHeight(prop) {
  const shape = prop.collisionShape ?? {};
  if (isVisualMeshCollisionShape(shape)) {
    return Number.isFinite(shape.halfHeight) ? shape.halfHeight : prop.bodyRadius ?? 1;
  }

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
    return shape.halfHeight ?? prop.bodyRadius ?? 1;
  }

  return shape.radius ?? prop.bodyRadius ?? 1;
}

function getFootprintRadius(prop) {
  const shape = prop.collisionShape ?? {};
  if (Number.isFinite(shape.meshRadius)) {
    return shape.meshRadius;
  }

  const footprint = prop.visual?.footprint ?? shape.points;
  if (Array.isArray(footprint) && footprint.length >= 3) {
    return footprint.reduce((radius, point) => (
      Math.max(radius, Math.hypot(point.x ?? 0, point.z ?? 0))
    ), 1);
  }

  if (shape.type === 'box') {
    return Math.hypot(shape.halfExtents?.x ?? 1, shape.halfExtents?.z ?? 1);
  }

  if (shape.type === 'cylinder' || shape.type === 'sphere') {
    return shape.meshRadius ?? shape.radius ?? prop.bodyRadius ?? 1;
  }

  return Math.max(shape.meshRadius ?? 0, prop.bodyRadius ?? 1, prop.visual?.radius ?? 1);
}

function getVisualHeight(prop) {
  const visual = prop.visual ?? {};
  return Math.max(
    getShapeHalfHeight(prop) * 2,
    visual.height ?? 0,
    (visual.stemHeight ?? 0) + (visual.capThickness ?? 0),
    visual.radius ? visual.radius * 2 : 0,
    visual.capRadius ? visual.capRadius * 1.1 : 0,
    0.5
  );
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeLod(value) {
  return VALID_LODS.has(value) ? value : 'near';
}

function normalizeView(value) {
  return VALID_VIEWS.has(value) ? value : DEFAULT_VIEW;
}

export function normalizeAssetStudioOptions(rawOptions: any = {}) {
  const seed = toInteger(rawOptions.seed, EXPLORER_DEFAULT_SEED, 0, Number.MAX_SAFE_INTEGER);
  const kind = String(rawOptions.kind ?? rawOptions.asset ?? DEFAULT_KIND);
  const rawIndex = rawOptions.index ?? rawOptions.n ?? 0;

  return {
    seed,
    kind,
    id: typeof rawOptions.id === 'string' ? rawOptions.id : null,
    index: toInteger(rawIndex, 0, 0, Number.MAX_SAFE_INTEGER),
    lod: normalizeLod(rawOptions.lod ?? rawOptions.detail),
    view: normalizeView(rawOptions.view),
    collision: toBoolean(rawOptions.collision ?? rawOptions.collisions ?? rawOptions.collisionMesh, false),
    labels: toBoolean(rawOptions.labels ?? rawOptions.label, false),
    rotationY: rawOptions.rotationY === undefined
      ? null
      : toNumber(rawOptions.rotationY, 0, -Math.PI * 2, Math.PI * 2),
    zoom: toNumber(rawOptions.zoom, 1, 0.25, 5)
  };
}

function selectAssetProp(world, options) {
  if (options.id) {
    const byId = world.props.find((prop) => prop.id === options.id);
    if (byId) {
      return {
        prop: byId,
        candidates: [byId],
        selectedIndex: 0
      };
    }
  }

  const candidates = world.props.filter((prop) => prop.kind === options.kind);
  const fallbackCandidates = candidates.length > 0 ? candidates : world.props;
  const selectedIndex = fallbackCandidates.length > 0
    ? options.index % fallbackCandidates.length
    : 0;

  return {
    prop: fallbackCandidates[selectedIndex] ?? null,
    candidates: fallbackCandidates,
    selectedIndex
  };
}

function createStudioProp(sourceProp, options) {
  const prop = cloneJson(sourceProp);
  const halfHeight = getShapeHalfHeight(prop);
  prop.id = `asset-studio-${sourceProp.id}`;
  prop.position = {
    x: 0,
    y: halfHeight,
    z: 0
  };
  if (Number.isFinite(options.rotationY)) {
    prop.rotationY = options.rotationY;
  }
  return prop;
}

function getCameraLayout(prop, options) {
  const radius = Math.max(1, getFootprintRadius(prop));
  const height = Math.max(0.5, getVisualHeight(prop));
  const frame = Math.max(radius, height * 0.55, 3) / options.zoom;
  const focusY = Math.max(0.25, Math.min(height * 0.42, height - 0.1));

  if (options.view === 'top') {
    return {
      position: new THREE.Vector3(0, Math.max(9, frame * 2.15 + height), 0.01),
      lookAt: new THREE.Vector3(0, 0, 0),
      near: 0.1,
      far: Math.max(6000, frame * 8)
    };
  }

  if (options.view === 'side') {
    return {
      position: new THREE.Vector3(frame * 1.65, Math.max(1.5, height * 0.42), frame * 0.05),
      lookAt: new THREE.Vector3(0, focusY, 0),
      near: 0.1,
      far: Math.max(6000, frame * 8)
    };
  }

  return {
    position: new THREE.Vector3(frame * 0.95, Math.max(2.5, height * 0.48 + frame * 0.32), frame * 1.45),
    lookAt: new THREE.Vector3(0, focusY, 0),
    near: 0.1,
    far: Math.max(6000, frame * 8)
  };
}

function getLodAnchor(prop, lod) {
  if (lod === 'far') {
    return new THREE.Vector3(10000, 0, 10000);
  }

  return new THREE.Vector3(prop.position.x, prop.position.y, prop.position.z);
}

function hideWorldPropLabels(game) {
  for (const actor of game.worldPropViews.values()) {
    if (actor.label) {
      actor.label.visible = false;
    }
  }
}

function setStudioSceneChrome(game) {
  const previousBackground = game.scene.scene.background;
  const previousGroundVisible = game.scene.ground?.visible ?? true;
  const previousGroundColor = game.scene.groundMaterial?.color?.clone?.() ?? null;
  game.scene.scene.background = new THREE.Color(0xa9b7ba);
  if (game.scene.ground) {
    game.scene.ground.visible = false;
  }
  if (game.scene.groundMaterial?.color) {
    game.scene.groundMaterial.color.setHex(0x6f7568);
  }
  return () => {
    game.scene.scene.background = previousBackground;
    if (game.scene.ground) {
      game.scene.ground.visible = previousGroundVisible;
    }
    if (previousGroundColor && game.scene.groundMaterial?.color) {
      game.scene.groundMaterial.color.copy(previousGroundColor);
    }
  };
}

function restoreExistingAssetStudio(game) {
  if (typeof game.assetStudioRestore !== 'function') {
    return;
  }

  const restore = game.assetStudioRestore;
  game.assetStudioRestore = null;
  restore();
}

function getPolygonBounds(points) {
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    maxX: Math.max(bounds.maxX, point.x),
    minZ: Math.min(bounds.minZ, point.z),
    maxZ: Math.max(bounds.maxZ, point.z)
  }), {
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity
  });
}

function createGroundPatchSupportSurfaceGeometry(prop, points) {
  const bounds = getPolygonBounds(points);
  const halfHeight = getShapeHalfHeight(prop);
  const width = Math.max(0.001, bounds.maxX - bounds.minX);
  const depth = Math.max(0.001, bounds.maxZ - bounds.minZ);
  const longest = Math.max(width, depth);
  const step = Math.max(0.55, longest / 44);
  const columns = Math.max(2, Math.ceil(width / step));
  const rows = Math.max(2, Math.ceil(depth / step));
  const positions = [];
  const indices = [];
  const vertexGrid = Array.from({ length: rows + 1 }, () => Array(columns + 1).fill(null));

  for (let row = 0; row <= rows; row += 1) {
    const z = bounds.minZ + (depth * row) / rows;
    for (let column = 0; column <= columns; column += 1) {
      const x = bounds.minX + (width * column) / columns;
      const point = { x, z };
      if (!isPointInPolygon2D(point, points)) {
        continue;
      }

      const surfaceOffset = getGroundPatchSurfaceOffset(prop, point, points);
      vertexGrid[row][column] = positions.length / 3;
      positions.push(x, -halfHeight + surfaceOffset, z);
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const topLeft = vertexGrid[row][column];
      const topRight = vertexGrid[row][column + 1];
      const bottomLeft = vertexGrid[row + 1][column];
      const bottomRight = vertexGrid[row + 1][column + 1];
      if (topLeft !== null && bottomLeft !== null && topRight !== null) {
        indices.push(topLeft, bottomLeft, topRight);
      }
      if (topRight !== null && bottomLeft !== null && bottomRight !== null) {
        indices.push(topRight, bottomLeft, bottomRight);
      }
    }
  }

  if (positions.length < 9 || indices.length < 3) {
    return createPolygonPrismCollisionVolumeGeometry(points, halfHeight);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createPolygonPrismCollisionVolumeGeometry(points, halfHeight) {
  const positions = [];
  const indices = [];
  const topYs = points.map((point) => (
    Number.isFinite(point.y) ? point.y : halfHeight
  ));
  const bottomY = Math.min(-halfHeight, ...topYs) - 0.02;

  for (const point of points) {
    positions.push(point.x, bottomY, point.z);
  }
  for (const [index, point] of points.entries()) {
    positions.push(point.x, topYs[index], point.z);
  }

  for (let index = 1; index < points.length - 1; index += 1) {
    indices.push(0, index + 1, index);
    indices.push(points.length, points.length + index, points.length + index + 1);
  }

  for (let index = 0; index < points.length; index += 1) {
    const nextIndex = index === points.length - 1 ? 0 : index + 1;
    indices.push(index, nextIndex, points.length + nextIndex);
    indices.push(index, points.length + nextIndex, points.length + index);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createCollisionGeometry(prop, lod = 'near') {
  const shape = prop.collisionShape ?? {};

  if (isVisualMeshCollisionShape(shape)) {
    return createVisualMeshCollisionGeometry(prop, { lod });
  }

  if (shape.type === 'sphere') {
    return new THREE.SphereGeometry(shape.radius ?? prop.bodyRadius ?? 1, 16, 10);
  }

  if (shape.type === 'cylinder') {
    const halfHeight = Number.isFinite(shape.halfHeight)
      ? shape.halfHeight
      : Number.isFinite(shape.height)
        ? shape.height / 2
        : prop.bodyRadius ?? 1;
    return new THREE.CylinderGeometry(
      shape.radius ?? prop.bodyRadius ?? 1,
      shape.radius ?? prop.bodyRadius ?? 1,
      halfHeight * 2,
      18,
      1
    );
  }

  if (shape.type === 'polygon_prism' && Array.isArray(shape.points) && shape.points.length >= 3) {
    return createGroundPatchSupportSurfaceGeometry(
      prop,
      shape.points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z))
    );
  }

  const halfExtents = shape.halfExtents ?? {
    x: prop.bodyRadius ?? 1,
    y: getShapeHalfHeight(prop),
    z: prop.bodyRadius ?? 1
  };
  return new THREE.BoxGeometry(
    (halfExtents.x ?? 1) * 2,
    (halfExtents.y ?? 1) * 2,
    (halfExtents.z ?? 1) * 2
  );
}

function createCapsuleObjects(part, fillMaterial, lineMaterial) {
  const start = new THREE.Vector3(part.start?.x ?? 0, part.start?.y ?? 0, part.start?.z ?? 0);
  const end = new THREE.Vector3(part.end?.x ?? 0, part.end?.y ?? 0, part.end?.z ?? 0);
  const axis = end.clone().sub(start);
  const length = axis.length();
  const radius = Math.max(0.001, part.radius ?? 0.1);
  const group = new THREE.Group();

  if (length > 0.001) {
    const cylinderGeometry = new THREE.CylinderGeometry(radius, radius, length, 8, 1);
    const cylinder = new THREE.Mesh(cylinderGeometry, fillMaterial);
    const cylinderEdges = new THREE.LineSegments(new THREE.EdgesGeometry(cylinderGeometry), lineMaterial);
    cylinder.position.copy(start).addScaledVector(axis, 0.5);
    cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
    cylinderEdges.position.copy(cylinder.position);
    cylinderEdges.quaternion.copy(cylinder.quaternion);
    group.add(cylinder, cylinderEdges);
  }

  for (const point of [start, end]) {
    const sphereGeometry = new THREE.SphereGeometry(radius, 8, 5);
    const sphere = new THREE.Mesh(sphereGeometry, fillMaterial);
    const sphereEdges = new THREE.LineSegments(new THREE.EdgesGeometry(sphereGeometry), lineMaterial);
    sphere.position.copy(point);
    sphereEdges.position.copy(point);
    group.add(sphere, sphereEdges);
  }

  return group;
}

function createCollisionPartObject(part, fillMaterial, lineMaterial) {
  if (part.type === 'capsule') {
    return createCapsuleObjects(part, fillMaterial, lineMaterial);
  }

  let geometry = null;
  if (part.type === 'sphere') {
    geometry = new THREE.SphereGeometry(part.radius ?? 1, 10, 6);
  } else if (part.type === 'cylinder') {
    geometry = new THREE.CylinderGeometry(
      part.radius ?? 1,
      part.radius ?? 1,
      (part.halfHeight ?? 1) * 2,
      10,
      1
    );
  } else if (part.type === 'box') {
    const halfExtents = part.halfExtents ?? { x: 1, y: 1, z: 1 };
    geometry = new THREE.BoxGeometry(
      (halfExtents.x ?? 1) * 2,
      (halfExtents.y ?? 1) * 2,
      (halfExtents.z ?? 1) * 2
    );
  }

  if (!geometry) {
    return null;
  }

  const object = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, fillMaterial);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), lineMaterial);
  const center = part.center ?? { x: 0, y: 0, z: 0 };
  object.position.set(center.x ?? 0, center.y ?? 0, center.z ?? 0);
  object.rotation.y = part.rotationY ?? 0;
  object.add(mesh, edges);
  return object;
}

function createRockLikeCollisionGeometry(prop, shape) {
  if (
    shape.type === 'sphere' &&
    ['rock', 'forest_rock', 'talus_rock', 'rock_cluster', 'gravel'].includes(prop.kind)
  ) {
    return new THREE.DodecahedronGeometry(shape.radius ?? prop.bodyRadius ?? 1, 0);
  }

  return null;
}

function createCollisionOverlay(prop, lod = 'near') {
  const fillMaterial = new THREE.MeshBasicMaterial({
    color: 0x18dfff,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xd8fbff,
    transparent: true,
    opacity: 0.92,
    depthTest: true
  });
  const group = new THREE.Group();
  group.position.set(prop.position.x, prop.position.y, prop.position.z);
  group.rotation.y = prop.rotationY ?? 0;

  const meshParts = Array.isArray(prop.collisionShape?.meshParts)
    ? prop.collisionShape.meshParts
    : [];
  if (!isVisualMeshCollisionShape(prop.collisionShape) && meshParts.length > 0) {
    for (const part of meshParts) {
      const object = createCollisionPartObject(part, fillMaterial, lineMaterial);
      if (object) {
        group.add(object);
      }
    }
  } else {
    const geometry = createRockLikeCollisionGeometry(prop, prop.collisionShape ?? {}) ?? createCollisionGeometry(prop, lod);
    const mesh = new THREE.Mesh(geometry, fillMaterial);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), lineMaterial);
    mesh.renderOrder = 30;
    edges.renderOrder = 31;
    group.add(mesh);
    group.add(edges);
  }

  group.traverse((node) => {
    node.frustumCulled = false;
    (node as any).renderOrder = (node as any).isLineSegments ? 31 : 30;
  });
  return group;
}

export function startAssetStudio(game, rawOptions: any = {}) {
  restoreExistingAssetStudio(game);
  const options = normalizeAssetStudioOptions(rawOptions);
  const world = createExplorerWorld(options.seed);
  const selection = selectAssetProp(world, options);
  if (!selection.prop) {
    throw new Error('Asset Studio could not find a generated world prop to render.');
  }

  const prop = createStudioProp(selection.prop, options);
  const localPlayerPosition = getLodAnchor(prop, options.lod);
  const renderMode = shouldRenderWorldPropIndividually(prop)
    ? options.lod === 'far'
      ? 'individual-far-proxy'
      : 'individual'
    : options.lod === 'far'
      ? 'batched-far'
      : 'batched-near';

  game.currentSession?.leave?.();
  game.currentSession = null;
  game.currentOverlayKey = null;
  game.hasRenderedMatchState = false;
  game.resetViewActors();
  game.ui?.hideStartMenu?.();
  game.ui?.clearMessage?.();
  game.ui?.hideTestPanel?.();
  game.ui?.hideSimulatorPanel?.();
  game.ui?.app?.classList?.add('asset-studio-active');
  game.mobileControls?.setEnabled?.(false);
  game.ui?.setMobileControlsVisible?.(false);
  game.ui?.updateStalkIndicators?.(null);
  game.ui?.setHealthLabels?.('Asset', prop.displayName ?? prop.kind);
  game.ui?.updatePlayerHealth?.(1, 1);
  game.ui?.updateEnemyHealth?.(0, 1);
  game.ui?.setInstructions?.('Asset Studio · URL params: asset/kind, id, index, seed, lod=near|far, view=three-quarter|top|side, collision=1');
  game.scene.setTerrainConfig(DEFAULT_TERRAIN_CONFIG);
  game.playerSnail?.setTerrainConfig?.(DEFAULT_TERRAIN_CONFIG);
  game.trailRenderer?.setTerrainConfig?.(DEFAULT_TERRAIN_CONFIG);
  game.playerSnail?.setVisible?.(false);
  const restoreSceneChrome = setStudioSceneChrome(game);

  game.syncWorldPropViews([prop], 0, localPlayerPosition);
  if (!options.labels) {
    hideWorldPropLabels(game);
  }

  const collisionOverlay = options.collision ? createCollisionOverlay(prop, options.lod) : null;
  if (collisionOverlay) {
    game.scene.scene.add(collisionOverlay);
  }
  const cameraLayout = getCameraLayout(prop, options);
  const previousCamera = {
    fov: game.camera.fov,
    near: game.camera.near,
    far: game.camera.far
  };
  game.cameraController?.setLockOnEnabled?.(false);
  game.camera.fov = 45;
  game.camera.position.copy(cameraLayout.position);
  game.camera.near = cameraLayout.near;
  game.camera.far = cameraLayout.far;
  game.camera.updateProjectionMatrix();
  game.camera.lookAt(cameraLayout.lookAt);
  game.resetPerformanceCounters?.();
  game.assetStudioRestore = () => {
    restoreSceneChrome();
    game.camera.fov = previousCamera.fov;
    game.camera.near = previousCamera.near;
    game.camera.far = previousCamera.far;
    game.camera.updateProjectionMatrix();
    if (collisionOverlay) {
      game.scene.scene.remove(collisionOverlay);
      collisionOverlay.traverse((node) => {
        const drawable = node as any;
        drawable.geometry?.dispose?.();
        if (Array.isArray(drawable.material)) {
          for (const material of drawable.material) {
            material?.dispose?.();
          }
        } else {
          drawable.material?.dispose?.();
        }
      });
    }
    game.ui?.app?.classList?.remove('asset-studio-active');
  };

  const state = {
    options,
    selected: {
      id: selection.prop.id,
      studioId: prop.id,
      kind: selection.prop.kind,
      displayName: selection.prop.displayName ?? selection.prop.kind,
      index: selection.selectedIndex,
      candidateCount: selection.candidates.length,
      sourcePosition: selection.prop.position,
      collisionShape: selection.prop.collisionShape,
      visual: selection.prop.visual
    },
    world: {
      seed: world.seed,
      worldgenVersion: world.worldgenVersion,
      propCount: world.props.length
    },
    renderMode,
    collisionOverlay: Boolean(collisionOverlay),
    camera: {
      position: cameraLayout.position.toArray(),
      lookAt: cameraLayout.lookAt.toArray()
    }
  };

  game.assetStudioState = state;
  return state;
}
