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
   * Check if two snail bodies are colliding
   * 
   * @param {THREE.Vector3} position1 - The world position of the first snail's body center
   * @param {number} radius1 - The collision radius of the first snail's body
   * @param {THREE.Vector3} position2 - The world position of the second snail's body center
   * @param {number} radius2 - The collision radius of the second snail's body
   * @returns {Object} Collision result object with properties: collision, distance, overlap, direction
   */
  checkBodyCollision(position1, radius1, position2, radius2) {
    // Calculate distance between the two centers
    const distance = position1.distanceTo(position2);
    
    // Calculate minimum distance before collision (sum of radiuses)
    const minDistance = radius1 + radius2;
    
    // Calculate the amount of overlap
    const overlap = Math.max(0, minDistance - distance);
    
    // Determine if there's a collision
    const collision = distance < minDistance;
    
    // Calculate the direction vector from body1 to body2
    const direction = new THREE.Vector3();
    
    if (distance > 0) {
      // Safe normalization
      direction.copy(position2).sub(position1).normalize();
    } else {
      // If centers are at the exact same position (unlikely), use a default direction
      direction.set(1, 0, 0);
    }
    
    // Additional debug information if needed
    if (this.debugMode && collision) {
      console.log('Body collision check:');
      console.log('  Body 1 position:', position1);
      console.log('  Body 1 radius:', radius1);
      console.log('  Body 2 position:', position2);
      console.log('  Body 2 radius:', radius2);
      console.log('  Distance:', distance);
      console.log('  Minimum distance:', minDistance);
      console.log('  Overlap:', overlap);
      console.log('  Collision detected:', collision);
    }
    
    // Return detailed collision information
    return {
      collision,
      distance,
      overlap,
      direction
    };
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