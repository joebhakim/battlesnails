import * as THREE from 'three';

export class Debug {
  constructor(game) {
    this.game = game;
    this.enabled = false;
    
    // Debug UI elements
    this.debugToggle = document.getElementById('debug-toggle');
    this.debugInfo = document.getElementById('debug-info');
    this.playerToNpcDistance = document.getElementById('player-to-npc-distance');
    this.npcToPlayerDistance = document.getElementById('npc-to-player-distance');
    this.collisionStatus = document.getElementById('collision-status');
    
    // Additional debug UI elements
    this.playerStrikeStatus = document.getElementById('player-strike-status');
    this.eyeStalkPosition = document.getElementById('eye-stalk-position');
    this.npcBodyPosition = document.getElementById('npc-body-position');
    this.npcBodyRadius = document.getElementById('npc-body-radius');
    
    // Debug visual helpers
    this.helpers = new THREE.Group();
    this.game.scene.add(this.helpers);
    
    // Player hitbox visualization
    this.playerHitbox = null;
    
    // NPC hitbox visualization
    this.npcHitbox = null;
    
    // Eye stalk lines
    this.playerStalkLine = null;
    this.npcStalkLine = null;
    
    // Bind event listeners
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    // Make the debug toggle button interactive
    this.debugToggle.addEventListener('click', () => {
      this.toggleDebugMode();
    });
  }
  
  toggleDebugMode() {
    this.enabled = !this.enabled;
    
    if (this.enabled) {
      this.debugInfo.classList.remove('hidden');
      this.createDebugHelpers();
      // Enable debugging in collision detection
      this.game.collisionDetection.setDebugMode(true);
    } else {
      this.debugInfo.classList.add('hidden');
      this.clearDebugHelpers();
      // Disable debugging in collision detection
      this.game.collisionDetection.setDebugMode(false);
    }
    
    // Log debug mode state
    console.log(`Debug mode: ${this.enabled ? 'enabled' : 'disabled'}`);
  }
  
  createDebugHelpers() {
    // Clear any existing helpers
    this.clearDebugHelpers();
    
    // Create player hitbox visualization
    const playerHitboxGeometry = new THREE.SphereGeometry(1, 16, 16);
    const wireframeMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x00ff00, 
      wireframe: true 
    });
    
    this.playerHitbox = new THREE.Mesh(playerHitboxGeometry, wireframeMaterial);
    this.helpers.add(this.playerHitbox);
    
    // Create NPC hitbox visualization
    const npcHitboxGeometry = new THREE.SphereGeometry(
      this.game.npcSnail.bodyRadius, 
      16, 
      16
    );
    const npcWireframeMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff0000, 
      wireframe: true 
    });
    
    this.npcHitbox = new THREE.Mesh(npcHitboxGeometry, npcWireframeMaterial);
    this.helpers.add(this.npcHitbox);
    
    // Create eye stalk line for player
    const playerLineMaterial = new THREE.LineBasicMaterial({ 
      color: 0x00ffff 
    });
    const playerLineGeometry = new THREE.BufferGeometry();
    const playerLinePositions = new Float32Array(6); // 2 points × 3 coordinates
    playerLineGeometry.setAttribute(
      'position', 
      new THREE.BufferAttribute(playerLinePositions, 3)
    );
    
    this.playerStalkLine = new THREE.Line(playerLineGeometry, playerLineMaterial);
    this.helpers.add(this.playerStalkLine);
    
    // Create eye stalk line for NPC
    const npcLineMaterial = new THREE.LineBasicMaterial({ 
      color: 0xff00ff 
    });
    const npcLineGeometry = new THREE.BufferGeometry();
    const npcLinePositions = new Float32Array(6); // 2 points × 3 coordinates
    npcLineGeometry.setAttribute(
      'position', 
      new THREE.BufferAttribute(npcLinePositions, 3)
    );
    
    this.npcStalkLine = new THREE.Line(npcLineGeometry, npcLineMaterial);
    this.helpers.add(this.npcStalkLine);
  }
  
  clearDebugHelpers() {
    // Remove all debug helpers
    while (this.helpers.children.length > 0) {
      this.helpers.remove(this.helpers.children[0]);
    }
    
    this.playerHitbox = null;
    this.npcHitbox = null;
    this.playerStalkLine = null;
    this.npcStalkLine = null;
  }
  
  update() {
    if (!this.enabled) return;
    
    // Update hitbox positions
    if (this.playerHitbox && this.npcHitbox) {
      // Update player hitbox position
      const playerPosition = this.game.playerSnail.mesh.position.clone();
      this.playerHitbox.position.copy(playerPosition);
      
      // Update NPC hitbox position
      const npcPosition = this.game.npcSnail.getBodyPosition();
      this.npcHitbox.position.copy(npcPosition);
      
      // Update eye stalk lines
      this.updateEyeStalkLines();
      
      // Calculate and display distances
      this.updateDistanceDisplays();
      
      // Check and display collision status
      this.updateCollisionStatus();
      
      // Update additional debug information
      this.updateAdditionalDebugInfo();
    }
  }
  
  updateEyeStalkLines() {
    // Update player eye stalk line
    const playerStalkPos = this.game.playerSnail.getEyeStalkPosition();
    const npcBodyPos = this.game.npcSnail.getBodyPosition();
    
    const playerLinePositions = this.playerStalkLine.geometry.attributes.position.array;
    // Start point (eye stalk tip)
    playerLinePositions[0] = playerStalkPos.x;
    playerLinePositions[1] = playerStalkPos.y;
    playerLinePositions[2] = playerStalkPos.z;
    // End point (NPC body center)
    playerLinePositions[3] = npcBodyPos.x;
    playerLinePositions[4] = npcBodyPos.y;
    playerLinePositions[5] = npcBodyPos.z;
    
    this.playerStalkLine.geometry.attributes.position.needsUpdate = true;
    
    // Update NPC eye stalk line (we'll create a similar calculation for NPC to player)
    // This is simplified as the NPC doesn't actually have a functional eye stalk for attacks
    const npcStalkPos = new THREE.Vector3();
    this.game.npcSnail.eyeStalk.getWorldPosition(npcStalkPos);
    const playerBodyPos = new THREE.Vector3();
    this.game.playerSnail.body.getWorldPosition(playerBodyPos);
    
    const npcLinePositions = this.npcStalkLine.geometry.attributes.position.array;
    // Start point (NPC eye stalk)
    npcLinePositions[0] = npcStalkPos.x;
    npcLinePositions[1] = npcStalkPos.y;
    npcLinePositions[2] = npcStalkPos.z;
    // End point (player body center)
    npcLinePositions[3] = playerBodyPos.x;
    npcLinePositions[4] = playerBodyPos.y;
    npcLinePositions[5] = playerBodyPos.z;
    
    this.npcStalkLine.geometry.attributes.position.needsUpdate = true;
  }
  
  updateDistanceDisplays() {
    // Calculate player stalk to NPC body distance
    const playerStalkPos = this.game.playerSnail.getEyeStalkPosition();
    const npcBodyPos = this.game.npcSnail.getBodyPosition();
    const playerToNpcDistance = playerStalkPos.distanceTo(npcBodyPos);
    
    // Calculate NPC stalk to player body distance
    const npcStalkPos = new THREE.Vector3();
    this.game.npcSnail.eyeStalk.getWorldPosition(npcStalkPos);
    const playerBodyPos = new THREE.Vector3();
    this.game.playerSnail.body.getWorldPosition(playerBodyPos);
    const npcToPlayerDistance = npcStalkPos.distanceTo(playerBodyPos);
    
    // Update the display with distances rounded to 2 decimal places
    this.playerToNpcDistance.textContent = playerToNpcDistance.toFixed(2);
    this.npcToPlayerDistance.textContent = npcToPlayerDistance.toFixed(2);
    
    // Add distance classes for visual feedback
    this.playerToNpcDistance.className = '';
    if (playerToNpcDistance < this.game.npcSnail.bodyRadius * 1.2) {
      this.playerToNpcDistance.classList.add('distance-critical');
    } else if (playerToNpcDistance < this.game.npcSnail.bodyRadius * 2) {
      this.playerToNpcDistance.classList.add('distance-close');
    }
  }
  
  updateCollisionStatus() {
    // Check collision using the same logic as in the game
    const isColliding = this.game.collisionDetection.checkEyeStalkCollision(
      this.game.playerSnail.getEyeStalkPosition(),
      this.game.npcSnail.getBodyPosition(),
      this.game.npcSnail.getBodyRadius()
    );
    
    // Update the collision status display
    this.collisionStatus.textContent = isColliding ? 'COLLISION DETECTED!' : 'No collision';
    this.collisionStatus.className = isColliding ? 'collision-true' : '';
    
    // Log collision to console when it happens
    if (isColliding) {
      console.log('Debug: Collision detected!');
      console.log('Player eye stalk position:', this.game.playerSnail.getEyeStalkPosition());
      console.log('NPC body position:', this.game.npcSnail.getBodyPosition());
      console.log('NPC body radius:', this.game.npcSnail.getBodyRadius());
    }
  }
  
  updateAdditionalDebugInfo() {
    // Update player strike status
    this.playerStrikeStatus.textContent = 
      this.game.playerSnail.isStriking ? 'Yes (Striking)' : 
      this.game.isPlayerStriking ? 'Yes (Strike state)' : 'No';
    
    // Get positions
    const eyeStalkPos = this.game.playerSnail.getEyeStalkPosition();
    const npcBodyPos = this.game.npcSnail.getBodyPosition();
    
    // Update position displays
    this.eyeStalkPosition.textContent = 
      `x: ${eyeStalkPos.x.toFixed(2)}, y: ${eyeStalkPos.y.toFixed(2)}, z: ${eyeStalkPos.z.toFixed(2)}`;
    
    this.npcBodyPosition.textContent = 
      `x: ${npcBodyPos.x.toFixed(2)}, y: ${npcBodyPos.y.toFixed(2)}, z: ${npcBodyPos.z.toFixed(2)}`;
    
    // Update body radius display
    this.npcBodyRadius.textContent = this.game.npcSnail.bodyRadius.toFixed(2);
    
    // Highlight player strike status when striking
    if (this.game.playerSnail.isStriking || this.game.isPlayerStriking) {
      this.playerStrikeStatus.style.color = '#ffff00'; // Yellow
    } else {
      this.playerStrikeStatus.style.color = ''; // Default
    }
  }
} 