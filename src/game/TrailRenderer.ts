import * as THREE from 'three';

import {
  DEFAULT_TERRAIN_CONFIG,
  getTerrainConfigKey,
  getTerrainHeight,
  normalizeTerrainConfig
} from '../world/Terrain.js';

const TRAIL_HEIGHT = 0.035;

export class TrailRenderer {
  declare terrainConfig: any;
  declare cellSize: any;
  declare cells: any;
  declare geometry: any;
  declare group: any;
  declare instanceCapacity: any;
  declare instancedMesh: any;
  declare material: any;
  declare scene: any;
  declare tempObject: any;
  declare terrainKey: any;
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'wet-trails';
    this.scene.add(this.group);

    this.geometry = new THREE.CircleGeometry(0.5, 14);
    this.material = new THREE.MeshPhongMaterial({
      color: 0x65a9ff,
      specular: 0xdff4ff,
      shininess: 120,
      transparent: true,
      opacity: 0.62,
      depthWrite: false
    });

    this.cellSize = null;
    this.cells = new Map();
    this.instanceCapacity = 0;
    this.instancedMesh = null;
    this.tempObject = new THREE.Object3D();
    this.terrainConfig = normalizeTerrainConfig(DEFAULT_TERRAIN_CONFIG);
    this.terrainKey = getTerrainConfigKey(this.terrainConfig);
  }

  setTerrainConfig(nextTerrainConfig = DEFAULT_TERRAIN_CONFIG) {
    const normalized = normalizeTerrainConfig(nextTerrainConfig);
    const nextKey = getTerrainConfigKey(normalized);
    if (nextKey === this.terrainKey) {
      return;
    }

    this.terrainConfig = normalized;
    this.terrainKey = nextKey;
    this.reset();
  }

  reset() {
    if (this.instancedMesh) {
      this.group.remove(this.instancedMesh);
      this.instancedMesh.dispose?.();
      this.instancedMesh = null;
    }

    this.cells.clear();
    this.cellSize = null;
    this.instanceCapacity = 0;
  }

  getNextCapacity(requiredCount) {
    let capacity = Math.max(64, this.instanceCapacity || 64);
    while (capacity < requiredCount) {
      capacity *= 2;
    }
    return capacity;
  }

  ensureCapacity(requiredCount) {
    if (this.instancedMesh && this.instanceCapacity >= requiredCount) {
      return;
    }

    const nextCapacity = this.getNextCapacity(requiredCount);
    if (this.instancedMesh) {
      this.group.remove(this.instancedMesh);
      this.instancedMesh.dispose?.();
    }

    this.instancedMesh = new THREE.InstancedMesh(this.geometry, this.material, nextCapacity);
    this.instancedMesh.name = 'wet-trail-instances';
    this.instancedMesh.count = this.cells.size;
    this.instancedMesh.receiveShadow = false;
    this.instancedMesh.frustumCulled = true;
    this.instancedMesh.renderOrder = 1;
    this.instanceCapacity = nextCapacity;
    this.group.add(this.instancedMesh);

    for (const cell of this.cells.values()) {
      this.setInstanceMatrix(cell);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  setInstanceMatrix(cell) {
    if (!this.instancedMesh) {
      return;
    }

    this.tempObject.position.set(cell.x, cell.y, cell.z);
    this.tempObject.rotation.set(-Math.PI / 2, 0, cell.rotationZ);
    this.tempObject.scale.setScalar(cell.scale);
    this.tempObject.updateMatrix();
    this.instancedMesh.setMatrixAt(cell.index, this.tempObject.matrix);
  }

  applySnapshot(snapshot) {
    if (!snapshot) {
      return;
    }

    this.setTerrainConfig(snapshot.terrain ?? this.terrainConfig);

    if (snapshot.tick === 0 && this.cells.size > 0 && (snapshot.trailCells?.length ?? 0) === 0) {
      this.reset();
    }

    if (typeof snapshot.trailCellSize === 'number' && snapshot.trailCellSize !== this.cellSize) {
      this.reset();
      this.cellSize = snapshot.trailCellSize;
    }

    const size = this.cellSize ?? snapshot.trailCellSize ?? 1;
    let hasNewCells = false;
    for (const cell of snapshot.trailCells ?? []) {
      const key = `${cell.x}:${cell.z}`;
      if (this.cells.has(key)) {
        continue;
      }

      const index = this.cells.size;
      const entry = {
        index,
        x: cell.x,
        y: getTerrainHeight(cell.x, cell.z, this.terrainConfig) + TRAIL_HEIGHT + Math.random() * 0.005,
        z: cell.z,
        rotationZ: Math.random() * Math.PI * 2,
        scale: size * (0.95 + Math.random() * 0.2)
      };

      this.cells.set(key, entry);
      this.ensureCapacity(this.cells.size);
      this.setInstanceMatrix(entry);
      hasNewCells = true;
    }

    if (this.instancedMesh) {
      this.instancedMesh.count = this.cells.size;
      if (hasNewCells) {
        this.instancedMesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
}
