import * as THREE from 'three';

export class PlayerSnail {
  constructor() {
    // Player snail properties
    this.speed = 10.0;
    this.rotationSpeed = 10.0;
    
    // Health system
    this.health = 500;
    this.maxHealth = 500;
    this.isInvincible = false;
    this.invincibilityTime = 0;
    this.invincibilityDuration = 1.0; // 1 second of invincibility after being hit
    this.isDamaged = false;
    this.damageEffectTime = 0;
    this.damageEffectDuration = 0.3; // Visual feedback duration in seconds
    
    // Movement state
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    
    // Create the snail mesh
    this.mesh = new THREE.Group();
    
    // Create the snail body
    const bodyGeometry = new THREE.CapsuleGeometry(1, 2, 4, 8);
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x1E90FF, // Dodger blue
      roughness: 0.7,
      metalness: 0.1
    });
    
    this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    this.body.rotation.x = Math.PI / 2; // Rotate to be horizontal
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    
    // Store original body color for damage effects
    this.originalBodyColor = bodyMaterial.color.clone();
    this.damageColor = new THREE.Color(0xFF0000); // Bright red for damage
    this.invincibilityColor = new THREE.Color(0xFFD700); // Gold for invincibility
    
    // Create the shell
    const shellGeometry = new THREE.SphereGeometry(1.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const shellMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B4513, // Saddle brown
      roughness: 0.8,
      metalness: 0.2
    });
    
    this.shell = new THREE.Mesh(shellGeometry, shellMaterial);
    this.shell.position.set(0, 0.5, -0.8);
    this.shell.castShadow = true;
    this.shell.receiveShadow = true;
    
    // Create the eye stalk
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
    
    // Create a hidden tip object at the end of eye stalk for precise collision detection
    this.eyeStalkTip = new THREE.Object3D();
    this.eyeStalkTip.position.set(0, 0.3, 0); // Adjusted to be at the front of the eye
    
    // Assemble the snail
    this.eye.add(this.pupil);
    this.eye.add(this.eyeStalkTip); // Add tip to eye
    this.eyeStalk.add(this.eye);
    this.mesh.add(this.body);
    this.mesh.add(this.shell);
    this.mesh.add(this.eyeStalk);
    
    // Set initial position
    this.mesh.position.set(0, 0, 5);
    
    // For eye stalk aiming
    this.targetStalkRotation = new THREE.Euler();
    this.isStriking = false;
    this.strikeTime = 0;
    this.strikeDuration = 0.5; // In seconds
    this.strikeDistance = 0.8; // How far forward the eye stalk extends during strike

    // Add body collision properties
    this.bodyRadius = 1.5; // Collision radius for body
    this.bodyCenter = new THREE.Object3D();
    this.bodyCenter.position.set(0, 0, 0); // Center of the body
    this.body.add(this.bodyCenter);

    // Create a bounding box helper to better fit the snail's body and shell
    this.boundingBox = new THREE.Box3();
    this.tempVector = new THREE.Vector3();

    // Add velocity tracking for damage calculation
    this.eyeStalkVelocity = 0;
    this.prevEyeStalkRotation = new THREE.Euler(0, 0, 0); // Initialize with zeros
    this.firstFrameUpdate = true; // Flag for first frame

    // New swing-related properties
    this.isSwinging = false;
    this.swingTime = 0;
    this.swingDuration = 0.8; // Longer duration for physics-based swing
    this.initialStalkRotation = new THREE.Euler();
    this.currentSwingVelocity = 0;
    this.maxSwingExtension = 1.5; // Maximum extension for physics-based swing
    this.isInActiveStrikeZone = false;
  }
  
  /**
   * Update the player's state each frame
   * @param {number} deltaTime - Time in seconds since last frame
   */
  update(deltaTime) {
    // Handle moving around
    this.updateMovement(deltaTime);
    
    // Check if we need to update eye stalk position
    const inActiveState = this.isStriking || this.isSwinging || this.isInAttackMode();
    
    // Skip auto-centering entirely - the MouseControls class now handles eye stalk positioning
    // in both attack mode and exploration mode
    
    // Update shell color based on health
    this.updateShellColor();
    
    // Handle attack physics
    if (this.isStriking) {
      this.strikeTime += deltaTime;
      
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
        this.eyeStalk.scale.z = 1;
      }
    }
    
    if (this.isSwinging) {
      this.updateSwing(deltaTime);
    }
    
    // Handle damage visual effect
    if (this.isDamaged) {
      this.damageEffectTime += deltaTime;
      
      if (this.damageEffectTime >= this.damageEffectDuration) {
        // End damage effect
        this.isDamaged = false;
        this.damageEffectTime = 0;
        
        if (!this.isInvincible) {
          this.body.material.color.copy(this.originalBodyColor);
        }
      }
    }
    
    // Handle invincibility timer
    if (this.isInvincible) {
      this.invincibilityTime += deltaTime;
      
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
    const safeDelta = Math.max(deltaTime, 0.001);
    
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
  }
  
  /**
   * New method to handle strafing movement
   * @param {number} delta - Time delta since last frame
   */
  strafeUpdate(delta) {
    const moveSpeed = this.speed * delta;
    
    // Create a movement vector
    const movement = new THREE.Vector3(0, 0, 0);
    
    // Forward/backward movement (along the forward direction)
    if (this.moveForward) {
      movement.z += moveSpeed;
    }
    if (this.moveBackward) {
      movement.z -= moveSpeed;
    }
    
    // Left/right movement (strafing - along the right direction)
    if (this.moveLeft) {
      movement.x -= moveSpeed;
    }
    if (this.moveRight) {
      movement.x += moveSpeed;
    }
    
    // Apply movement in local space (relative to the snail's orientation)
    if (movement.length() > 0) {
      this.mesh.translateX(movement.x);
      this.mesh.translateZ(movement.z);
    }
  }
  
  /**
   * Aim the eye stalk at a specific screen position
   * @param {number} screenX - X coordinate in screen space
   * @param {number} screenY - Y coordinate in screen space
   * @param {THREE.Camera} [camera] - Camera for raycasting (optional)
   */
  aimEyeStalk(screenX, screenY, camera) {
    // Calculate normalized device coordinates (-1 to +1)
    const canvas = document.querySelector('canvas');
    const ndcX = (screenX / canvas.clientWidth) * 2 - 1;
    const ndcY = -(screenY / canvas.clientHeight) * 2 + 1;

    // Create a ray from the camera through the mouse position
    const raycaster = new THREE.Raycaster();
    
    // Find the camera using available methods
    let useCamera = camera;
    if (!useCamera) {
      // Try to get camera from the game instance (if available)
      if (canvas && canvas.__gameInstance && canvas.__gameInstance.camera) {
        useCamera = canvas.__gameInstance.camera;
      } else {
        // Fallback to a default direction if no camera is available
        console.warn("No camera available for eye stalk aiming, using default direction");
        // Set target rotations directly
        const maxRotation = Math.PI / 3; // 60 degrees
        this.targetStalkRotation.x = ndcY * maxRotation;
        this.targetStalkRotation.y = ndcX * maxRotation;
        
        // Apply rotation directly
        this.eyeStalk.rotation.x = this.targetStalkRotation.x;
        this.eyeStalk.rotation.y = this.targetStalkRotation.y;
        return;
      }
    }
    
    // Set up the raycaster using the camera
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), useCamera);

    // Set a target point some distance along the ray
    const targetPoint = new THREE.Vector3();
    targetPoint.copy(raycaster.ray.direction).multiplyScalar(10).add(useCamera.position);

    // Calculate direction vector from eye stalk to target
    const direction = new THREE.Vector3();
    direction.subVectors(targetPoint, this.eyeStalk.getWorldPosition(new THREE.Vector3()));
    direction.normalize();

    // Convert direction to rotation angles
    const horizontalRotation = Math.atan2(direction.x, direction.z);
    const verticalRotation = Math.atan2(direction.y, Math.sqrt(direction.x * direction.x + direction.z * direction.z));

    // Apply rotation limits
    const maxRotation = Math.PI / 3; // 60 degrees
    const clampedVertical = Math.max(-maxRotation, Math.min(maxRotation, verticalRotation));
    
    // Update the target rotation
    this.targetStalkRotation.x = clampedVertical;
    this.targetStalkRotation.y = horizontalRotation;
    
    // Directly set the rotation immediately when in aim mode
    this.eyeStalk.rotation.x = this.targetStalkRotation.x;
    this.eyeStalk.rotation.y = this.targetStalkRotation.y;
    
    // Log debug info occasionally to avoid spam
    if (Math.random() < 0.05) {
      console.log(`Eye stalk aimed at: (${ndcX.toFixed(2)}, ${ndcY.toFixed(2)}) → rotation: (${this.eyeStalk.rotation.x.toFixed(2)}, ${this.eyeStalk.rotation.y.toFixed(2)})`);
    }
  }
  
  strike() {
    if (!this.isStriking) {
      this.isStriking = true;
      this.strikeTime = 0;
      
      // Log for debugging
      console.log('Strike initiated from PlayerSnail');
    }
  }
  
  getEyeStalkPosition() {
    // Get world position of eye stalk tip for more accurate collision
    const position = new THREE.Vector3();
    this.eyeStalkTip.getWorldPosition(position);
    return position;
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
   * Get the world position of the snail body's center for collision detection
   * @returns {THREE.Vector3} The world position of the body center
   */
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

  /**
   * Handle taking damage from the NPC
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
    
    console.log(`Player took ${amount.toFixed(2)} damage! Health: ${this.health.toFixed(2)}/${this.maxHealth}`);
    
    return true;
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

  /**
   * Set attack parameters for a physics-based swing
   * @param {number} rotationX - The vertical component of the attack rotation
   * @param {number} rotationY - The horizontal component of the attack rotation
   * @param {number} velocity - The velocity/strength of the attack
   */
  setAttackParameters(rotationX, rotationY, velocity) {
    // Store target rotation for the eye stalk
    this.targetStalkRotation.x = rotationX;
    this.targetStalkRotation.y = rotationY;
    
    // Store velocity for the swing
    this.swingVelocity = velocity;
    
    // Extra parameters for physics-based swing
    this.swingDamping = 0.92; // Damping factor to slow down swing over time
    this.swingMinVelocity = 0.1; // Minimum velocity threshold
  }

  /**
   * Initiate a physics-based swing attack with the eye stalk
   */
  swingAttack() {
    if (!this.isStriking && !this.isSwinging) {
      // Start a physics-based swing
      this.isSwinging = true;
      this.swingTime = 0;
      this.swingDuration = 0.8; // Longer duration for physics-based swing
      
      // Store initial rotation for swing interpolation
      this.initialStalkRotation = new THREE.Euler(
        this.eyeStalk.rotation.x,
        this.eyeStalk.rotation.y,
        this.eyeStalk.rotation.z
      );
      
      // Apply initial velocity to the eye stalk
      this.currentSwingVelocity = this.swingVelocity;
      
      // Enable swing arc extension based on velocity
      this.maxSwingExtension = Math.min(1.0 + this.swingVelocity * 0.2, 1.5);
      
      console.log(`Starting swing attack with velocity: ${this.swingVelocity}, max extension: ${this.maxSwingExtension}`);
    }
  }

  /**
   * Update the eye stalk for physics-based swing
   * @param {number} delta - Time since last frame
   */
  updateSwing(delta) {
    if (!this.isSwinging) return;
    
    this.swingTime += delta;
    
    // Apply velocity-based dynamics
    if (this.currentSwingVelocity > this.swingMinVelocity) {
      // Apply damping to velocity
      this.currentSwingVelocity *= this.swingDamping;
      
      // Extend the eye stalk based on current velocity
      const extensionFactor = Math.min(this.currentSwingVelocity / this.swingVelocity, 1.0);
      const currentExtension = 1.0 + (this.maxSwingExtension - 1.0) * extensionFactor;
      this.eyeStalk.scale.z = currentExtension;
      
      // Smoothly rotate towards target rotation with higher angular velocity based on swing speed
      const rotationSpeed = 15 * (this.currentSwingVelocity / this.swingVelocity);
      
      this.eyeStalk.rotation.x = THREE.MathUtils.lerp(
        this.eyeStalk.rotation.x,
        this.targetStalkRotation.x,
        rotationSpeed * delta
      );
      
      this.eyeStalk.rotation.y = THREE.MathUtils.lerp(
        this.eyeStalk.rotation.y,
        this.targetStalkRotation.y,
        rotationSpeed * delta
      );
      
      // Check for active strike zone (when eye stalk is significantly extended)
      if (this.eyeStalk.scale.z > 1.2) {
        this.isInActiveStrikeZone = true;
      } else {
        this.isInActiveStrikeZone = false;
      }
    } else {
      // End swing when velocity is too low
      this.finishSwing();
    }
    
    // End swing after maximum duration regardless of velocity
    if (this.swingTime >= this.swingDuration) {
      this.finishSwing();
    }
  }
  
  /**
   * End the swing animation and return to normal state
   */
  finishSwing() {
    this.isSwinging = false;
    this.isInActiveStrikeZone = false;
    this.swingTime = 0;
    this.currentSwingVelocity = 0;
    
    // Smoothly return eye stalk to normal scale
    this.eyeStalk.scale.z = 1.0;
  }

  /**
   * Determines if the attack is in its active strike zone (for collision detection)
   * Works for both traditional strikes and physics-based swings
   * @returns {boolean} True if the attack can cause damage
   */
  isInActiveAttackZone() {
    // Check traditional strike
    if (this.isStriking) {
      // The strike is at max extension at approximately half of the strike duration
      const halfDuration = this.strikeDuration / 2;
      const tolerance = 0.05; // Small time window in seconds
      
      return this.strikeTime >= halfDuration - tolerance && 
             this.strikeTime <= halfDuration + tolerance;
    }
    
    // Check physics-based swing
    if (this.isSwinging) {
      return this.isInActiveStrikeZone;
    }
    
    return false;
  }

  /**
   * Check if we are currently in attack mode
   * @returns {boolean} - True if in attack mode
   */
  isInAttackMode() {
    // Get the game instance through the canvas
    const canvas = document.querySelector('canvas');
    if (canvas && canvas.__gameInstance) {
      // Get the mouse controls from the game
      const mouseControls = canvas.__gameInstance.mouseControls;
      if (mouseControls) {
        return mouseControls.isInAttackMode();
      }
    }
    return false;
  }

  /**
   * Update the player's movement based on input and physics
   * @param {number} deltaTime - Time in seconds since last frame
   */
  updateMovement(deltaTime) {
    // Handle player movement based on keyboard input
    const moveSpeed = this.speed * deltaTime;
    
    // Create a movement vector
    const movement = new THREE.Vector3(0, 0, 0);
    
    // Forward/backward movement (along local Z axis)
    if (this.moveForward) {
      movement.z += moveSpeed;
    }
    if (this.moveBackward) {
      movement.z -= moveSpeed;
    }
    
    // Left/right movement (along local X axis - strafing)
    if (this.moveLeft) {
      movement.x -= moveSpeed;
    }
    if (this.moveRight) {
      movement.x += moveSpeed;
    }
    
    // Apply movement in local space (relative to the snail's orientation)
    if (movement.length() > 0) {
      this.mesh.translateX(movement.x);
      this.mesh.translateZ(movement.z);
    }
    
    // Store the current position before movement
    const previousPosition = this.mesh.position.clone();
    
    // Keep snail on the ground
    this.mesh.position.y = 0;
    
    // Constrain movement to a specific area
    const maxDistance = 25;
    const position = this.mesh.position;
    
    position.x = Math.max(-maxDistance, Math.min(maxDistance, position.x));
    position.z = Math.max(-maxDistance, Math.min(maxDistance, position.z));
    
    // Handle body collisions
    const canvas = document.querySelector('canvas');
    if (canvas && canvas.__gameInstance) {
      // Get the collision system from the game
      const collisionSystem = canvas.__gameInstance.collisionSystem;
      if (collisionSystem) {
        const bodyCollision = collisionSystem.checkBodyCollision(this);
        
        // Handle body collision if one exists
        if (bodyCollision && bodyCollision.collision) {
          // We need to respond to the collision by moving the player away
          
          // Get the direction from player to NPC (already normalized)
          const collisionDir = bodyCollision.direction;
          
          // If we're the first body in the collision check (player), reverse the direction
          collisionDir.negate();
          
          // Calculate the displacement needed to resolve the collision
          // We share the resolution between the two bodies, so divide by 2
          const pushBackDistance = bodyCollision.overlap / 2;
          
          // Create the displacement vector
          const displacement = collisionDir.clone().multiplyScalar(pushBackDistance);
          
          // Apply the displacement to resolve the collision
          this.mesh.position.add(displacement);
        }
      }
    }
  }

  /**
   * Update the shell color based on the player's health
   */
  updateShellColor() {
    // Calculate health percentage
    const healthPercentage = this.health / this.maxHealth;
    
    // If damaged or invincible, don't update shell color
    if (this.isDamaged || this.isInvincible) {
      return;
    }
    
    // Get shell material (ensure it exists)
    if (!this.shell || !this.shell.material) {
      return;
    }
    
    // Create color based on health
    if (healthPercentage > 0.7) {
      // Full health - normal brown color, no changes needed
    } else if (healthPercentage > 0.3) {
      // Medium health - slightly more yellow tint
      this.shell.material.color.setHex(0xA55D00);
    } else {
      // Low health - reddish tint
      this.shell.material.color.setHex(0x8B3A00);
    }
  }
} 