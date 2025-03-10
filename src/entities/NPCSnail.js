import * as THREE from 'three';

export class NPCSnail {
  constructor() {
    // NPC snail properties
    this.speed = 1.0;
    this.health = 3;
    this.maxHealth = 3;
    this.bodyRadius = 1.2; // Adjusted to match visual size better
    
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
    
    // Create the eye stalk (shorter than player's)
    const stalkGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1.0, 8);
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
    this.damageEffectDuration = 0.5; // In seconds
    this.originalBodyColor = this.body.material.color.clone();
  }
  
  update(delta) {
    // Update NPC AI movement
    this.updateMovement(delta);
    
    // Update damage visual effect
    if (this.isDamaged) {
      this.damageEffectTime += delta;
      
      if (this.damageEffectTime >= this.damageEffectDuration) {
        // Reset damage effect
        this.isDamaged = false;
        this.body.material.color.copy(this.originalBodyColor);
      }
    }
  }
  
  updateMovement(delta) {
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
    
    // Apply movement
    if (this.isMoving) {
      // Smoothly rotate towards target rotation
      this.mesh.rotation.y = THREE.MathUtils.lerp(
        this.mesh.rotation.y,
        this.targetRotation,
        2 * delta
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
        this.timeSinceLastMovement = 2.5; // Force a new decision soon
      }
      
      position.x = Math.max(-maxDistance, Math.min(maxDistance, position.x));
      position.z = Math.max(-maxDistance, Math.min(maxDistance, position.z));
    }
  }
  
  takeDamage(amount) {
    this.health -= amount;
    
    // Clamp health
    this.health = Math.max(0, this.health);
    
    // Start damage visual effect
    this.isDamaged = true;
    this.damageEffectTime = 0;
    this.body.material.color.set(0xFF0000); // Bright red to indicate damage
    
    // Force movement change when damaged
    this.timeSinceLastMovement = 3;
    
    // Log damage for debugging
    console.log(`NPC took ${amount} damage! Health: ${this.health}/${this.maxHealth}`);
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
} 