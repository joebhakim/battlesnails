import * as THREE from 'three';

export class NPCSnail {
  constructor() {
    // NPC snail properties
    this.speed = 8.0;
    this.health = 3;
    this.maxHealth = 3;
    this.bodyRadius = 1.5; // For collision detection
    
    // Create the snail mesh
    this.mesh = new THREE.Group();
    
    // Create the snail body
    const bodyGeometry = new THREE.CapsuleGeometry(1, 2, 4, 8);
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xFF6347, // Tomato red
      roughness: 0.7,
      metalness: 0.1
    });
    
    this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    this.body.rotation.x = Math.PI / 2; // Rotate to be horizontal
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    
    // Store original body color for reference
    this.originalBodyColor = bodyMaterial.color.clone();
    this.damageColor = new THREE.Color(0xFF0000); // Bright red for damage
    this.invincibilityColor = new THREE.Color(0xFFD700); // Gold for invincibility
    
    // Create a collision center point for more accurate collision detection
    this.bodyCenter = new THREE.Object3D();
    this.bodyCenter.position.set(0, 0, 0); // Center of the body
    this.body.add(this.bodyCenter);
    
    // Create the shell
    const shellGeometry = new THREE.SphereGeometry(1.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const shellMaterial = new THREE.MeshStandardMaterial({
      color: 0xA0522D, // Sienna
      roughness: 0.8,
      metalness: 0.2
    });
    
    this.shell = new THREE.Mesh(shellGeometry, shellMaterial);
    this.shell.position.set(0, 0.5, -0.8);
    this.shell.castShadow = true;
    this.shell.receiveShadow = true;
    
    // Create the eye stalk (same exact shape as the player's)
    const stalkGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1.5, 8);
    const stalkMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x98FB98, // Pale green
      roughness: 0.7,
      metalness: 0.1
    });
    
    this.eyeStalk = new THREE.Mesh(stalkGeometry, stalkMaterial);
    this.eyeStalk.position.set(0.4, 0.5, 1.5);
    this.eyeStalk.castShadow = true;
    
    // Create the eye
    const eyeGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const eyeMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xFFFFFF,
      roughness: 0.2,
      metalness: 0.1
    });
    
    this.eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    this.eye.position.set(0, 0.6, 0);
    
    // Create the pupil
    const pupilGeometry = new THREE.SphereGeometry(0.1, 16, 16);
    const pupilMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
    
    this.pupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    this.pupil.position.set(0, 0, 0.15);
    
    // Create an eye stalk tip point for symmetry with player
    this.eyeStalkTip = new THREE.Object3D();
    this.eyeStalkTip.position.set(0, 0.3, 0); // Position at the front of the eye, same as player
    this.eye.add(this.eyeStalkTip);
    
    // Assemble the snail
    this.eye.add(this.pupil);
    this.eyeStalk.add(this.eye);
    this.mesh.add(this.body);
    this.mesh.add(this.shell);
    this.mesh.add(this.eyeStalk);
    
    // Set initial position
    this.mesh.position.set(0, 0, -5);
    
    // For movement
    this.movementTimer = 0;
    this.movementDirection = new THREE.Vector3();
    this.targetRotation = 0;
    this.isMoving = false;
    this.timeSinceLastMovement = 0;
    
    // For damage visual effect
    this.isDamaged = false;
    this.damageEffectTime = 0;
    this.damageEffectDuration = 0.3; // In seconds
    
    // For invincibility after taking damage
    this.isInvincible = false;
    this.invincibilityTime = 0;
    this.invincibilityDuration = 1.0; // In seconds
    
    // For AI behavior
    this.aiState = 'approach'; // 'approach' or 'flee'
    this.stateTimer = 0;
    this.nextStateTime = this._getRandomTime(1, 3); // Random time between 1-3 seconds
    
    // For eye stalk thrashing
    this.isThrashing = false;
    this.thrashTimer = 0;
    this.thrashCooldown = 0;
    this.thrashDuration = 0.5; // How long a thrash lasts
    this.thrashCooldownTime = this._getRandomTime(0.5, 2); // Random cooldown between thrashes
    this.targetStalkRotation = new THREE.Euler();
    
    // For striking
    this.isStriking = false;
    this.strikeTime = 0;
    this.strikeDuration = 0.5; // In seconds
    this.strikeDistance = 0.8; // How far forward the eye stalk extends during strike
    this.strikeChance = 0.01; // 1% chance per frame to strike during thrashing
  }
  
  /**
   * Generate a random time value within a range
   * @private
   * @param {number} min - Minimum time in seconds
   * @param {number} max - Maximum time in seconds
   * @returns {number} Random time in seconds
   */
  _getRandomTime(min, max) {
    return min + Math.random() * (max - min);
  }
  
  /**
   * Update the NPC snail state
   * @param {number} delta - Time delta since last frame
   * @param {Object} bodyCollision - Body collision information from collision system
   * @param {THREE.Vector3} playerPosition - Player's current position for AI targeting
   */
  update(delta, bodyCollision = null, playerPosition = null) {
    // Update AI state timers and transitions
    this._updateAIState(delta, playerPosition);
    
    // Update eye stalk thrashing
    this._updateEyeStalkThrashing(delta);
    
    // Update movement based on current AI state
    this.updateMovement(delta, bodyCollision, playerPosition);
    
    // Handle damage visual effect
    if (this.isDamaged) {
      this.damageEffectTime += delta;
      
      if (this.damageEffectTime >= this.damageEffectDuration) {
        // End damage effect
        this.isDamaged = false;
        this.damageEffectTime = 0;
        this.body.material.color.copy(this.originalBodyColor);
      }
    }
    
    // Handle invincibility timer
    if (this.isInvincible) {
      this.invincibilityTime += delta;
      
      // Visual feedback for invincibility - pulsing gold color
      const pulseIntensity = (Math.sin(this.invincibilityTime * 10) + 1) / 2; // 0 to 1
      this.body.material.color.copy(this.originalBodyColor).lerp(this.invincibilityColor, pulseIntensity);
      
      if (this.invincibilityTime >= this.invincibilityDuration) {
        // End invincibility
        this.isInvincible = false;
        this.invincibilityTime = 0;
        this.body.material.color.copy(this.originalBodyColor);
      }
    }
  }
  
  /**
   * Update the AI state (approach/flee) based on timers
   * @private
   * @param {number} delta - Time delta since last frame
   * @param {THREE.Vector3} playerPosition - Player's current position
   */
  _updateAIState(delta, playerPosition) {
    // Skip if no player position is provided
    if (!playerPosition) return;
    
    // Update state timer
    this.stateTimer += delta;
    
    // Check if it's time to transition to the next state
    if (this.stateTimer >= this.nextStateTime) {
      // Toggle state between approach and flee
      this.aiState = this.aiState === 'approach' ? 'flee' : 'approach';
      
      // Reset timer and set new random duration
      this.stateTimer = 0;
      this.nextStateTime = this._getRandomTime(1, 3);
      
      // Log for debugging
      console.log(`NPC switched to ${this.aiState} state for ${this.nextStateTime.toFixed(2)}s`);
    }
  }
  
  /**
   * Update the eye stalk thrashing behavior
   * @private
   * @param {number} delta - Time delta since last frame
   */
  _updateEyeStalkThrashing(delta) {
    if (this.isThrashing) {
      // If currently thrashing
      this.thrashTimer += delta;
      
      // Randomly move the eye stalk during thrashing
      if (Math.random() < 0.2) { // 20% chance each frame to change direction
        this._setRandomEyeStalkRotation();
      }
      
      // Random chance to strike while thrashing
      if (!this.isStriking && Math.random() < this.strikeChance) {
        this.strike();
      }
      
      // Apply smooth rotation towards target
      this._updateEyeStalkRotation(delta);
      
      // End thrashing after duration
      if (this.thrashTimer >= this.thrashDuration) {
        this.isThrashing = false;
        this.thrashTimer = 0;
        this.thrashCooldown = 0;
        this.thrashCooldownTime = this._getRandomTime(0.5, 2);
      }
    } else {
      // If in cooldown
      this.thrashCooldown += delta;
      
      // Start new thrash after cooldown
      if (this.thrashCooldown >= this.thrashCooldownTime) {
        this.isThrashing = true;
        this.thrashTimer = 0;
        this._setRandomEyeStalkRotation();
      }
    }
    
    // Update strike animation if striking
    if (this.isStriking) {
      this.strikeTime += delta;
      
      if (this.strikeTime < this.strikeDuration / 2) {
        // Strike forward
        const progress = this.strikeTime / (this.strikeDuration / 2);
        this.eyeStalk.scale.z = 1 + progress * this.strikeDistance;
      } else if (this.strikeTime < this.strikeDuration) {
        // Return to original position
        const progress = (this.strikeTime - this.strikeDuration / 2) / (this.strikeDuration / 2);
        this.eyeStalk.scale.z = 1 + this.strikeDistance - progress * this.strikeDistance;
      } else {
        // Strike completed
        this.isStriking = false;
        this.strikeTime = 0;
        this.eyeStalk.scale.z = 1;
      }
    }
  }
  
  /**
   * Set a random rotation for the eye stalk
   * @private
   */
  _setRandomEyeStalkRotation() {
    // Random rotation within reasonable limits
    const maxTilt = Math.PI / 3;
    this.targetStalkRotation.x = (Math.random() * 2 - 1) * maxTilt;
    this.targetStalkRotation.y = (Math.random() * 2 - 1) * maxTilt;
  }
  
  /**
   * Smoothly interpolate eye stalk rotation towards target
   * @private
   * @param {number} delta - Time delta since last frame
   */
  _updateEyeStalkRotation(delta) {
    // Apply smooth rotation towards target
    this.eyeStalk.rotation.x = THREE.MathUtils.lerp(
      this.eyeStalk.rotation.x,
      this.targetStalkRotation.x,
      8 * delta
    );
    
    this.eyeStalk.rotation.y = THREE.MathUtils.lerp(
      this.eyeStalk.rotation.y,
      this.targetStalkRotation.y,
      8 * delta
    );
  }
  
  /**
   * Update NPC movement with AI behavior
   * @param {number} delta - Time delta since last frame
   * @param {Object} bodyCollision - Body collision information from collision system
   * @param {THREE.Vector3} playerPosition - Player's current position for AI targeting
   */
  updateMovement(delta, bodyCollision = null, playerPosition = null) {
    // Skip old random movement logic if we have a player position
    if (playerPosition) {
      this._updateTargetedMovement(delta, playerPosition);
    } else {
      // Fall back to random movement if no player position is provided
      this._updateRandomMovement(delta);
    }
    
    // Store the current position before movement
    const previousPosition = this.mesh.position.clone();
    
    // Apply movement if moving
    if (this.isMoving) {
      // Smoothly rotate towards target rotation
      this.mesh.rotation.y = THREE.MathUtils.lerp(
        this.mesh.rotation.y,
        this.targetRotation,
        5 * delta // Increased rotation speed for more responsive movement
      );
      
      // Move forward
      const moveAmount = this.speed * delta;
      this.mesh.translateZ(moveAmount);
      
      // Keep on the ground
      this.mesh.position.y = 0;
      
      // Constrain to a smaller area than the player
      const maxDistance = 15;
      const position = this.mesh.position;
      
      if (position.x < -maxDistance || position.x > maxDistance ||
          position.z < -maxDistance || position.z > maxDistance) {
        // If we hit a boundary, turn around
        this.targetRotation = this.mesh.rotation.y + Math.PI;
        this.timeSinceLastMovement = 2.5; // Force a new direction decision soon
      }
      
      // Enforce position constraints
      position.x = Math.max(-maxDistance, Math.min(maxDistance, position.x));
      position.z = Math.max(-maxDistance, Math.min(maxDistance, position.z));
      
      // Handle body collision if one exists
      if (bodyCollision && bodyCollision.collision) {
        // We need to respond to the collision by moving the NPC away
        
        // Get the direction from NPC to player (already normalized)
        const collisionDir = bodyCollision.direction;
        
        // Calculate the displacement needed to resolve the collision
        // We share the resolution between the two bodies, so divide by 2
        const pushBackDistance = bodyCollision.overlap / 2;
        
        // Create the displacement vector
        const displacement = collisionDir.clone().multiplyScalar(pushBackDistance);
        
        // Apply the displacement to resolve the collision
        this.mesh.position.add(displacement);
        
        // Also change direction based on collision
        this.targetRotation = Math.atan2(displacement.x, displacement.z) + Math.PI;
        this.timeSinceLastMovement = 2.5; // Force a new direction decision soon
      }
    }
  }
  
  /**
   * Update movement based on approach/flee targeting behavior
   * @private
   * @param {number} delta - Time delta since last frame
   * @param {THREE.Vector3} playerPosition - Player's current position for targeting
   */
  _updateTargetedMovement(delta, playerPosition) {
    // Always set to moving when in targeted mode
    this.isMoving = true;
    
    // Calculate direction to player
    const directionToPlayer = new THREE.Vector3()
      .subVectors(playerPosition, this.mesh.position)
      .normalize();
    
    // Calculate angle to player in the XZ plane (ground plane)
    const angleToPlayer = Math.atan2(directionToPlayer.x, directionToPlayer.z);
    
    // If approaching, go toward player; if fleeing, go away from player
    if (this.aiState === 'approach') {
      this.targetRotation = angleToPlayer;
    } else { // 'flee'
      this.targetRotation = angleToPlayer + Math.PI; // Opposite direction
    }
  }
  
  /**
   * Legacy random movement behavior as fallback
   * @private
   * @param {number} delta - Time delta since last frame
   */
  _updateRandomMovement(delta) {
    // Simple AI: move randomly in a confined area
    this.timeSinceLastMovement += delta;
    
    // Decide to start/change movement every few seconds
    if (this.timeSinceLastMovement > 3) {
      this.timeSinceLastMovement = 0;
      
      // 80% chance to move, 20% chance to stop
      if (Math.random() < 0.8) {
        this.isMoving = true;
        
        // Choose a random direction
        const angle = Math.random() * Math.PI * 2;
        this.targetRotation = angle;
        this.movementDirection.set(Math.sin(angle), 0, Math.cos(angle));
      } else {
        this.isMoving = false;
      }
    }
  }
  
  takeDamage(amount) {
    // Don't take damage if invincible
    if (this.isInvincible) {
      return;
    }
    
    // Store the previous health for logging
    const previousHealth = this.health;
    
    // Reduce health
    this.health -= amount;
    
    // Clamp health
    this.health = Math.max(0, this.health);
    
    // Start damage visual effect
    this.isDamaged = true;
    this.damageEffectTime = 0;
    this.body.material.color.set(0xFF0000); // Bright red to indicate damage
    
    // Force movement change when damaged
    this.timeSinceLastMovement = 3;
    
    // Apply invincibility
    this.isInvincible = true;
    this.invincibilityTime = 0;
  }
  
  getBodyPosition() {
    // Get world position of body center for collision
    const position = new THREE.Vector3();
    this.bodyCenter.getWorldPosition(position);
    return position;
  }
  
  getBodyRadius() {
    return this.bodyRadius;
  }
  
  getEyeStalkPosition() {
    // Get world position of eye stalk tip
    const position = new THREE.Vector3();
    this.eyeStalkTip.getWorldPosition(position);
    return position;
  }
  
  /**
   * Initialize a strike action
   */
  strike() {
    if (!this.isStriking) {
      this.isStriking = true;
      this.strikeTime = 0;
      console.log('NPC snail strike initiated');
    }
  }
  
  /**
   * Determines if the strike animation is at its maximum extension point
   * @returns {boolean} True if the strike is at maximum extension
   */
  isAtMaxStrikeExtension() {
    // The strike is at max extension at approximately half of the strike duration
    if (!this.isStriking) return false;
    
    // Allow a small window around the halfway point for more reliable collision detection
    const halfDuration = this.strikeDuration / 2;
    const tolerance = 0.05; // Small time window in seconds
    
    return this.strikeTime >= halfDuration - tolerance && 
           this.strikeTime <= halfDuration + tolerance;
  }
} 