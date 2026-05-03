import * as THREE from 'three';

import {
  DEFAULT_TERRAIN_CONFIG,
  createTerrainGeometry,
  getTerrainConfigKey,
  normalizeTerrainConfig,
  TERRAIN_VISUAL_SIZE
} from '../world/Terrain.js';

export class Scene {
  declare terrainConfig: any;
  declare ground: any;
  declare groundMaterial: any;
  declare scene: any;
  declare terrainKey: any;
  constructor() {
    this.scene = new THREE.Scene();
    this.ground = null;
    this.groundMaterial = null;
    this.terrainConfig = normalizeTerrainConfig(DEFAULT_TERRAIN_CONFIG);
    this.terrainKey = getTerrainConfigKey(this.terrainConfig);
  }

  init() {
    this.scene.background = new THREE.Color(0x93bed8);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(8, 18, 10);
    directionalLight.castShadow = false;
    this.scene.add(directionalLight);

    this.groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x6e9f55,
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.05
    });

    this.ground = new THREE.Mesh(
      createTerrainGeometry(
        this.terrainConfig,
        this.terrainConfig.visualSize ?? TERRAIN_VISUAL_SIZE,
        this.terrainConfig.visualSegments
      ),
      this.groundMaterial
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = false;
    this.scene.add(this.ground);
  }

  setTerrainConfig(nextTerrainConfig = DEFAULT_TERRAIN_CONFIG) {
    const normalized = normalizeTerrainConfig(nextTerrainConfig);
    const nextKey = getTerrainConfigKey(normalized);
    if (!this.ground || nextKey === this.terrainKey) {
      this.terrainConfig = normalized;
      this.terrainKey = nextKey;
      return;
    }

    const nextGeometry = createTerrainGeometry(
      normalized,
      normalized.visualSize ?? TERRAIN_VISUAL_SIZE,
      normalized.visualSegments
    );
    this.ground.geometry.dispose();
    this.ground.geometry = nextGeometry;
    this.terrainConfig = normalized;
    this.terrainKey = nextKey;
  }
}
