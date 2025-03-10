import { Scene } from './Scene.js';
import { Renderer } from './Renderer.js';
import { PlayerSnail } from '../entities/PlayerSnail.js';
import { NPCSnail } from '../entities/NPCSnail.js';
import { MouseControls } from '../controls/MouseControls.js';
import { KeyboardControls } from '../controls/KeyboardControls.js';
import { CollisionDetection } from '../utils/CollisionDetection.js';
import { UI } from '../utils/UI.js';
import { Debug } from '../utils/Debug.js';

import * as THREE from 'three';

export class Game {
  constructor(container) {
    this.container = container;
    this.clock = new THREE.Clock();
    this.isRunning = false;
    
    // Set up scene
    this.scene = new Scene();
    
    // Set up renderer
    this.renderer = new Renderer(container);
    
    // Set up camera
    this.camera = new THREE.PerspectiveCamera(
      90, // Field of view (increased from 75 to 90 for wider FOV)
      window.innerWidth / window.innerHeight, // Aspect ratio
      0.1, // Near clipping plane
      1000 // Far clipping plane
    );
    
    // Camera will be positioned dynamically in the animate method to follow the eye stalk
    
    // Set up game entities
    this.playerSnail = null;
    this.npcSnail = null;
    
    // Set up controls
    this.mouseControls = null;
    this.keyboardControls = null;
    
    // Set up utils
    this.collisionDetection = null;
    this.ui = null;
    this.debug = null;
    
    // Flag to track if player is striking
    this.isPlayerStriking = false;
  }
  
  init() {
    // Initialize scene
    this.scene.init();
    
    // Initialize game entities
    this.playerSnail = new PlayerSnail();
    this.npcSnail = new NPCSnail();
    
    // Add entities to scene
    this.scene.scene.add(this.playerSnail.mesh);
    this.scene.scene.add(this.npcSnail.mesh);
    
    // Position entities
    this.playerSnail.mesh.position.set(0, 0, 5);
    this.npcSnail.mesh.position.set(0, 0, -5);
    
    // Set up controls
    this.mouseControls = new MouseControls(this.playerSnail, this.container);
    this.keyboardControls = new KeyboardControls(this.playerSnail);
    
    // Set up utils
    this.collisionDetection = new CollisionDetection();
    this.ui = new UI();
    this.debug = new Debug(this);
    
    // Explicitly make sure the enemy health bar is at full
    this.ui.updateEnemyHealth(this.npcSnail.health, this.npcSnail.maxHealth);
    
    // Initialize player health display
    this.ui.updatePlayerHealth(this.playerSnail.health, this.playerSnail.maxHealth);
    
    // Set up event listeners
    this.setupEvents();
    
    // Handle window resize
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }
  
  setupEvents() {
    // Set up mouse events for strike action
    this.container.addEventListener('click', () => {
      // Initiate the strike animation
      this.playerSnail.strike();
      this.isPlayerStriking = true;
      
      // No need for console.logs - debug info is shown in UI
    });
  }
  
  checkCollisions() {
    // Only check player strike collisions if player is striking
    if (this.isPlayerStriking) {
      // Check if player's eye stalk is hitting NPC snail
      const playerStrikeResult = this.collisionDetection.checkEyeStalkCollision(
        this.playerSnail.getEyeStalkPosition(),
        this.npcSnail.getBodyPosition(),
        this.npcSnail.getBodyRadius()
      );
      
      if (playerStrikeResult) {
        // Try to damage the NPC snail (will be ignored if invincible)
        this.npcSnail.takeDamage(1);
        
        // Update UI
        this.ui.updateEnemyHealth(this.npcSnail.health, this.npcSnail.maxHealth);
        
        // Check if game is over
        if (this.npcSnail.health <= 0) {
          this.gameOver(true);
        }
      }
    }
    
    // Check NPC strikes against player
    if (this.npcSnail.isStriking && this.npcSnail.isAtMaxStrikeExtension()) {
      // Check if NPC's eye stalk is hitting player snail
      const npcStrikeResult = this.collisionDetection.checkEyeStalkCollision(
        this.npcSnail.getEyeStalkPosition(),
        this.playerSnail.getBodyPosition(),
        this.playerSnail.getBodyRadius()
      );
      
      if (npcStrikeResult) {
        console.log('Player hit by NPC snail!');
        
        // Try to damage the player (will be ignored if invincible)
        const damageApplied = this.playerSnail.takeDamage(1);
        
        // Update UI if damage was applied
        if (damageApplied) {
          this.ui.updatePlayerHealth(this.playerSnail.health, this.playerSnail.maxHealth);
          
          // Check if game is over
          if (this.playerSnail.health <= 0) {
            this.gameOver(false);
          }
        }
      }
    }
  }
  
  /**
   * Check for body collisions between the player and NPC snails
   * @returns {Object} Collision result with properties for collision response
   */
  checkBodyCollisions() {
    return this.collisionDetection.checkBodyCollision(
      this.playerSnail.getBodyPosition(),
      this.playerSnail.getBodyRadius(),
      this.npcSnail.getBodyPosition(),
      this.npcSnail.getBodyRadius()
    );
  }
  
  start() {
    if (!this.isRunning) {
      this.isRunning = true;
      this.animate();
    }
  }
  
  stop() {
    this.isRunning = false;
  }
  
  gameOver(playerWon) {
    this.stop();
    this.ui.showGameOverMessage(playerWon);
  }
  
  animate() {
    if (!this.isRunning) return;
    
    // Get time delta
    const delta = this.clock.getDelta();
    
    // Update controls
    this.mouseControls.update();
    this.keyboardControls.update(delta);
    
    // Check current body collisions before movement updates
    const bodyCollision = this.checkBodyCollisions();
    
    // Get player position for NPC AI targeting
    const playerPosition = this.playerSnail.mesh.position.clone();
    
    // Update entities with collision information
    this.playerSnail.update(delta, bodyCollision);
    this.npcSnail.update(delta, bodyCollision, playerPosition);
    
    // Update camera position to follow player's eye stalk
    if (this.playerSnail) {
      // Get the eye stalk position and rotation
      const eyeStalkPosition = this.playerSnail.getEyeStalkPosition();
      const eyeStalkRotation = this.playerSnail.eyeStalk.rotation.clone();
      const snailRotation = this.playerSnail.mesh.rotation.clone();
      
      // Calculate eye stalk direction vector based on its rotation
      const direction = new THREE.Vector3(0, 0, 1); // Forward vector
      
      // Apply eye stalk's vertical (X) rotation - this controls up/down
      direction.applyAxisAngle(new THREE.Vector3(1, 0, 0), eyeStalkRotation.x);
      
      // Apply snail's overall Y rotation and eye stalk's horizontal (Y) rotation
      // This controls left/right
      direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), snailRotation.y + eyeStalkRotation.y);
      
      // Reverse the direction to position camera behind the eye stalk
      direction.negate();
      
      // Scale the direction vector to desired distance
      const cameraDistance = 2; // Distance behind eye stalk
      direction.multiplyScalar(cameraDistance);
      
      // Add a small vertical offset to position camera slightly above the eye stalk
      const verticalOffset = new THREE.Vector3(0, 0.3, 0);
      
      // Set camera position
      this.camera.position.copy(eyeStalkPosition).add(direction).add(verticalOffset);
      
      // Make camera look at eye stalk position
      this.camera.lookAt(eyeStalkPosition);
    }
    
    // Check for strike collisions during strike animation from either snail
    if (this.playerSnail.isStriking || (this.npcSnail && this.npcSnail.isStriking)) {
      this.checkCollisions();
    }
    
    // Check for end of strike animation to reset striking state
    if (this.isPlayerStriking && !this.playerSnail.isStriking) {
      this.isPlayerStriking = false;
    }
    
    // Update debug information
    this.debug.update();
    
    // Render scene
    this.renderer.render(this.scene.scene, this.camera);
    
    // Request next frame
    requestAnimationFrame(this.animate.bind(this));
  }
  
  onWindowResize() {
    // Update camera aspect ratio
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    
    // Update renderer size
    this.renderer.updateSize();
  }
} 