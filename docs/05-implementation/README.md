# BattleSnails Implementation Details

This document provides a deep dive into the implementation details of key features in the BattleSnails game.

## Three.js Scene Setup

The game's 3D environment is created in the `Scene` class:

```javascript
// Scene.js (simplified)
init() {
  // Set background color (sky blue)
  this.scene.background = new THREE.Color(0x87CEEB);
  
  // Add ambient and directional lighting with shadows
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(10, 20, 10);
  directionalLight.castShadow = true;
  
  // Create a ground plane
  const groundGeometry = new THREE.PlaneGeometry(100, 100);
  const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x7CFC00, // Lawn green
    roughness: 1,
    metalness: 0
  });
  
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2; // Rotate to be horizontal
  ground.position.y = -2; // Position slightly below the origin
  ground.receiveShadow = true;
}
```

## Snail Model Construction

The snails are constructed using basic Three.js geometries, assembled into a hierarchical structure:

### Player Snail Construction

```javascript
// PlayerSnail.js (simplified)
constructor() {
  // Create the snail mesh as a group
  this.mesh = new THREE.Group();
  
  // Create body (blue capsule)
  const bodyGeometry = new THREE.CapsuleGeometry(1, 2, 4, 8);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x1E90FF });
  this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  
  // Create shell (brown hemisphere)
  const shellGeometry = new THREE.SphereGeometry(1.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const shellMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
  this.shell = new THREE.Mesh(shellGeometry, shellMaterial);
  
  // Create eye stalk (green cylinder)
  const stalkGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1.5, 8);
  const stalkMaterial = new THREE.MeshStandardMaterial({ color: 0x98FB98 });
  this.eyeStalk = new THREE.Mesh(stalkGeometry, stalkMaterial);
  
  // Create eye and pupil
  // ... (similar pattern with spheres)
  
  // Create a hidden tip object for precise collision detection
  this.eyeStalkTip = new THREE.Object3D();
  this.eyeStalkTip.position.set(0, 0.9, 0); // Just beyond the eye
  
  // Assemble the hierarchy
  this.eye.add(this.pupil);
  this.eye.add(this.eyeStalkTip);
  this.eyeStalk.add(this.eye);
  this.mesh.add(this.body);
  this.mesh.add(this.shell);
  this.mesh.add(this.eyeStalk);
}
```

## Eye Stalk Aiming Mechanics

The eye stalk aims based on mouse position, with smooth interpolation for natural movement:

```javascript
// PlayerSnail.js (simplified)
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

update(delta) {
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
  
  // Other update logic...
}
```

## Strike Animation

The strike animation is implemented through scaling and timing:

```javascript
// PlayerSnail.js (simplified)
strike() {
  if (!this.isStriking) {
    this.isStriking = true;
    this.strikeTime = 0;
  }
}

update(delta) {
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
  
  // Other update logic...
}

isAtMaxStrikeExtension() {
  if (!this.isStriking) return false;
  
  // Use a small time window around the halfway point for reliable detection
  const halfDuration = this.strikeDuration / 2;
  const tolerance = 0.05;
  
  return this.strikeTime >= halfDuration - tolerance && 
         this.strikeTime <= halfDuration + tolerance;
}
```

## Collision Detection

The collision system uses a simple but effective distance-based approach:

```javascript
// CollisionDetection.js (simplified)
checkEyeStalkCollision(eyeStalkPosition, npcBodyPosition, npcBodyRadius) {
  // Simple distance-based collision detection
  const distance = eyeStalkPosition.distanceTo(npcBodyPosition);
  
  // Store details for debugging
  this.lastCollisionDetails = {
    eyeStalkPosition: eyeStalkPosition.clone(),
    npcBodyPosition: npcBodyPosition.clone(),
    npcBodyRadius: npcBodyRadius,
    distance: distance
  };
  
  // If the distance is less than the NPC's body radius, collision detected
  this.lastCollisionResult = distance < npcBodyRadius;
  
  return this.lastCollisionResult;
}
```

### Collision Points and Visual Representation

One of the challenges in 3D game development is ensuring that the visual representation matches the logical collision points. In BattleSnails, this is handled by:

1. **Hidden Collision Objects**: Both snails have hidden `Object3D` instances positioned at the end of their eye stalks to serve as precise collision points:

```javascript
// PlayerSnail.js (simplified)
this.eyeStalkTip = new THREE.Object3D();
this.eyeStalkTip.position.set(0, 0.3, 0); // Positioned at the front of the eye
this.eye.add(this.eyeStalkTip);
```

2. **Accurate Position Retrieval**: When checking for collisions, the game gets the world position of these collision points:

```javascript
// PlayerSnail.js (simplified)
getEyeStalkPosition() {
  // Get world position of eye stalk tip for accurate collision
  const position = new THREE.Vector3();
  this.eyeStalkTip.getWorldPosition(position);
  return position;
}
```

3. **Debug Visualization**: In debug mode, small colored spheres are displayed at these collision points to help visualize the exact points used for hit detection.

This approach ensures that collision detection is based on precise points in 3D space, rather than relying on the visual models which might not precisely match the logical collision areas.

## Strike Timing and Damage System

The timing of collision checks is critical to accurate hit detection:

```javascript
// Game.js (simplified)
animate() {
  // Update entities
  this.playerSnail.update(delta);
  this.npcSnail.update(delta);
  
  // Check for collisions only at the peak of the strike animation
  if (this.playerSnail.isStriking && this.playerSnail.isAtMaxStrikeExtension()) {
    this.checkCollisions();
  }
  
  // Reset striking state when animation ends
  if (this.isPlayerStriking && !this.playerSnail.isStriking) {
    this.isPlayerStriking = false;
  }
  
  // Other animation logic...
}

checkCollisions() {
  // Only check collisions if player is striking
  if (!this.isPlayerStriking) return;
  
  // Check if player's eye stalk is hitting NPC snail
  if (this.collisionDetection.checkEyeStalkCollision(
    this.playerSnail.getEyeStalkPosition(),
    this.npcSnail.getBodyPosition(),
    this.npcSnail.getBodyRadius()
  )) {
    // Damage the NPC snail
    this.npcSnail.takeDamage(1);
    
    // Update UI
    this.ui.updateEnemyHealth(this.npcSnail.health, this.npcSnail.maxHealth);
    
    // Check for game over
    if (this.npcSnail.health <= 0) {
      this.gameOver(true);
    }
    
    // Reset strike state
    this.isPlayerStriking = false;
  }
}
```

## NPC AI Movement

The enemy snail moves using a simple AI system:

```javascript
// NPCSnail.js (simplified)
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
    
    // Boundary handling and position constraints
    // ...
  }
}
```

## UI Health Bar System

The health bar updates to reflect the enemy's current health:

```javascript
// UI.js (simplified)
updateEnemyHealth(currentHealth, maxHealth) {
  const healthPercentage = (currentHealth / maxHealth) * 100;
  this.enemyHealthBarFill.style.width = `${healthPercentage}%`;
  
  // Change color based on health
  if (healthPercentage > 70) {
    this.enemyHealthBarFill.style.backgroundColor = '#ff0000'; // Red
  } else if (healthPercentage > 30) {
    this.enemyHealthBarFill.style.backgroundColor = '#ff8000'; // Orange
  } else {
    this.enemyHealthBarFill.style.backgroundColor = '#ffff00'; // Yellow
  }
}
```

## Game Initialization and Loop

The game initializes components and runs the main game loop:

```javascript
// main.js (simplified)
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('game-container');
  
  // Create and start the game
  const game = new Game(container);
  game.init();
  game.start();
  
  // Handle window resize
  window.addEventListener('resize', () => {
    game.onWindowResize();
  });
});

// Game.js (simplified)
start() {
  if (!this.isRunning) {
    this.isRunning = true;
    this.animate();
  }
}

animate() {
  if (!this.isRunning) return;
  
  const delta = this.clock.getDelta();
  
  // Update controls
  this.mouseControls.update();
  this.keyboardControls.update(delta);
  
  // Update entities
  this.playerSnail.update(delta);
  this.npcSnail.update(delta);
  
  // Check for collisions at appropriate times
  // ...
  
  // Update debug information
  this.debug.update();
  
  // Render scene
  this.renderer.render(this.scene.scene, this.camera);
  
  // Request next frame
  requestAnimationFrame(this.animate.bind(this));
}
```

## Performance Considerations

The game is optimized in several ways:

1. **Limited Geometry**: Uses simple geometries with reasonable polygon counts
2. **Efficient Updates**: Only performs necessary calculations each frame
3. **Conditional Debugging**: Debug features only run when explicitly enabled
4. **Focused Collision Detection**: Collision checks only happen during the relevant part of the strike animation
5. **Reuse of Objects**: Using object pooling where appropriate to avoid garbage collection issues

## Browser Compatibility

The game is built to work on modern browsers that support:

1. WebGL (via Three.js)
2. ES6+ JavaScript features
3. Modern CSS

No special polyfills or fallbacks are included in this minimal implementation, as it targets modern browsers with good WebGL support. 