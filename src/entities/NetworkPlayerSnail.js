import { PlayerSnail } from './PlayerSnail.js';
import * as THREE from 'three';

/**
 * A player snail controlled by network inputs
 */
export class NetworkPlayerSnail extends PlayerSnail {
  constructor() {
    super();
    
    // Change color to distinguish from local player
    this.body.material = new THREE.MeshStandardMaterial({ 
      color: 0x00BFFF, // Deep sky blue
      roughness: 0.7,
      metalness: 0.1
    });
    
    // Network state management
    this.targetPosition = new THREE.Vector3();
    this.targetRotation = new THREE.Euler();
    this.targetEyeStalkRotation = new THREE.Euler();
    
    // Interpolation settings
    this.positionLerpFactor = 0.2;
    this.rotationLerpFactor = 0.3;
    
    // Last received state timestamp
    this.lastStateTimestamp = 0;
    
    // For extrapolation
    this.velocityVector = new THREE.Vector3();
  }
  
  /**
   * Process network update data
   * @param {Object} data - Network state data
   */
  processNetworkData(data) {
    // Only process newer state updates
    if (data.timestamp <= this.lastStateTimestamp) return;
    
    // Update timestamps
    this.lastStateTimestamp = data.timestamp;
    
    // Get position data
    this.targetPosition.set(
      data.position.x,
      data.position.y,
      data.position.z
    );
    
    // Get rotation data
    this.targetRotation.set(
      data.rotation.x,
      data.rotation.y,
      data.rotation.z
    );
    
    // Get eye stalk rotation
    this.targetEyeStalkRotation.set(
      data.eyeStalkRotation.x,
      data.eyeStalkRotation.y,
      data.eyeStalkRotation.z
    );
    
    // Update health
    this.health = data.health;
    
    // Update striking state
    if (data.isStriking && !this.isStriking) {
      this.isStriking = true;
      this.strikeTime = 0;
    }
    
    // Calculate velocity for extrapolation
    if (this.lastPosition) {
      this.velocityVector.subVectors(this.targetPosition, this.lastPosition)
        .multiplyScalar(1000 / (data.timestamp - this.lastTimestamp));
    }
    
    this.lastPosition = this.targetPosition.clone();
    this.lastTimestamp = data.timestamp;
  }
  
  /**
   * Update the network player with smooth interpolation
   * @param {number} delta - Time since last update in seconds
   */
  networkUpdate(delta) {
    // Call parent update for animations and internal state
    super.update(delta);
    
    // Interpolate position
    this.mesh.position.lerp(this.targetPosition, this.positionLerpFactor);
    
    // Interpolate body rotation (y-axis only)
    this.mesh.rotation.y += this.rotationLerpFactor * 
      THREE.MathUtils.degToRad(
        THREE.MathUtils.radToDeg(this.targetRotation.y) - 
        THREE.MathUtils.radToDeg(this.mesh.rotation.y)
      );
    
    // Interpolate eye stalk rotation
    this.eyeStalk.rotation.x += this.rotationLerpFactor * 
      (this.targetEyeStalkRotation.x - this.eyeStalk.rotation.x);
    this.eyeStalk.rotation.y += this.rotationLerpFactor * 
      (this.targetEyeStalkRotation.y - this.eyeStalk.rotation.y);
    
    // If no update for a while, extrapolate based on last velocity
    const timeSinceLastUpdate = Date.now() - this.lastStateTimestamp;
    if (timeSinceLastUpdate > 500) { // 500ms threshold
      const extrapolationFactor = delta * (timeSinceLastUpdate / 1000);
      const extrapolation = this.velocityVector.clone().multiplyScalar(extrapolationFactor);
      this.mesh.position.add(extrapolation);
    }
  }
} 