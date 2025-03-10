import * as THREE from 'three';

export class PlayerSnail {
  constructor() {
    // Player snail properties
    this.speed = 3.0;
    this.rotationSpeed = 2.0;
    
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
    this.eyeStalkTip.position.set(0, 0.9, 0); // Position it just beyond the eye
    
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
    this.strikeDistance = 0.5; // How far forward the eye stalk extends during strike
  }
  
  update(delta) {
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
  }
  
  aimEyeStalk(mouseX, mouseY) {
    // Convert mouse coordinates to normalized device coordinates (-1 to +1)
    const ndcX = (mouseX / window.innerWidth) * 2 - 1;
    const ndcY = -(mouseY / window.innerHeight) * 2 + 1;
    
    // Limit the rotation angles
    const maxTilt = Math.PI / 4;
    
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
} 