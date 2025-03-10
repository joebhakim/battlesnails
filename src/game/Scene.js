import * as THREE from 'three';

export class Scene {
  constructor() {
    this.scene = new THREE.Scene();
  }
  
  init() {
    // Set background color
    this.scene.background = new THREE.Color(0x87CEEB); // Sky blue
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    
    // Add directional light (sun-like)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    
    // Configure shadow properties
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    
    this.scene.add(directionalLight);
    
    // Create a ground plane
    const groundSize = 100;
    const gridDivisions = 50; // Smallish grid size
    
    // Create a grid helper for reference
    const gridHelper = new THREE.GridHelper(groundSize, gridDivisions);
    gridHelper.position.y = -2; // Same height as the ground
    
    // Customize the grid colors - alternating between two shades of green
    const lightGreen = new THREE.Color(0x7CFC00); // Lawn green
    const darkGreen = new THREE.Color(0x228B22); // Forest green
    
    // Set colors for the grid lines
    gridHelper.material.color.set(darkGreen);
    // Larger grid lines
    gridHelper.material.linewidth = 6;
    gridHelper.material.vertexColors = false;
    
    // Rotate grid to lie flat on XZ plane (it's already in this orientation by default)
    
    // Create actual ground plane with a texture
    const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: lightGreen,
      roughness: 0.8,
      metalness: 0.1
    });
    
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    ground.position.y = -2.01; // Slightly below the grid to prevent z-fighting
    ground.receiveShadow = true;
    
    // Add both the grid and the ground plane
    this.scene.add(gridHelper);
    this.scene.add(ground);
  }
  
  add(object) {
    this.scene.add(object);
  }
  
  remove(object) {
    this.scene.remove(object);
  }
} 