import * as THREE from 'three';

export class CollisionDetection {
  constructor() {
    // Debug flag
    this.debugMode = false;
    // Last collision check result
    this.lastCollisionResult = false;
    // Last collision check details
    this.lastCollisionDetails = {
      eyeStalkPosition: null,
      npcBodyPosition: null,
      npcBodyRadius: 0,
      distance: 0
    };
  }
  
  /**
   * Check if the eye stalk is colliding with the NPC snail's body
   * 
   * @param {THREE.Vector3} eyeStalkPosition - The world position of the eye stalk tip
   * @param {THREE.Vector3} npcBodyPosition - The world position of the NPC body
   * @param {number} npcBodyRadius - The collision radius of the NPC body
   * @returns {boolean} True if collision detected, false otherwise
   */
  checkEyeStalkCollision(eyeStalkPosition, npcBodyPosition, npcBodyRadius) {
    // Simple distance-based collision detection
    const distance = eyeStalkPosition.distanceTo(npcBodyPosition);
    
    // Store collision check details for debugging
    this.lastCollisionDetails = {
      eyeStalkPosition: eyeStalkPosition.clone(),
      npcBodyPosition: npcBodyPosition.clone(),
      npcBodyRadius: npcBodyRadius,
      distance: distance
    };
    
    // If the distance is less than the NPC's body radius, collision detected
    this.lastCollisionResult = distance < npcBodyRadius;
    
    // Additional debug information if needed
    if (this.debugMode) {
      console.log('Collision check:');
      console.log('  Eye stalk position:', eyeStalkPosition);
      console.log('  NPC body position:', npcBodyPosition);
      console.log('  NPC body radius:', npcBodyRadius);
      console.log('  Distance:', distance);
      console.log('  Collision detected:', this.lastCollisionResult);
      console.log('  Distance - Radius =', distance - npcBodyRadius, '(negative means collision)');
    }
    
    return this.lastCollisionResult;
  }
  
  /**
   * Enable or disable debug mode
   * 
   * @param {boolean} enabled - Whether debug mode should be enabled
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
  }
  
  /**
   * Get the last collision check details
   * 
   * @returns {Object} Last collision check details
   */
  getLastCollisionDetails() {
    return this.lastCollisionDetails;
  }
} 