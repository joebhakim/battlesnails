import * as THREE from 'three';

export class PlayerSnail {
  constructor() {
    // Player snail properties
    this.speed = 10.0;
    this.rotationSpeed = 10.0;
    
    // Health system
    this.health = 5;
    this.maxHealth = 5;
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
    this.eye.position.set(0, 0.8, 0);
    
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
  }
  
  /**
   * Update the player snail state
   * @param {number} delta - Time delta since last frame
   * @param {Object} bodyCollision - Body collision information from collision system
   */
  update(delta, bodyCollision = null) {
    // Store the current position before movement
    const previousPosition = this.mesh.position.clone();
    
    // Update position based on movement
    const moveSpeed = this.speed * delta;
    
    if (this.moveForward) {
      this.mesh.translateZ(moveSpeed);
    }
    if (this.moveBackward) {
      this.mesh.translateZ(-moveSpeed);
    }
    if (this.moveLeft) {
      this.mesh.rotation.y += this.rotationSpeed * delta;
    }
    if (this.moveRight) {
      this.mesh.rotation.y -= this.rotationSpeed * delta;
    }
    
    // Keep snail on the ground
    this.mesh.position.y = 0;
    
    // Constrain movement to a specific area
    const maxDistance = 25;
    const position = this.mesh.position;
    
    position.x = Math.max(-maxDistance, Math.min(maxDistance, position.x));
    position.z = Math.max(-maxDistance, Math.min(maxDistance, position.z));
    
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
    
    // Handle eye stalk animation for strike
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
        this.eyeStalk.scale.z = 1;
      }
    }
    
    // Smoothly rotate eye stalk towards target
    this.eyeStalk.rotation.x = THREE.MathUtils.lerp(
      this.eyeStalk.rotation.x,
      this.targetStalkRotation.x,
      10 * delta
    );
    
    this.eyeStalk.rotation.y = THREE.MathUtils.lerp(
      this.eyeStalk.rotation.y,
      this.targetStalkRotation.y,
      10 * delta
    );
    
    // Handle damage visual effect
    if (this.isDamaged) {
      this.damageEffectTime += delta;
      
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
  
  aimEyeStalk(mouseX, mouseY) {
    // Convert mouse coordinates to normalized device coordinates (-1 to +1)
    const ndcX = (mouseX / window.innerWidth) * 2 - 1;
    const ndcY = -(mouseY / window.innerHeight) * 2 + 1;
    
    // Limit the rotation angles - keeping this as PI/2 for more humorous exaggerated effect
    const maxTilt = Math.PI / 2;
    
    // Calculate rotation based on mouse position
    this.targetStalkRotation.x = ndcY * maxTilt;
    this.targetStalkRotation.y = ndcX * maxTilt;
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
   * Get the radius of the snail body for collision detection
   * @returns {number} The collision radius
   */
  getBodyRadius() {
    return this.bodyRadius;
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
    
    // Apply damage
    this.health = Math.max(0, this.health - amount);
    
    // Set damage visual effect
    this.isDamaged = true;
    this.damageEffectTime = 0;
    this.body.material.color.set(this.damageColor);
    
    // Set invincibility period
    this.isInvincible = true;
    this.invincibilityTime = 0;
    
    console.log(`Player took ${amount} damage! Health: ${this.health}/${this.maxHealth}`);
    
    return true;
  }
} 