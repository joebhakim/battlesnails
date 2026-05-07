import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { createPropMesh } from './WorldPropActor.js';

const BATCH_CHUNK_SIZE = 340;
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

function getChunkKey(position) {
  return `${Math.floor(position.x / BATCH_CHUNK_SIZE)},${Math.floor(position.z / BATCH_CHUNK_SIZE)}`;
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
    color.offsetHSL(0, 0, (hashUnit(seed + 53, vertexIndex) - 0.5) * 0.1);
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
        treeFarMeshes: []
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

    for (const { prop, actor = null } of entries) {
      const chunkKey = getChunkKey(prop.position);
      const detailVisibilityMode = getBatchVisibilityMode(prop);
      const body = actor?.body ?? createPropMesh(prop);
      const root = actor?.mesh ?? body;

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

      if (GROUND_COVER_KINDS.has(prop.kind)) {
        const geometry = createSimplifiedGroundCoverGeometry(prop);
        if (geometry) {
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

      if (TREE_LOD_KINDS.has(prop.kind)) {
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
        bucket.visibilityMode === 'treeFar'
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
