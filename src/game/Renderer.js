import * as THREE from 'three';

export class Renderer {
  constructor(container) {
    this.container = container;
    
    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Append renderer to container
    this.container.appendChild(this.renderer.domElement);
  }
  
  render(scene, camera) {
    this.renderer.render(scene, camera);
  }
  
  updateSize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
} 