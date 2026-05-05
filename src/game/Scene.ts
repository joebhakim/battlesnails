import * as THREE from 'three';

import {
  DEFAULT_TERRAIN_CONFIG,
  createTerrainGeometry,
  createWaterGeometry,
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
  declare water: any;
  declare waterMaterial: any;
  constructor() {
    this.scene = new THREE.Scene();
    this.ground = null;
    this.groundMaterial = null;
    this.water = null;
    this.waterMaterial = null;
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

    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x4ca5bd,
      roughness: 0.25,
      metalness: 0,
      transparent: true,
      opacity: 0.38,
      depthWrite: false
    });
    this.water = new THREE.Mesh(
      createWaterGeometry(
        this.terrainConfig,
        this.terrainConfig.visualSize ?? TERRAIN_VISUAL_SIZE,
        Math.max(36, Math.floor((this.terrainConfig.visualSegments ?? 120) * 0.45))
      ),
      this.waterMaterial
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.renderOrder = 2;
    this.scene.add(this.water);
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
    if (this.water) {
      const nextWaterGeometry = createWaterGeometry(
        normalized,
        normalized.visualSize ?? TERRAIN_VISUAL_SIZE,
        Math.max(36, Math.floor((normalized.visualSegments ?? 120) * 0.45))
      );
      this.water.geometry.dispose();
      this.water.geometry = nextWaterGeometry;
      this.water.visible = nextWaterGeometry.attributes.position.count > 0;
    }
    this.terrainConfig = normalized;
    this.terrainKey = nextKey;
  }
}
