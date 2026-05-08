import test from 'node:test';
import assert from 'node:assert/strict';

import { Game } from '../src/game/Game.js';
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

function createShrub(id, x) {
  return {
    id,
    kind: 'shrub',
    position: { x, y: 4, z: 0 },
    rotationY: 0,
    bodyRadius: 5,
    collisionShape: {
      type: 'visual_mesh',
      radius: 5,
      halfHeight: 4
    },
    visual: {
      height: 8,
      radius: 5,
      stemCount: 5,
      leafCount: 8,
      color: 0x4f6f39
    }
  };
}

function createSoftFood(id, x) {
  return {
    id,
    kind: 'soft_food',
    position: { x, y: 0.3, z: 0 },
    rotationY: 0,
    bodyRadius: 0.7,
    collisionShape: {
      type: 'sphere',
      radius: 0.7
    },
    visual: {
      radius: 0.7,
      height: 0.35,
      color: 0x9f6b38
    }
  };
}

function countVisible(meshes) {
  return meshes.filter((mesh) => mesh.visible).length;
}

function findRecordWith(records, key) {
  return records.find((record) => record[key]?.length > 0);
}

function createGameHarness() {
  const sceneObjects = new Set();
  return Object.assign(Object.create(Game.prototype), {
    scene: {
      scene: {
        add(object) {
          sceneObjects.add(object);
        },
        remove(object) {
          sceneObjects.delete(object);
        }
      }
    },
    worldPropViews: new Map(),
    worldPropBatch: null,
    individualWorldPropsReference: null,
    individualWorldProps: [],
    lastWorldPropsReference: null,
    worldPropBatchSignature: '',
    sceneObjects
  });
}

test('ground-cover LOD keeps detail visible when the player stands inside a wide chunk', () => {
  const batch = new WorldPropBatchActor([
    { prop: createGroundPatch('near-chunk-left', 0) },
    { prop: createGroundPatch('near-chunk-right', 120) }
  ]);
  const record = Array.from<any>(batch.chunkRecords.values())[0];

  batch.update({ x: 120, y: 0, z: 0 });

  assert(countVisible(record.detailMeshes) > 0);
  assert.equal(countVisible(record.farMeshes), 0);
  batch.dispose();
});

test('far clutter proxies use coarser chunks than nearby detail meshes', () => {
  const batch = new WorldPropBatchActor([
    { prop: createShrub('far-chunk-left', 0) },
    { prop: createShrub('far-chunk-right', 500) }
  ]);
  const records = Array.from<any>(batch.chunkRecords.values());
  const detailRecordCount = records.filter((record) => record.clutterDetailMeshes.length > 0).length;
  const farRecordCount = records.filter((record) => record.clutterFarMeshes.length > 0).length;

  assert.equal(detailRecordCount, 2);
  assert.equal(farRecordCount, 1);
  batch.dispose();
});

test('tree batches use detailed meshes near the player and far proxies at distance', () => {
  const batch = new WorldPropBatchActor([
    { prop: createTree('lod-tree', 0) }
  ]);
  const records = Array.from<any>(batch.chunkRecords.values());
  const detailRecord = findRecordWith(records, 'treeDetailMeshes');
  const farRecord = findRecordWith(records, 'treeFarMeshes');

  batch.update({ x: 0, y: 0, z: 0 });
  assert(countVisible(detailRecord.treeDetailMeshes) > 0);
  assert.equal(countVisible(farRecord.treeFarMeshes), 0);

  batch.update({ x: 900, y: 0, z: 0 });
  assert.equal(countVisible(detailRecord.treeDetailMeshes), 0);
  assert(countVisible(farRecord.treeFarMeshes) > 0);
  batch.dispose();
});

test('clutter batches keep a cheap far proxy instead of disappearing at distance', () => {
  const batch = new WorldPropBatchActor([
    { prop: createShrub('lod-shrub', 0) }
  ]);
  const records = Array.from<any>(batch.chunkRecords.values());
  const detailRecord = findRecordWith(records, 'clutterDetailMeshes');
  const farRecord = findRecordWith(records, 'clutterFarMeshes');

  batch.update({ x: 0, y: 0, z: 0 });
  assert(countVisible(detailRecord.clutterDetailMeshes) > 0);
  assert.equal(countVisible(farRecord.clutterFarMeshes), 0);

  batch.update({ x: 900, y: 0, z: 0 });
  assert.equal(countVisible(detailRecord.clutterDetailMeshes), 0);
  assert(countVisible(farRecord.clutterFarMeshes) > 0);
  batch.dispose();
});

test('individually rendered props can contribute far-only batch proxies', () => {
  const batch = new WorldPropBatchActor([
    { prop: createSoftFood('lod-food', 0), farOnly: true }
  ]);
  const record = Array.from<any>(batch.chunkRecords.values())[0];

  batch.update({ x: 0, y: 0, z: 0 });
  assert.equal(countVisible(record.clutterDetailMeshes), 0);
  assert.equal(countVisible(record.clutterFarMeshes), 0);

  batch.update({ x: 900, y: 0, z: 0 });
  assert(countVisible(record.clutterFarMeshes) > 0);
  batch.dispose();
});

test('consuming an individual powerup does not rebuild the static world batch', () => {
  const game = createGameHarness();
  const shrub = createShrub('static-shrub', 80);
  const food = createSoftFood('pickup-food', 0);
  const localPosition = { x: 0, y: 0, z: 0 };

  game.syncWorldPropViews([shrub, food], 0, localPosition);
  const initialBatch = game.worldPropBatch;
  const initialSignature = game.worldPropBatchSignature;
  assert(initialBatch);
  assert(game.worldPropViews.has(food.id));

  game.syncWorldPropViews([shrub], 0, localPosition);

  assert.equal(game.worldPropBatch, initialBatch);
  assert.equal(game.worldPropBatchSignature, initialSignature);
  assert.equal(game.worldPropViews.has(food.id), false);
  initialBatch.dispose();
});
