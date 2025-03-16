import { Scene } from './Scene.js';
import { Renderer } from './Renderer.js';
import { PlayerSnail } from '../entities/PlayerSnail.js';
import { NPCSnail } from '../entities/NPCSnail.js';
import { MouseControls } from '../controls/MouseControls.js';
import { KeyboardControls } from '../controls/KeyboardControls.js';
import { CollisionDetection } from '../utils/CollisionDetection.js';
import { UI } from '../utils/UI.js';
import { Debug } from '../utils/Debug.js';
import { AudioController } from '../audio/AudioController.js';
import { NetworkManager } from '../network/NetworkManager.js';
import { MultiplayerUI } from '../utils/MultiplayerUI.js';
import { NetworkPlayerSnail } from '../entities/NetworkPlayerSnail.js';

import * as THREE from 'three';

export class Game {
  constructor(container) {
    this.container = container;
    this.clock = new THREE.Clock();
    this.isRunning = false;
    this.lastFrameTime = Date.now();
    
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
    
    // Add cooldown timers for damage
    this.playerDamageCooldown = 0;
    this.npcDamageCooldown = 0;
    this.damageCooldownDuration = 0.5; // Half a second between possible damage
    
    // Add level tracking
    this.currentLevel = 1;
    this.isLevelTransitioning = false;
    
    // Add audio controller
    this.audio = null;
    
    // Add multiplayer components
    this.networkManager = null;
    this.multiplayerUI = null;
    this.remotePlayerSnail = null;
    this.isMultiplayerActive = false;
  }
  
  init() {
    // Initialize scene
    this.scene.init();
    
    // Initialize game entities
    this.playerSnail = new PlayerSnail();
    this.playerSnail.isActive = true; // Ensure player is active
    this.npcSnail = new NPCSnail();
    
    // Add entities to scene
    this.scene.scene.add(this.playerSnail.mesh);
    this.scene.scene.add(this.npcSnail.mesh);
    
    // Position entities
    this.playerSnail.mesh.position.set(0, 0, 5);
    this.npcSnail.mesh.position.set(0, 0, -5);
    
    // Set up controls
    this.mouseControls = new MouseControls(this.playerSnail, this.container, this);
    this.keyboardControls = new KeyboardControls(this.playerSnail);
    
    // Set up utils
    this.collisionDetection = new CollisionDetection();
    this.ui = new UI();
    this.debug = new Debug(this);
    
    // Set level info
    this.ui.setLevelInfo(1, 'Placeholder Pete');
    
    // Explicitly make sure the enemy health bar is at full
    this.ui.updateEnemyHealth(this.npcSnail.health, this.npcSnail.maxHealth);
    
    // Initialize player health display
    this.ui.updatePlayerHealth(this.playerSnail.health, this.playerSnail.maxHealth);
    
    // Set up event listeners
    this.setupEvents();
    
    // Handle window resize
    window.addEventListener('resize', this.onWindowResize.bind(this));
    
    // Initialize audio controller
    this.audio = new AudioController();
    
    // Start background music automatically
    this.audio.startMusic();
    
    // Set up music toggle button
    this.ui.setupMusicButton(this.toggleMusic.bind(this));
    
    // Initialize multiplayer components
    this.initMultiplayer();
    
    // Attach game instance to canvas for debugging and direct access
    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.__gameInstance = this;
    }
  }
  
  setupEvents() {
    // We no longer need this for strike animation
    // this.container.addEventListener('click', () => {
    //   this.playerSnail.strike();
    // });
  }
  
  checkCollisions() {
    // Get velocities and calculate potential damage with safeguards
    const playerVelocity = this.playerSnail.getEyeStalkVelocity() || 0;
    
    // For physics-based attacks, use the swing velocity as a damage multiplier
    let playerDamage = this.playerSnail.getPotentialDamage() || 0;
    if (this.playerSnail.isSwinging && this.playerSnail.currentSwingVelocity) {
      // Scale damage based on swing velocity (more velocity = more damage)
      playerDamage = Math.max(playerDamage, this.playerSnail.currentSwingVelocity * 2);
    }
    
    const npcVelocity = this.npcSnail.getEyeStalkVelocity() || 0;
    const npcDamage = this.npcSnail.getPotentialDamage() || 0;
    
    // Update the velocity display with safe values
    this.ui.updateVelocityDisplay(
      isNaN(playerVelocity) ? 0 : playerVelocity,
      isNaN(playerDamage) ? 0 : playerDamage,
      isNaN(npcVelocity) ? 0 : npcVelocity,
      isNaN(npcDamage) ? 0 : npcDamage
    );
    
    // Check if player's eye stalk is hitting NPC snail
    // Now use the new isInActiveAttackZone method that works for both strike and swing
    const playerHitNpc = this.collisionDetection.checkEyeStalkCollision(
      this.playerSnail.getEyeStalkPosition(),
      this.npcSnail
    );
    
    if (playerHitNpc && this.npcDamageCooldown <= 0 && this.playerSnail.isInActiveAttackZone()) {
      // Try to damage the NPC snail with velocity-based damage
      this.npcSnail.takeDamage(playerDamage);
      
      // Start cooldown
      this.npcDamageCooldown = this.damageCooldownDuration;
      
      // Update UI
      this.ui.updateEnemyHealth(this.npcSnail.health, this.npcSnail.maxHealth);
      
      // Check for game over
      if (this.npcSnail.health <= 0) {
        this.gameOver(true);
      }
    }
    
    // Check if NPC's eye stalk is hitting player snail
    const npcHitPlayer = this.collisionDetection.checkEyeStalkCollision(
      this.npcSnail.getEyeStalkPosition(),
      this.playerSnail
    );
    
    if (npcHitPlayer && this.playerDamageCooldown <= 0) {
      console.log('Player hit by NPC snail!');
      
      // Try to damage the player with velocity-based damage
      const damageApplied = this.playerSnail.takeDamage(npcDamage);
      
      if (damageApplied) {
        // Start cooldown
        this.playerDamageCooldown = this.damageCooldownDuration;
        
        // Update UI
        this.ui.updatePlayerHealth(this.playerSnail.health, this.playerSnail.maxHealth);
        
        // Check if game over
        if (this.playerSnail.health <= 0) {
          this.gameOver(false);
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
      this.playerSnail,
      this.npcSnail
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
  
  /**
   * Handle game over or level completion
   * @param {boolean} playerWon - Whether the player won
   */
  gameOver(playerWon) {
    if (playerWon) {
      // Player won - handle level progression
      this.handleLevelCompletion();
    } else {
      // Player lost - game over
      this.isRunning = false;
      this.ui.showGameOverMessage(false);
    }
  }
  
  /**
   * Handle level completion and transition to next level
   */
  handleLevelCompletion() {
    // Prevent multiple transitions
    if (this.isLevelTransitioning) return;
    this.isLevelTransitioning = true;
    
    // Show level complete message with countdown
    this.ui.showLevelCompleteMessage(this.currentLevel);
    
    // Remove old enemy
    this.scene.scene.remove(this.npcSnail.mesh);
    
    // Start countdown to next level
    let countdown = 3;
    this.ui.updateCountdown(countdown);
    
    const countdownInterval = setInterval(() => {
      countdown--;
      this.ui.updateCountdown(countdown);
      
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        this.startNextLevel();
      }
    }, 1000);
  }
  
  /**
   * Start the next level with a new enemy
   */
  startNextLevel() {
    // Increment level
    this.currentLevel++;
    
    // Create new NPC snail
    this.npcSnail = new NPCSnail();
    this.scene.scene.add(this.npcSnail.mesh);
    this.npcSnail.mesh.position.set(0, 0, -5);
    
    // Calculate size scale factor based on level (1.5x per level)
    const scaleFactor = Math.pow(1.5, this.currentLevel - 1);
    
    // Apply scaling to the entire enemy mesh
    this.npcSnail.mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    // Store the scale factor on the NPC for collision detection adjustments
    this.npcSnail.scaleFactor = scaleFactor;
    
    // Adjust position based on scale to prevent clipping through floor
    // The y-position needs adjustment based on how the snail is modeled
    const yOffset = (scaleFactor - 1) * 0.5; // Adjust as needed
    this.npcSnail.mesh.position.y = yOffset;
    
    // Scale difficulty with level
    this.npcSnail.speed = Math.min(10 + (this.currentLevel - 1) * 1, 15); // Cap at 15
    
    // Scale health with a more moderate 1.2x multiplier per level
    const healthScaleFactor = Math.pow(1.2, this.currentLevel - 1);
    this.npcSnail.health = Math.ceil(this.npcSnail.maxHealth * healthScaleFactor);
    this.npcSnail.maxHealth = Math.ceil(this.npcSnail.maxHealth * healthScaleFactor);
    
    // Scale eye stalk swing speed (faster at higher levels)
    // This controls how fast the enemy can swing its eye stalk to attack
    this.npcSnail.eyeStalkSwingSpeed = 1.0 + (this.currentLevel - 1) * 0.2; // 20% faster per level
    
    // Give the NPC a level-based name
    const npcName = `Placeholder Pete ${this.currentLevel}`;
    
    // Update UI with new level info
    this.ui.setLevelInfo(this.currentLevel, npcName);
    this.ui.updateEnemyHealth(this.npcSnail.health, this.npcSnail.maxHealth);
    this.ui.hideLevelCompleteMessage();
    
    // Reset transition flag
    this.isLevelTransitioning = false;
  }
  
  animate() {
    requestAnimationFrame(this.animate.bind(this));
    
    // Calculate delta time
    const now = Date.now();
    const delta = (now - this.lastFrameTime) / 1000; // Convert to seconds
    this.lastFrameTime = now;
    
    // Update player and controls
    if (this.playerSnail && this.playerSnail.isActive) {
      // Update keyboard controls for movement
      this.keyboardControls.update(delta);
      
      // Update mouse controls for camera and attack
      this.mouseControls.update(delta);
      
      // Update the player snail
      this.playerSnail.update(delta);
      
      // Check if we're in attack mode
      const isInAttackMode = this.mouseControls.isInAttackMode();
      
      // Add variables to track last camera positions for smooth transitions
      if (!this.lastCameraPosition) {
        this.lastCameraPosition = new THREE.Vector3();
        this.lastCameraTarget = new THREE.Vector3();
        this.transitionProgress = 1.0; // 1.0 means fully transitioned
      }
      
      // Calculate camera target position
      if (isInAttackMode || this.playerSnail.isStriking || this.playerSnail.isSwinging) {
        // Check if we're just entering attack mode
        if (!this.wasInAttackMode) {
          // Store the current camera position and target for smooth transition
          this.lastCameraPosition.copy(this.camera.position);
          
          // Get the current look target (approximated based on current view)
          const lookTarget = new THREE.Vector3();
          this.camera.getWorldDirection(lookTarget);
          lookTarget.multiplyScalar(10).add(this.camera.position);
          this.lastCameraTarget.copy(lookTarget);
          
          // Reset transition progress to start the transition
          this.transitionProgress = 0.0;
        }
        
        // ATTACK MODE CAMERA: Position behind the eye stalk for attack mode
        
        // Calculate eye stalk world position
        const eyeStalkPos = new THREE.Vector3();
        this.playerSnail.eyeStalk.getWorldPosition(eyeStalkPos);
        
        // Get eye stalk's forward direction
        const eyeStalkForward = new THREE.Vector3(0, 0, 1);
        eyeStalkForward.applyQuaternion(this.playerSnail.eyeStalk.getWorldQuaternion(new THREE.Quaternion()));
        eyeStalkForward.normalize();
        
        // Position camera behind the eye stalk (reverse of forward direction)
        // with a vertical offset for better visibility
        const cameraOffset = new THREE.Vector3();
        cameraOffset.copy(eyeStalkForward).multiplyScalar(-3); // 3 units back
        cameraOffset.y += 1; // Slight upward for better view
        
        // Calculate the target camera position
        const targetCameraPos = new THREE.Vector3();
        targetCameraPos.copy(eyeStalkPos).add(cameraOffset);
        
        // Calculate the target look position
        const targetLookPos = new THREE.Vector3();
        targetLookPos.copy(eyeStalkPos).add(eyeStalkForward.multiplyScalar(10));
        
        // When entering attack mode, smoothly transition the camera
        if (this.transitionProgress < 1.0) {
          // Gradually increase the transition progress
          this.transitionProgress = Math.min(1.0, this.transitionProgress + delta * 5); // Complete in 0.2 seconds
          
          // Interpolate between the previous camera position and the target position
          this.camera.position.lerpVectors(this.lastCameraPosition, targetCameraPos, this.transitionProgress);
          
          // Create a temporary vector for the interpolated look target
          const tempLookTarget = new THREE.Vector3();
          tempLookTarget.lerpVectors(this.lastCameraTarget, targetLookPos, this.transitionProgress);
          
          // Look at the interpolated target
          this.camera.lookAt(tempLookTarget);
        } else {
          // Once transition is complete, use the exact target position
          this.camera.position.copy(targetCameraPos);
          this.camera.lookAt(targetLookPos);
        }
        
        // Occasionally log eye stalk position for debugging
        if (Math.random() < 0.01) {
          console.log(`Attack camera: Eye stalk rotation: (${this.playerSnail.eyeStalk.rotation.x.toFixed(2)}, ${this.playerSnail.eyeStalk.rotation.y.toFixed(2)})`);
        }
        
        // Store attack mode as the last mode
        this.wasInAttackMode = true;
      } else {
        // EXPLORATION MODE CAMERA: Follow player with mouse-controlled rotation
        
        // If we just exited attack mode, start a new transition
        if (this.wasInAttackMode) {
          // Store the current camera position and target for smooth transition
          this.lastCameraPosition.copy(this.camera.position);
          
          // Get the current look target (approximated based on current view)
          const lookDir = new THREE.Vector3(0, 0, -1);
          lookDir.applyQuaternion(this.camera.quaternion);
          this.lastCameraTarget.copy(this.camera.position).add(lookDir.multiplyScalar(10));
          
          // Reset transition progress to start the transition
          this.transitionProgress = 0.0;
          
          // Reset the attack mode flag
          this.wasInAttackMode = false;
        }
        
        // Get camera rotation from mouse controls
        const cameraRotation = this.mouseControls.getCameraRotation();
        
        // Calculate camera position based on the snail position and camera rotation
        const cameraDistance = 5;
        const cameraHeight = 2;
        
        // Calculate horizontal position around the snail
        const cameraX = Math.sin(cameraRotation.y) * cameraDistance;
        const cameraZ = Math.cos(cameraRotation.y) * cameraDistance;
        
        // Apply the vertical rotation
        const offsetY = Math.sin(cameraRotation.x) * cameraDistance;
        const horizontalDistance = Math.cos(cameraRotation.x) * cameraDistance;
        
        // Calculate target camera position for exploration mode
        const targetCameraPos = new THREE.Vector3(
          this.playerSnail.mesh.position.x + (cameraX * horizontalDistance / cameraDistance),
          cameraHeight + offsetY,
          this.playerSnail.mesh.position.z + (cameraZ * horizontalDistance / cameraDistance)
        );
        
        // Create the look at target
        const targetLookPos = new THREE.Vector3(
          this.playerSnail.mesh.position.x,
          this.playerSnail.mesh.position.y + 1, // Look a bit above the snail
          this.playerSnail.mesh.position.z
        );
        
        // Handle smooth transition from attack mode
        if (this.transitionProgress < 1.0) {
          // Gradually increase the transition progress
          this.transitionProgress = Math.min(1.0, this.transitionProgress + delta * 5); // Complete in 0.2 seconds
          
          // Interpolate between the previous camera position and the target position
          this.camera.position.lerpVectors(this.lastCameraPosition, targetCameraPos, this.transitionProgress);
          
          // Create a temporary vector for the interpolated look target
          const tempLookTarget = new THREE.Vector3();
          tempLookTarget.lerpVectors(this.lastCameraTarget, targetLookPos, this.transitionProgress);
          
          // Look at the interpolated target
          this.camera.lookAt(tempLookTarget);
        } else {
          // Once transition is complete, use the exact positions
          this.camera.position.copy(targetCameraPos);
          this.camera.lookAt(targetLookPos);
        }
        
        // Make player face the same direction as camera in exploration mode
        this.playerSnail.mesh.rotation.y = cameraRotation.y + Math.PI;
      }
      
      // Update HUD elements
      this.ui.updatePlayerHealth(this.playerSnail.health, this.playerSnail.maxHealth);
      this.ui.updateEnemyHealth(this.npcSnail.health, this.npcSnail.maxHealth);
      this.ui.updateAttackHUD(
        isInAttackMode || this.playerSnail.isStriking || this.playerSnail.isSwinging,
        this.mouseControls.attackVelocity / 5, // Normalize to 0-1 range (max velocity is 5)
        this.mouseControls.getAttackDirection()
      );
      
      // Update NPC snail
      if (this.npcSnail) {
        this.npcSnail.update(delta, this.checkBodyCollisions(), this.playerSnail.mesh.position.clone());
      }
      
      // Update damage cooldowns
      this.playerDamageCooldown = Math.max(0, this.playerDamageCooldown - delta);
      this.npcDamageCooldown = Math.max(0, this.npcDamageCooldown - delta);
      
      // Check for collisions
      this.checkCollisions();
      
      // Update debug information if available
      if (this.debug) {
        this.debug.update();
      }
      
      // Send player state if multiplayer is active
      if (this.isMultiplayerActive && this.networkManager) {
        const playerState = {
          position: this.playerSnail.mesh.position.clone(),
          rotation: this.playerSnail.mesh.rotation.clone(),
          eyeStalkRotation: this.playerSnail.eyeStalk.rotation.clone(),
          health: this.playerSnail.health,
          isStriking: this.playerSnail.isStriking,
          isSwinging: this.playerSnail.isSwinging,
          timestamp: Date.now()
        };
        
        this.networkManager.sendPlayerState(playerState);
      }
      
      // Update remote player if available
      if (this.isMultiplayerActive && this.remotePlayerSnail) {
        this.remotePlayerSnail.networkUpdate(delta);
      }
    }
    
    // Render the scene
    this.renderer.render(this.scene.scene, this.camera);
  }
  
  onWindowResize() {
    // Update camera aspect ratio
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    
    // Update renderer size
    this.renderer.updateSize();
  }
  
  // Add a method to toggle music
  toggleMusic() {
    if (this.audio.isPlaying) {
      this.audio.stopMusic();
    } else {
      this.audio.startMusic();
    }
  }
  
  /**
   * Initialize multiplayer components
   */
  initMultiplayer() {
    // Create network manager
    this.networkManager = new NetworkManager(this);
    
    // Set up data handler
    this.networkManager.onDataReceived = (data) => {
      this.handleNetworkData(data);
    };
    
    // Add connection handlers
    this.networkManager.onConnectionEstablished = () => {
      this.handleConnectionEstablished();
    };
    
    this.networkManager.onConnectionLost = () => {
      this.handleConnectionLost();
    };
    
    // Create multiplayer UI
    this.multiplayerUI = new MultiplayerUI(this);
    
    // Create remote player
    this.remotePlayerSnail = new NetworkPlayerSnail();
    
    // Don't add to scene yet - wait for connection
  }
  
  /**
   * Handle incoming network data
   * @param {Object} data - The received data
   */
  handleNetworkData(data) {
    if (data.type === 'playerState') {
      if (this.remotePlayerSnail) {
        this.remotePlayerSnail.processNetworkData(data.data);
      }
    }
  }
  
  /**
   * Handle successful connection establishment
   */
  handleConnectionEstablished() {
    console.log('Connection established - starting multiplayer');
    this.isMultiplayerActive = true;
    
    // Add remote player to scene if not already added
    if (this.remotePlayerSnail && !this.remotePlayerSnail.mesh.parent) {
      this.scene.scene.add(this.remotePlayerSnail.mesh);
      
      // Position remote player
      const offset = this.networkManager.isHost ? -10 : 10;
      this.remotePlayerSnail.mesh.position.set(offset, 0, 0);
    }
    
    // Update UI
    this.ui.showMessage('Player connected!', 3000);
  }
  
  /**
   * Handle connection loss
   */
  handleConnectionLost() {
    console.log('Connection lost');
    this.isMultiplayerActive = false;
    
    // Remove remote player from scene
    if (this.remotePlayerSnail && this.remotePlayerSnail.mesh.parent) {
      this.scene.scene.remove(this.remotePlayerSnail.mesh);
    }
    
    // Update UI
    this.ui.showMessage('Connection lost. Attempting to reconnect...', 3000);
  }
} 