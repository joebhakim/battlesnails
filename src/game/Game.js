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
      75, // Field of view
      window.innerWidth / window.innerHeight, // Aspect ratio
      0.1, // Near clipping plane
      1000 // Far clipping plane
    );
    this.camera.position.set(0, 10, 20);
    this.camera.lookAt(0, 0, 0);
    
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
    this.scene.add(this.playerSnail.mesh);
    this.scene.add(this.npcSnail.mesh);
    
    // Set up controls
    this.mouseControls = new MouseControls(this.playerSnail, this.container);
    this.keyboardControls = new KeyboardControls(this.playerSnail);
    
    // Set up utils
    this.collisionDetection = new CollisionDetection();
    this.ui = new UI();
    
    // Initialize UI
    this.ui.updateEnemyHealth(this.npcSnail.health, this.npcSnail.maxHealth);
    
    // Initialize debug
    this.debug = new Debug(this);
    
    // Events
    this.setupEvents();
  }
  
  setupEvents() {
    // Set up mouse events for strike action
    this.container.addEventListener('click', () => {
      // Initiate the strike animation
      this.playerSnail.strike();
      this.isPlayerStriking = true;
      
      // For debugging, check collisions immediately on click
      if (this.debug.enabled) {
        console.log('Strike initiated!');
      }
      
      // We'll no longer check collision here - instead we'll check
      // during the animate loop when the eye stalk is at full extension
    });
  }
  
  checkCollisions() {
    // Only check collisions if player is striking
    if (!this.isPlayerStriking) return;
    
    // Debug log
    if (this.debug.enabled) {
      console.log('Checking collisions...');
      console.log('Player eye stalk position:', this.playerSnail.getEyeStalkPosition());
      console.log('NPC body position:', this.npcSnail.getBodyPosition());
      console.log('NPC body radius:', this.npcSnail.getBodyRadius());
    }
    
    // Check if player's eye stalk is hitting NPC snail
    if (this.collisionDetection.checkEyeStalkCollision(
      this.playerSnail.getEyeStalkPosition(),
      this.npcSnail.getBodyPosition(),
      this.npcSnail.getBodyRadius()
    )) {
      // Damage the NPC snail
      this.npcSnail.takeDamage(1);
      
      // Debug log
      console.log('Hit detected! NPC health now:', this.npcSnail.health);
      
      // Update UI
      this.ui.updateEnemyHealth(this.npcSnail.health, this.npcSnail.maxHealth);
      
      // Check if game is over
      if (this.npcSnail.health <= 0) {
        this.gameOver(true);
      }
      
      // Reset strike state so we don't keep damaging on every frame
      this.isPlayerStriking = false;
    }
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
    
    // Update entities
    this.playerSnail.update(delta);
    this.npcSnail.update(delta);
    
    // Check if the strike animation is at the point of maximum extension
    // This is when we want to check for collisions
    if (this.playerSnail.isStriking && this.playerSnail.isAtMaxStrikeExtension()) {
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