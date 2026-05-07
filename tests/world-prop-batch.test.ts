import test from 'node:test';
import assert from 'node:assert/strict';

import { WorldPropBatchActor } from '../src/entities/WorldPropBatchActor.js';

function createGroundPatch(id, x) {
  return {
    id,
    kind: 'dry_leaf_patch',
    position: { x, y: 0, z: 0 },
    rotationY: 0,
    bodyRadius: 12,
    collisionShape: {
      type: 'polygon_prism',
      halfHeight: 0.25,
      points: [
        { x: -12, y: 0, z: -8 },
        { x: 12, y: 0, z: -8 },
        { x: 12, y: 0, z: 8 },
        { x: -12, y: 0, z: 8 }
      ]
    },
    visual: {
      length: 24,
      width: 16,
      thickness: 0.5,
      relief: 0.4
    }
  };
}

function createTree(id, x) {
  return {
    id,
    kind: 'deciduous_tree',
    position: { x, y: 18, z: 0 },
    rotationY: 0,
    bodyRadius: 18,
    collisionShape: {
      type: 'visual_mesh',
      radius: 18,
      halfHeight: 18
    },
    visual: {
      treeType: 'deciduous',
      trunkRadius: 1.5,
      canopyRadius: 8,
      height: 36
    }
  };
}

function countVisible(meshes) {
  return meshes.filter((mesh) => mesh.visible).length;
}

test('ground-cover LOD keeps detail visible when the player stands inside a wide chunk', () => {
  const batch = new WorldPropBatchActor([
    { prop: createGroundPatch('near-chunk-left', 0) },
    { prop: createGroundPatch('near-chunk-right', 330) }
  ]);
  const record = Array.from<any>(batch.chunkRecords.values())[0];

  batch.update({ x: 330, y: 0, z: 0 });

  assert(countVisible(record.detailMeshes) > 0);
  assert.equal(countVisible(record.farMeshes), 0);
  batch.dispose();
});

test('tree batches use detailed meshes near the player and far proxies at distance', () => {
  const batch = new WorldPropBatchActor([
    { prop: createTree('lod-tree', 0) }
  ]);
  const record = Array.from<any>(batch.chunkRecords.values())[0];

  batch.update({ x: 0, y: 0, z: 0 });
  assert(countVisible(record.treeDetailMeshes) > 0);
  assert.equal(countVisible(record.treeFarMeshes), 0);

  batch.update({ x: 900, y: 0, z: 0 });
  assert.equal(countVisible(record.treeDetailMeshes), 0);
  assert(countVisible(record.treeFarMeshes) > 0);
  batch.dispose();
});
