import * as THREE from 'three';

export class Scene {
  constructor() {
    this.scene = new THREE.Scene();
  }

  init() {
    this.scene.background = new THREE.Color(0x93bed8);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(8, 18, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 60;
    this.scene.add(directionalLight);

    const groundSize = 100;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(groundSize, groundSize),
      new THREE.MeshStandardMaterial({
        color: 0x6e9f55,
        roughness: 0.9,
        metalness: 0.05
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(groundSize, 40, 0x456e3c, 0x5f8f4f);
    grid.position.y = 0.02;
    this.scene.add(grid);
  }
}
