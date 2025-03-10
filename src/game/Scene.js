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
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x7CFC00, // Lawn green
      roughness: 1,
      metalness: 0
    });
    
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    ground.position.y = -2; // Position slightly below the origin
    ground.receiveShadow = true;
    
    this.scene.add(ground);
  }
  
  add(object) {
    this.scene.add(object);
  }
  
  remove(object) {
    this.scene.remove(object);
  }
} 