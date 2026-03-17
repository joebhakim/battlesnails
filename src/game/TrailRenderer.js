import * as THREE from 'three';

import {
  DEFAULT_TERRAIN_CONFIG,
  getTerrainConfigKey,
  getTerrainHeight,
  normalizeTerrainConfig
} from '../world/Terrain.js';

const TRAIL_HEIGHT = 0.035;

export class TrailRenderer {
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
    for (const mesh of this.cells.values()) {
      this.group.remove(mesh);
    }

    this.cells.clear();
    this.cellSize = null;
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
    for (const cell of snapshot.trailCells ?? []) {
      const key = `${cell.x}:${cell.z}`;
      if (this.cells.has(key)) {
        continue;
      }

      const patch = new THREE.Mesh(this.geometry, this.material);
      patch.rotation.x = -Math.PI / 2;
      patch.rotation.z = Math.random() * Math.PI * 2;
      patch.position.set(
        cell.x,
        getTerrainHeight(cell.x, cell.z, this.terrainConfig) + TRAIL_HEIGHT + Math.random() * 0.005,
        cell.z
      );
      patch.scale.setScalar(size * (0.95 + Math.random() * 0.2));
      patch.receiveShadow = false;
      patch.renderOrder = 1;

      this.cells.set(key, patch);
      this.group.add(patch);
    }
  }
}
