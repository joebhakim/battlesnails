import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { createPropMesh } from './WorldPropActor.js';

const BATCH_CHUNK_SIZE = 340;
const FAR_BATCH_CHUNK_SIZE = 760;
const GROUND_DETAIL_DISTANCE = 165;
const CLUTTER_DETAIL_DISTANCE = 225;
const TREE_DETAIL_DISTANCE = 330;
const INDIVIDUAL_RENDER_KINDS = new Set([
  'dew_bead',
  'dew_pool',
  'rotting_log',
  'shell_shard',
  'sharp_grit',
  'soft_food'
]);
const GROUND_COVER_KINDS = new Set([
  'dry_leaf_patch',
  'moss_mat',
  'dirt_stick_patch',
  'rock_floor_patch'
]);
const TREE_LOD_KINDS = new Set([
  'deciduous_tree',
  'conifer_tree'
]);
const ALWAYS_RENDER_KINDS = new Set([
  'giant_tree',
  'rock_spire'
]);

function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < `${text}`.length; index += 1) {
    hash ^= `${text}`.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function hashUnit(seed, index) {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453123;
  return value - Math.floor(value);
}

function getChunkKey(position, chunkSize = BATCH_CHUNK_SIZE) {
  return `${Math.floor(position.x / chunkSize)},${Math.floor(position.z / chunkSize)}`;
}

function getVisibilityChunkKey(position, visibilityMode) {
  if (visibilityMode === 'groundFar' || visibilityMode === 'treeFar' || visibilityMode === 'clutterFar') {
    return `far:${getChunkKey(position, FAR_BATCH_CHUNK_SIZE)}`;
  }

  return `detail:${getChunkKey(position)}`;
}

function getBatchMaterialKey(material) {
  return [
    material.flatShading ? 'flat' : 'smooth',
    material.side ?? THREE.FrontSide
  ].join(':');
}

function createBatchMaterial(material) {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: Number.isFinite(material.roughness) ? material.roughness : 0.9,
    metalness: Number.isFinite(material.metalness) ? material.metalness : 0.03,
    flatShading: Boolean(material.flatShading),
    side: material.side ?? THREE.FrontSide
  });
}

function createGroundFarMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.99,
    metalness: 0.02,
    flatShading: true,
    side: THREE.DoubleSide
  });
}

function createFarTreeObject(prop) {
  const radius = prop.visual?.trunkRadius ?? prop.visual?.radius ?? prop.collisionShape?.radius ?? 4;
  const canopyRadius = prop.visual?.canopyRadius ?? radius * 4;
  const height = prop.visual?.height ?? (prop.collisionShape?.halfHeight ?? 16) * 2;
  const treeType = prop.visual?.treeType ?? 'deciduous';
  const group = new THREE.Group();
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x4b3828,
    roughness: 0.98,
    metalness: 0.02,
    flatShading: true
  });
  const canopyMaterial = new THREE.MeshStandardMaterial({
    color: treeType === 'conifer' ? 0x234a35 : 0x355f36,
    roughness: 0.96,
    metalness: 0.02,
    flatShading: true
  });
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.86, radius, height * 0.88, 5),
    trunkMaterial
  );
  group.add(trunk);

  if (treeType === 'conifer') {
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(canopyRadius * 0.92, height * 0.72, 7),
      canopyMaterial
    );
    canopy.position.y = height * 0.16;
    group.add(canopy);
  } else {
    const canopy = new THREE.Mesh(
      new THREE.IcosahedronGeometry(canopyRadius * 0.9, 0),
      canopyMaterial
    );
    canopy.position.y = height * 0.34;
    canopy.scale.y = 1.15;
    group.add(canopy);
  }

  return group;
}

function createFarMaterial(color, roughness = 0.96) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.02,
    flatShading: true
  });
}

function getFarRadius(prop) {
  return Math.max(
    0.08,
    prop.visual?.radius ??
      prop.visual?.capRadius ??
      prop.visual?.collisionRadius ??
      prop.collisionShape?.radius ??
      prop.collisionShape?.meshRadius ??
      prop.bodyRadius ??
      1
  );
}

function getFarLength(prop) {
  const shape = prop.collisionShape ?? {};
  const shapeLength = Number.isFinite(shape.halfExtents?.x) ? shape.halfExtents.x * 2 : null;
  return Math.max(
    0.12,
    prop.visual?.length ??
      shapeLength ??
      getFarRadius(prop) * 2
  );
}

function getFarWidth(prop) {
  const shape = prop.collisionShape ?? {};
  const shapeWidth = Number.isFinite(shape.halfExtents?.z) ? shape.halfExtents.z * 2 : null;
  return Math.max(
    0.08,
    prop.visual?.width ??
      shapeWidth ??
      getFarRadius(prop) * 1.2
  );
}

function getFarHeight(prop) {
  const shape = prop.collisionShape ?? {};
  return Math.max(
    0.08,
    prop.visual?.height ??
      ((shape.halfHeight ?? shape.radius ?? prop.bodyRadius ?? getFarRadius(prop)) * 2)
  );
}

function createFarEllipsoid(radius, height, color, roughness = 0.96) {
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius, 0),
    createFarMaterial(color, roughness)
  );
  mesh.scale.y = Math.max(0.18, height / Math.max(0.001, radius * 2));
  return mesh;
}

function createFarHorizontalCylinder(length, radius, color, radialSegments = 5) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, radialSegments),
    createFarMaterial(color, 0.98)
  );
  mesh.rotation.z = Math.PI / 2;
  return mesh;
}

function createFarClutterObject(prop) {
  const radius = getFarRadius(prop);
  const height = getFarHeight(prop);
  const group = new THREE.Group();

  switch (prop.kind) {
    case 'ant_trail': {
      const road = new THREE.Mesh(
        new THREE.BoxGeometry(getFarLength(prop), Math.max(0.025, height * 0.18), getFarWidth(prop)),
        createFarMaterial(0x2c211b, 0.99)
      );
      group.add(road);
      break;
    }
    case 'bamboo_stick':
      group.add(createFarHorizontalCylinder(getFarLength(prop), Math.max(radius, 0.08), 0x8f9857, 5));
      break;
    case 'fallen_branch':
    case 'root_branch':
    case 'rotting_log':
    case 'twig':
      group.add(createFarHorizontalCylinder(getFarLength(prop), Math.max(radius, 0.08), prop.visual?.color ?? 0x4a3020, 5));
      break;
    case 'dew_bead':
      group.add(createFarEllipsoid(radius, radius * 1.7, 0xa6e7ff, 0.35));
      break;
    case 'dew_pool': {
      const pool = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 0.94, Math.max(0.035, height), 8),
        createFarMaterial(0x7fdcff, 0.35)
      );
      group.add(pool);
      break;
    }
    case 'forest_rock':
    case 'gravel':
    case 'rock':
    case 'rock_cluster':
    case 'talus_rock':
      group.add(new THREE.Mesh(
        new THREE.DodecahedronGeometry(radius, 0),
        createFarMaterial(prop.visual?.color ?? 0x686761, 0.98)
      ));
      break;
    case 'lichen_tower': {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.68, radius, height, 5),
        createFarMaterial(prop.visual?.color ?? 0xa7b86a, 0.97)
      );
      const cap = createFarEllipsoid(radius * 1.25, radius * 1.15, 0xd2d89a, 0.94);
      cap.position.y = height * 0.46;
      group.add(trunk, cap);
      break;
    }
    case 'moss_cushion': {
      const cushion = createFarEllipsoid(radius, radius * 0.68, 0x4d8f4f, 0.99);
      cushion.position.y = -radius * 0.16;
      group.add(cushion);
      break;
    }
    case 'mushroom': {
      const capRadius = prop.visual?.capRadius ?? radius;
      const stemHeight = prop.visual?.stemHeight ?? height * 0.72;
      const capThickness = prop.visual?.capThickness ?? Math.max(0.08, capRadius * 0.35);
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(capRadius * 0.16, capRadius * 0.22, stemHeight, 5),
        createFarMaterial(0xd8c7a0, 0.94)
      );
      stem.position.y = -height * 0.22;
      const cap = createFarEllipsoid(capRadius, capThickness, prop.visual?.color ?? 0xb64d48, 0.84);
      cap.position.y = height * 0.28;
      group.add(stem, cap);
      break;
    }
    case 'salt_cone': {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(radius, height, 6),
        createFarMaterial(0xe8e3cc, 0.82)
      );
      group.add(cone);
      break;
    }
    case 'sharp_grit':
      group.add(new THREE.Mesh(
        new THREE.TetrahedronGeometry(radius * 1.25, 0),
        createFarMaterial(prop.visual?.color ?? 0xc8bd98, 0.9)
      ));
      break;
    case 'shell_shard': {
      const shard = new THREE.Mesh(
        new THREE.BoxGeometry(getFarLength(prop), Math.max(0.025, height * 0.5), getFarWidth(prop)),
        createFarMaterial(prop.visual?.color ?? 0xd6c8a2, 0.86)
      );
      shard.rotation.z = 0.16;
      group.add(shard);
      break;
    }
    case 'shrub': {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.045, radius * 0.075, height * 0.62, 4),
        createFarMaterial(0x45301f, 0.98)
      );
      trunk.position.y = -height * 0.14;
      const leafA = createFarEllipsoid(radius * 0.72, height * 0.46, prop.visual?.color ?? 0x4f6f39, 0.95);
      leafA.position.set(-radius * 0.12, height * 0.18, 0);
      const leafB = createFarEllipsoid(radius * 0.58, height * 0.38, 0x5b773d, 0.95);
      leafB.position.set(radius * 0.32, height * 0.04, radius * 0.14);
      group.add(trunk, leafA, leafB);
      break;
    }
    case 'soft_food': {
      const food = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 0.86, Math.max(0.05, height), 7),
        createFarMaterial(prop.visual?.color ?? 0x9f6b38, 0.98)
      );
      group.add(food);
      break;
    }
    case 'sprout': {
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.7, radius * 1.2, height, 4),
        createFarMaterial(0x35632e, 0.94)
      );
      const leaf = createFarEllipsoid(Math.max(radius * 3.2, height * 0.14), Math.max(radius, height * 0.05), prop.visual?.color ?? 0x4f8b3d, 0.92);
      leaf.position.y = height * 0.32;
      leaf.rotation.z = 0.52;
      group.add(stem, leaf);
      break;
    }
    default:
      group.add(createFarEllipsoid(radius, height, prop.visual?.color ?? 0x777777, 0.96));
      break;
  }

  return group;
}

function getMeshMaterial(mesh) {
  if (Array.isArray(mesh.material)) {
    return mesh.material[0] ?? null;
  }

  return mesh.material ?? null;
}

function ensureVertexColors(geometry, material) {
  const position = geometry.getAttribute('position');
  if (!position) {
    return false;
  }

  if (geometry.getAttribute('color')) {
    return true;
  }

  const color = material.color instanceof THREE.Color
    ? material.color
    : new THREE.Color(0xffffff);
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return true;
}

function normalizeGeometryForBatch(mesh, material) {
  const cloned = mesh.geometry.clone();
  cloned.applyMatrix4(mesh.matrixWorld);
  const geometry = cloned.index ? cloned.toNonIndexed() : cloned;

  if (geometry !== cloned) {
    cloned.dispose();
  }

  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('uv1');
  geometry.deleteAttribute('uv2');
  geometry.deleteAttribute('tangent');

  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals();
  }

  if (!ensureVertexColors(geometry, material)) {
    geometry.dispose();
    return null;
  }

  return geometry;
}

function getShapeHalfHeight(prop) {
  const shape = prop.collisionShape ?? {};
  if (shape.type === 'visual_mesh') {
    return shape.halfHeight ?? prop.bodyRadius ?? 1;
  }

  if (shape.type === 'box') {
    return shape.halfExtents?.y ?? prop.bodyRadius ?? 1;
  }

  if (shape.type === 'polygon_prism') {
    return shape.halfHeight ?? prop.bodyRadius ?? 1;
  }

  if (shape.type === 'cylinder') {
    return Number.isFinite(shape.halfHeight)
      ? shape.halfHeight
      : Number.isFinite(shape.height)
        ? shape.height / 2
        : prop.bodyRadius ?? 1;
  }

  return prop.bodyRadius ?? 1;
}

function getGroundCoverPalette(prop) {
  if (prop.kind === 'moss_mat') {
    return [0x244b36, 0x3f7c43, 0x4d8f4f, 0x5fa64d, 0x6dad50].map((color) => new THREE.Color(color));
  }

  if (prop.kind === 'dirt_stick_patch') {
    return [0x2f2117, 0x4a3020, 0x5a3924, 0x6a3f25, 0x3b2a1e].map((color) => new THREE.Color(color));
  }

  if (prop.kind === 'rock_floor_patch') {
    return [0x8a846f, 0xa39b84, 0xb8ad90, 0xcfc3a2, 0xd9cfb5].map((color) => new THREE.Color(color));
  }

  return [0x3f2f20, 0x573a22, 0x6f4a28, 0x8a6233, 0x2f241a].map((color) => new THREE.Color(color));
}

function getGroundCoverFootprint(prop) {
  const footprint = prop.visual?.footprint ?? prop.collisionShape?.points;
  if (Array.isArray(footprint) && footprint.length >= 3) {
    return footprint.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z));
  }

  const length = prop.visual?.length ?? (prop.collisionShape?.halfExtents?.x ?? 2) * 2;
  const width = prop.visual?.width ?? (prop.collisionShape?.halfExtents?.z ?? 2) * 2;
  return [
    { x: -length / 2, z: -width / 2 },
    { x: length / 2, z: -width / 2 },
    { x: length / 2, z: width / 2 },
    { x: -length / 2, z: width / 2 }
  ];
}

function getBatchVisibilityMode(prop) {
  if (GROUND_COVER_KINDS.has(prop.kind)) {
    return 'groundDetail';
  }

  if (TREE_LOD_KINDS.has(prop.kind)) {
    return 'treeDetail';
  }

  if (ALWAYS_RENDER_KINDS.has(prop.kind)) {
    return 'always';
  }

  return 'clutterDetail';
}

function createSimplifiedGroundCoverGeometry(prop) {
  const points = getGroundCoverFootprint(prop);
  if (points.length < 3) {
    return null;
  }

  const seed = hashText(prop.id ?? prop.kind ?? 'ground-cover');
  const halfHeight = getShapeHalfHeight(prop);
  const thickness = prop.visual?.thickness ?? halfHeight * 0.8;
  const relief = prop.visual?.relief ?? thickness * 0.5;
  const rotationY = prop.rotationY ?? 0;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const center = points.reduce((sum, point) => ({
    x: sum.x + point.x / points.length,
    z: sum.z + point.z / points.length,
    y: sum.y + ((Number.isFinite(point.y) ? point.y : 0) / points.length)
  }), { x: 0, z: 0, y: 0 });
  const palette = getGroundCoverPalette(prop);
  const positions = [];
  const colors = [];

  function pushPoint(point, vertexIndex) {
    const jitter = (hashUnit(seed + vertexIndex * 17, vertexIndex) - 0.5) * relief * 0.36;
    const x = prop.position.x + point.x * cos - point.z * sin;
    const z = prop.position.z + point.x * sin + point.z * cos;
    const y = Number.isFinite(point.y)
      ? prop.position.y + point.y
      : prop.position.y + center.y + relief * 0.12 + jitter;
    positions.push(x, y, z);
    const color = (palette[Math.floor(hashUnit(seed + 31, vertexIndex) * palette.length)] ?? palette[0]).clone();
    const grain = (
      Math.sin(x * 0.071 + z * 0.113 + seed * 0.0009) * 0.55 +
      Math.cos(x * 0.137 - z * 0.059 + vertexIndex * 1.73) * 0.45
    );
    color.offsetHSL(
      (hashUnit(seed + 67, vertexIndex) - 0.5) * 0.018,
      0.04 + hashUnit(seed + 73, vertexIndex) * 0.08,
      grain * 0.075 + (hashUnit(seed + 53, vertexIndex) - 0.5) * 0.14
    );
    colors.push(color.r, color.g, color.b);
  }

  for (let index = 0; index < points.length; index += 1) {
    const nextIndex = index === points.length - 1 ? 0 : index + 1;
    pushPoint(center, index * 3);
    pushPoint(points[nextIndex], index * 3 + 1);
    pushPoint(points[index], index * 3 + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function disposeMaterial(material) {
  if (Array.isArray(material)) {
    for (const item of material) {
      item?.dispose?.();
    }
    return;
  }

  material?.dispose?.();
}

function disposeObjectResources(object) {
  const materials = new Set<any>();
  object.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    node.geometry?.dispose?.();
    if (Array.isArray(node.material)) {
      for (const material of node.material) {
        if (material) {
          materials.add(material);
        }
      }
    } else if (node.material) {
      materials.add(node.material);
    }
  });

  for (const material of materials) {
    material.dispose?.();
  }
}

export function shouldRenderWorldPropIndividually(prop) {
  return INDIVIDUAL_RENDER_KINDS.has(prop.kind);
}

export class WorldPropBatchActor {
  declare mesh: any;
  declare chunkRecords: any;
  declare sourceMeshCount: any;
  declare batchMeshCount: any;
  declare skippedMeshCount: any;
  constructor(entries) {
    this.mesh = new THREE.Group();
    this.mesh.name = 'static-world-prop-batches';
    this.chunkRecords = new Map();
    this.sourceMeshCount = 0;
    this.batchMeshCount = 0;
    this.skippedMeshCount = 0;
    this.rebuild(entries);
  }

  getChunkRecord(chunkKey, position) {
    let record = this.chunkRecords.get(chunkKey);
    if (!record) {
      record = {
        center: new THREE.Vector3(position.x, position.y, position.z),
        bounds: new THREE.Box3(),
        detailMeshes: [],
        farMeshes: [],
        clutterDetailMeshes: [],
        treeDetailMeshes: [],
        treeFarMeshes: [],
        clutterFarMeshes: []
      };
      this.chunkRecords.set(chunkKey, record);
    } else {
      record.center.lerp(new THREE.Vector3(position.x, position.y, position.z), 0.18);
    }
    return record;
  }

  addDistanceMesh(record, visibilityMode, mesh) {
    if (mesh.geometry?.boundingBox) {
      record.bounds.union(mesh.geometry.boundingBox);
    }

    if (visibilityMode === 'groundDetail') {
      record.detailMeshes.push(mesh);
    } else if (visibilityMode === 'groundFar') {
      record.farMeshes.push(mesh);
    } else if (visibilityMode === 'clutterDetail') {
      record.clutterDetailMeshes.push(mesh);
    } else if (visibilityMode === 'treeDetail') {
      record.treeDetailMeshes.push(mesh);
    } else if (visibilityMode === 'treeFar') {
      record.treeFarMeshes.push(mesh);
    } else if (visibilityMode === 'clutterFar') {
      record.clutterFarMeshes.push(mesh);
    }
  }

  getBucket(buckets, key, materialFactory, chunkKey, position, visibilityMode) {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        geometries: [],
        material: materialFactory(),
        chunkKey,
        visibilityMode,
        position
      };
      buckets.set(key, bucket);
    }
    return bucket;
  }

  rebuild(entries) {
    const buckets = new Map();

    for (const { prop, actor = null, farOnly = false } of entries) {
      const detailVisibilityMode = getBatchVisibilityMode(prop);
      const body = farOnly ? null : actor?.body ?? createPropMesh(prop);
      const root = actor?.mesh ?? body;

      if (body) {
        if (actor) {
          root.updateWorldMatrix(true, true);
        } else {
          root.position.set(prop.position.x, prop.position.y, prop.position.z);
          root.rotation.y = prop.rotationY ?? 0;
          root.updateWorldMatrix(true, true);
        }

        body.traverse((node) => {
          if (!node.isMesh || !node.geometry) {
            return;
          }

          const material = getMeshMaterial(node);
          if (!material || material.transparent || material.opacity < 0.999) {
            this.skippedMeshCount += 1;
            return;
          }

          const materialKey = getBatchMaterialKey(material);
          const visibilityMode = detailVisibilityMode;
          const chunkKey = getVisibilityChunkKey(prop.position, visibilityMode);
          const key = `${visibilityMode}:${chunkKey}:${materialKey}`;
          const bucket = this.getBucket(
            buckets,
            key,
            () => createBatchMaterial(material),
            chunkKey,
            prop.position,
            visibilityMode
          );

          const geometry = normalizeGeometryForBatch(node, material);
          if (!geometry) {
            this.skippedMeshCount += 1;
            return;
          }

          bucket.geometries.push(geometry);
          this.sourceMeshCount += 1;
        });

        if (!actor) {
          disposeObjectResources(body);
        }
      }

      if (!farOnly && GROUND_COVER_KINDS.has(prop.kind)) {
        const geometry = createSimplifiedGroundCoverGeometry(prop);
        if (geometry) {
          const chunkKey = getVisibilityChunkKey(prop.position, 'groundFar');
          const key = `groundFar:${chunkKey}`;
          const bucket = this.getBucket(
            buckets,
            key,
            createGroundFarMaterial,
            chunkKey,
            prop.position,
            'groundFar'
          );
          bucket.geometries.push(geometry);
        }
      }

      if (!farOnly && TREE_LOD_KINDS.has(prop.kind)) {
        const farTree = createFarTreeObject(prop);
        farTree.position.set(prop.position.x, prop.position.y, prop.position.z);
        farTree.rotation.y = prop.rotationY ?? 0;
        farTree.updateWorldMatrix(true, true);
        farTree.traverse((node: any) => {
          if (!node.isMesh || !node.geometry) {
            return;
          }

          const material = getMeshMaterial(node);
          const materialKey = getBatchMaterialKey(material);
          const chunkKey = getVisibilityChunkKey(prop.position, 'treeFar');
          const bucket = this.getBucket(
            buckets,
            `treeFar:${chunkKey}:${materialKey}`,
            () => createBatchMaterial(material),
            chunkKey,
            prop.position,
            'treeFar'
          );
          const geometry = normalizeGeometryForBatch(node, material);
          if (geometry) {
            bucket.geometries.push(geometry);
          }
        });
        disposeObjectResources(farTree);
      }

      if (!GROUND_COVER_KINDS.has(prop.kind) && !TREE_LOD_KINDS.has(prop.kind) && !ALWAYS_RENDER_KINDS.has(prop.kind)) {
        const farClutter = createFarClutterObject(prop);
        farClutter.position.set(prop.position.x, prop.position.y, prop.position.z);
        farClutter.rotation.y = prop.rotationY ?? 0;
        farClutter.updateWorldMatrix(true, true);
        farClutter.traverse((node: any) => {
          if (!node.isMesh || !node.geometry) {
            return;
          }

          const material = getMeshMaterial(node);
          const materialKey = getBatchMaterialKey(material);
          const chunkKey = getVisibilityChunkKey(prop.position, 'clutterFar');
          const bucket = this.getBucket(
            buckets,
            `clutterFar:${chunkKey}:${materialKey}`,
            () => createBatchMaterial(material),
            chunkKey,
            prop.position,
            'clutterFar'
          );
          const geometry = normalizeGeometryForBatch(node, material);
          if (geometry) {
            bucket.geometries.push(geometry);
          }
        });
        disposeObjectResources(farClutter);
      }
    }

    for (const bucket of buckets.values()) {
      const merged = mergeGeometries(bucket.geometries, false);
      for (const geometry of bucket.geometries) {
        geometry.dispose();
      }

      if (!merged) {
        disposeMaterial(bucket.material);
        continue;
      }

      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, bucket.material);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      this.mesh.add(mesh);
      if (
        bucket.visibilityMode === 'groundDetail' ||
        bucket.visibilityMode === 'groundFar' ||
        bucket.visibilityMode === 'clutterDetail' ||
        bucket.visibilityMode === 'treeDetail' ||
        bucket.visibilityMode === 'treeFar' ||
        bucket.visibilityMode === 'clutterFar'
      ) {
        const record = this.getChunkRecord(bucket.chunkKey, bucket.position);
        this.addDistanceMesh(record, bucket.visibilityMode, mesh);
      }
      this.batchMeshCount += 1;
    }
  }

  getDistanceSqToRecord(record, localPlayerPosition) {
    if (!localPlayerPosition) {
      return 0;
    }

    if (!record.bounds?.isEmpty?.()) {
      const dx = localPlayerPosition.x < record.bounds.min.x
        ? record.bounds.min.x - localPlayerPosition.x
        : localPlayerPosition.x > record.bounds.max.x
          ? localPlayerPosition.x - record.bounds.max.x
          : 0;
      const dz = localPlayerPosition.z < record.bounds.min.z
        ? record.bounds.min.z - localPlayerPosition.z
        : localPlayerPosition.z > record.bounds.max.z
          ? localPlayerPosition.z - record.bounds.max.z
          : 0;
      return dx * dx + dz * dz;
    }

    const dx = record.center.x - localPlayerPosition.x;
    const dz = record.center.z - localPlayerPosition.z;
    return dx * dx + dz * dz;
  }

  update(localPlayerPosition = null) {
    const detailDistanceSq = GROUND_DETAIL_DISTANCE * GROUND_DETAIL_DISTANCE;
    const clutterDistanceSq = CLUTTER_DETAIL_DISTANCE * CLUTTER_DETAIL_DISTANCE;
    const treeDistanceSq = TREE_DETAIL_DISTANCE * TREE_DETAIL_DISTANCE;
    for (const record of this.chunkRecords.values()) {
      const distanceSq = this.getDistanceSqToRecord(record, localPlayerPosition);
      const showDetail = localPlayerPosition
        ? distanceSq <= detailDistanceSq
        : true;
      const showClutterDetail = localPlayerPosition
        ? distanceSq <= clutterDistanceSq
        : true;
      const showTreeDetail = localPlayerPosition
        ? distanceSq <= treeDistanceSq
        : true;
      for (const mesh of record.detailMeshes) {
        mesh.visible = showDetail;
      }
      for (const mesh of record.farMeshes) {
        mesh.visible = !showDetail;
      }
      for (const mesh of record.clutterDetailMeshes) {
        mesh.visible = showClutterDetail;
      }
      for (const mesh of record.clutterFarMeshes) {
        mesh.visible = !showClutterDetail;
      }
      for (const mesh of record.treeDetailMeshes) {
        mesh.visible = showTreeDetail;
      }
      for (const mesh of record.treeFarMeshes) {
        mesh.visible = !showTreeDetail;
      }
    }
  }

  dispose() {
    const materials = new Set<any>();
    this.mesh.traverse((node) => {
      if (!node.isMesh) {
        return;
      }

      node.geometry?.dispose?.();
      if (Array.isArray(node.material)) {
        for (const material of node.material) {
          materials.add(material);
        }
      } else if (node.material) {
        materials.add(node.material);
      }
    });

    for (const material of materials) {
      material.dispose?.();
    }
  }
}
