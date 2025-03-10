import * as THREE from 'three';

export class NPCSnail {
  constructor() {
    // NPC snail properties
    this.speed = 10.0;
    this.health = 6;
    this.maxHealth = 6;
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
    
    // Create a bounding box helper to better fit the snail's body and shell
    this.boundingBox = new THREE.Box3();
    this.tempVector = new THREE.Vector3();
    
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
    // Move origin to bottom of cylinder instead of center
    stalkGeometry.translate(0, 0.75, 0);
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
    this.eye.position.set(0, 1.5, 0);
    
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
    this.nextStateTime = this._getRandomTime(0.5, 1.5); // Quicker state changes
    this.erraticMovement = true; // Enable erratic movement
    this.erraticTimer = 0;
    this.erraticInterval = 0.3; // How often to make erratic movements
    this.erraticIntensity = 0.4; // How much to deviate from the direct path
    
    // For eye stalk thrashing
    this.isThrashing = true; // Always thrashing now
    this.thrashTimer = 0;
    this.thrashCooldown = 0;
    this.thrashDuration = 2.0; // Longer thrash duration for more sustained movement
    this.thrashCooldownTime = 0.1; // Almost no cooldown between thrashes
    this.thrashIntensity = 1.5; // Multiplier for thrash movement range
    this.targetStalkRotation = new THREE.Euler();
    
    // New sinusoidal movement properties
    this.sinusoidTimer = 0;
    this.sinusoidFrequency = 6.0; // Complete cycles per second
    this.sinusoidAmplitude = Math.PI; // Maximum rotation (180 degrees)
    
    // For striking
    this.isStriking = false;
    this.strikeTime = 0;
    this.strikeDuration = 0.3; // Faster strikes
    this.strikeDistance = 1.2; // Longer strikes
    this.strikeChance = 0.05; // 5% chance per frame to strike during thrashing (much higher)
    this.strikeMaxCooldown = 0.6; // Maximum time between strikes
    this.strikeCooldown = 0; // Current cooldown timer
    
    // Add velocity tracking for damage calculation
    this.eyeStalkVelocity = 0;
    this.prevEyeStalkRotation = new THREE.Euler(0, 0, 0); // Initialize with zeros
    this.firstFrameUpdate = true; // Flag for first frame
    
    // Add eye stalk swing speed
    this.eyeStalkSwingSpeed = 1.0; // Default speed multiplier (will be increased with level)
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
    this._updateEyeStalkThrashing(delta, playerPosition);
    
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
    
    // Calculate eye stalk velocity based on rotation change
    const currentRotation = this.eyeStalk.rotation.clone();
    
    // Skip velocity calculation on first frame or if delta is too small
    if (this.firstFrameUpdate) {
      this.firstFrameUpdate = false;
      this.prevEyeStalkRotation.copy(currentRotation);
      return; // Exit early on first frame
    }
    
    // Safe delta value to prevent division by zero
    const safeDelta = Math.max(delta, 0.001);
    
    // Calculate rotation difference
    const rotationDelta = new THREE.Vector2(
      Math.abs(currentRotation.x - this.prevEyeStalkRotation.x),
      Math.abs(currentRotation.y - this.prevEyeStalkRotation.y)
    );
    
    // Calculate velocity as the magnitude of rotation change per second
    const rotationSpeed = rotationDelta.length() / safeDelta;
    
    // Apply smoothing to avoid spikes
    this.eyeStalkVelocity = THREE.MathUtils.lerp(
      this.eyeStalkVelocity, 
      rotationSpeed, 
      0.5 // Smoothing factor
    );
    
    // Store current rotation for next frame
    this.prevEyeStalkRotation.copy(currentRotation);
    
    // Look at player with eye stalk
    if (playerPosition) {
      // Calculate direction to player
      const direction = new THREE.Vector3().subVectors(playerPosition, this.mesh.position);
      
      // Convert to local space relative to the NPC's orientation
      const localDirection = direction.clone().applyAxisAngle(
        new THREE.Vector3(0, 1, 0), -this.mesh.rotation.y
      );
      
      // Calculate angles for x and y rotation
      // For x rotation (up/down): Use the angle in the y-z plane
      const verticalAngle = Math.atan2(localDirection.y, localDirection.z);
      
      // For y rotation (left/right): Use the angle in the x-z plane
      const horizontalAngle = Math.atan2(localDirection.x, localDirection.z);
      
      // Set rotations with a small random deviation to make it not perfect
      this.targetStalkRotation.x = verticalAngle + (Math.random() * 0.2 - 0.1);
      this.targetStalkRotation.y = horizontalAngle + (Math.random() * 0.2 - 0.1);
      
      // Apply eye stalk movement with level-based speed scaling
      // Slower horizontal tracking
      this.eyeStalk.rotation.y += (this.targetStalkRotation.y - this.eyeStalk.rotation.y) * 
        (2.5 * delta * this.eyeStalkSwingSpeed);
      
      // Faster vertical tracking
      this.eyeStalk.rotation.x += (this.targetStalkRotation.x - this.eyeStalk.rotation.x) * 
        (4.0 * delta * this.eyeStalkSwingSpeed);
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
    
    // Update erratic movement timer
    this.erraticTimer += delta;
    
    // Check if it's time to transition to the next state
    if (this.stateTimer >= this.nextStateTime) {
      // Toggle state between approach and flee
      this.aiState = this.aiState === 'approach' ? 'flee' : 'approach';
      
      // Reset timer and set new random duration
      this.stateTimer = 0;
      this.nextStateTime = this._getRandomTime(0.5, 1.5);
      
      // Log for debugging
      console.log(`NPC switched to ${this.aiState} state for ${this.nextStateTime.toFixed(2)}s`);
    }
    
    // Add occasional spontaneous state changes for unpredictability
    if (Math.random() < 0.005) { // 0.5% chance per frame to suddenly change state
      this.aiState = this.aiState === 'approach' ? 'flee' : 'approach';
      this.stateTimer = 0;
      this.nextStateTime = this._getRandomTime(0.5, 1.5);
      console.log(`NPC spontaneously switched to ${this.aiState} state!`);
    }
  }
  
  /**
   * Update the eye stalk thrashing behavior
   * @private
   * @param {number} delta - Time delta since last frame
   * @param {THREE.Vector3} playerPosition - Optional player position for targeted attacks
   */
  _updateEyeStalkThrashing(delta, playerPosition = null) {
    // Always thrashing now
    this.thrashTimer += delta;
    
    // Update sinusoidal timer
    this.sinusoidTimer += delta;
    
    // Track if we should aim at player before striking
    let shouldAimHorizontal = false;
    
    // Handle strike cooldown
    if (!this.isStriking) {
      this.strikeCooldown -= delta;
      
      // If we're getting close to being able to strike again, consider aiming horizontally
      if (this.strikeCooldown <= 0.1 && playerPosition && Math.random() < 0.6) {
        shouldAimHorizontal = true;
        
        // If we're already aimed somewhat horizontally and player is in front, high chance to strike
        const isNearHorizontal = Math.abs(this.eyeStalk.rotation.x) < 0.3;
        if (isNearHorizontal && Math.random() < 0.4) {
          this.strike();
          this.strikeCooldown = this.strikeMaxCooldown;
        }
      } 
      // Random chance to strike while thrashing, if not in cooldown
      else if (this.strikeCooldown <= 0 && Math.random() < this.strikeChance) {
        this.strike();
        this.strikeCooldown = this.strikeMaxCooldown;
      }
    }
    
    // Calculate sinusoidal vertical motion (x rotation)
    // Add Math.PI/2 offset to make it oscillate around horizontal instead of vertical
    const verticalAngle = Math.sin(this.sinusoidTimer * this.sinusoidFrequency * Math.PI * 2) * this.sinusoidAmplitude + Math.PI/2;
    
    // Set the target rotation
    if (shouldAimHorizontal && playerPosition) {
      // When aiming to strike, prioritize aiming at player horizontally
      this._aimAtPlayer(playerPosition);
      // But override the vertical with sinusoidal motion
      this.targetStalkRotation.x = verticalAngle;
    } else {
      // Normal sinusoidal sweeping with some horizontal variation
      this.targetStalkRotation.x = verticalAngle;
      
      // Horizontal rotation: if we have player position, face that direction with some randomness
      if (playerPosition) {
        // Calculate direction vector to player
        const direction = new THREE.Vector3().subVectors(playerPosition, this.mesh.position);
        
        // Convert to local space relative to the NPC's orientation
        const localDirection = direction.clone().applyAxisAngle(
          new THREE.Vector3(0, 1, 0), -this.mesh.rotation.y
        );
        
        // Calculate angle in the x-z plane (horizontal)
        const horizontalAngle = Math.atan2(localDirection.x, localDirection.z);
        
        // Add slight randomness to the horizontal aiming
        this.targetStalkRotation.y = horizontalAngle + (Math.random() * 0.3 - 0.15);
      } else {
        // If no player position, just add some random horizontal movement
        this.targetStalkRotation.y += (Math.random() * 0.1 - 0.05);
      }
    }
    
    // Apply smooth rotation towards target
    this._updateEyeStalkRotation(delta);
    
    // Reset thrash timer for continuous thrashing
    if (this.thrashTimer >= this.thrashDuration) {
      this.thrashTimer = 0;
    }
    
    // Update strike animation if striking
    if (this.isStriking) {
      this.strikeTime += delta;
      
      if (this.strikeTime < this.strikeDuration / 2) {
        // Strike forward - faster and more aggressive
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
   * Aim the eye stalk directly at the player for a more targeted attack
   * @private
   * @param {THREE.Vector3} playerPosition - The player's position
   */
  _aimAtPlayer(playerPosition) {
    // Calculate direction vector to player
    const direction = new THREE.Vector3().subVectors(playerPosition, this.mesh.position);
    
    // Convert to local space relative to the NPC's orientation
    const localDirection = direction.clone().applyAxisAngle(
      new THREE.Vector3(0, 1, 0), -this.mesh.rotation.y
    );
    
    // Calculate angles for x and y rotation
    // For x rotation (up/down): Use the angle in the y-z plane
    const verticalAngle = Math.atan2(localDirection.y, localDirection.z);
    
    // For y rotation (left/right): Use the angle in the x-z plane
    const horizontalAngle = Math.atan2(localDirection.x, localDirection.z);
    
    // Set rotations with a small random deviation to make it not perfect
    this.targetStalkRotation.x = verticalAngle + (Math.random() * 0.2 - 0.1);
    this.targetStalkRotation.y = horizontalAngle + (Math.random() * 0.2 - 0.1);
    
    console.log("NPC aiming directly at player!");
  }
  
  /**
   * Smoothly interpolate eye stalk rotation towards target
   * @private
   * @param {number} delta - Time delta since last frame
   */
  _updateEyeStalkRotation(delta) {
    // More responsive/faster rotation - increased from 8 to 12
    const interpolationSpeed = 12; 
    
    // Apply smooth rotation towards target
    this.eyeStalk.rotation.x = THREE.MathUtils.lerp(
      this.eyeStalk.rotation.x,
      this.targetStalkRotation.x,
      interpolationSpeed * delta
    );
    
    this.eyeStalk.rotation.y = THREE.MathUtils.lerp(
      this.eyeStalk.rotation.y,
      this.targetStalkRotation.y,
      interpolationSpeed * delta
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
    let angleToPlayer = Math.atan2(directionToPlayer.x, directionToPlayer.z);
    
    // Apply erratic movement if enabled
    if (this.erraticMovement && this.erraticTimer >= this.erraticInterval) {
      // Reset timer
      this.erraticTimer = 0;
      
      // Add random angle deviation for erratic movement
      const erraticAngle = (Math.random() * 2 - 1) * Math.PI * this.erraticIntensity;
      angleToPlayer += erraticAngle;
      
      // Occasionally make very sharp turns
      if (Math.random() < 0.1) { // 10% chance
        angleToPlayer += (Math.random() > 0.5 ? 1 : -1) * Math.PI * 0.5; // 90-degree turn
      }
    }
    
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
  
  /**
   * Handle taking damage from the player
   * @param {number} amount - Amount of damage to take
   * @returns {boolean} Whether damage was successfully applied
   */
  takeDamage(amount) {
    // Can't take damage if invincible
    if (this.isInvincible) {
      return false;
    }
    
    // Apply fractional damage
    this.health = Math.max(0, this.health - amount);
    
    // Set damage visual effect
    this.isDamaged = true;
    this.damageEffectTime = 0;
    this.body.material.color.set(this.damageColor);
    
    // Set invincibility period
    this.isInvincible = true;
    this.invincibilityTime = 0;
    
    console.log(`NPC took ${amount.toFixed(2)} damage! Health: ${this.health.toFixed(2)}/${this.maxHealth}`);
    
    return true;
  }
  
  getBodyPosition() {
    // Get world position of body center for collision
    const position = new THREE.Vector3();
    this.bodyCenter.getWorldPosition(position);
    return position;
  }
  
  /**
   * Get the body radius for collision detection
   * @returns {number} The collision radius
   */
  getBodyRadius() {
    // For collision purposes, we use a composite radius that encompasses
    // both the body and shell. This approximates the true shape better than
    // the bounding box approach while still keeping collision detection simple.
    
    // Get positions in world space
    const bodyPosition = new THREE.Vector3();
    this.body.getWorldPosition(bodyPosition);
    
    const shellPosition = new THREE.Vector3();
    this.shell.getWorldPosition(shellPosition);
    
    // The body is roughly a capsule with radius 1.0 and length 2.0
    const bodyRadius = 1.0;
    
    // The shell is roughly a hemisphere with radius 1.2
    const shellRadius = 1.2;
    
    // Measure distance between body and shell centers
    const bodyShellDistance = bodyPosition.distanceTo(shellPosition);
    
    // Return the maximum reach from the body center to the furthest point on the shell
    // This is the body radius plus the distance to the shell center plus the shell radius
    return Math.max(bodyRadius, bodyShellDistance + shellRadius);
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
  
  /**
   * Get the current eye stalk velocity (for damage calculation)
   * @returns {number} The current velocity
   */
  getEyeStalkVelocity() {
    // Ensure we always return a valid number
    return isNaN(this.eyeStalkVelocity) ? 0 : this.eyeStalkVelocity;
  }
  
  /**
   * Calculate potential damage based on current velocity
   * @returns {number} The potential damage
   */
  getPotentialDamage() {
    // Get a safe velocity value
    const safeVelocity = this.getEyeStalkVelocity();
    
    // Convert velocity to damage with explicit validation
    const damage = safeVelocity / 5;
    
    // Ensure the result is a valid number
    return isNaN(damage) ? 0 : damage;
  }
} 