import * as THREE from 'three';

export class Debug {
  constructor(game) {
    this.game = game;
    this.enabled = false;
    this.autoUpdate = false;
    
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
    this.npcInvincibility = document.getElementById('npc-invincibility');
    this.npcHealth = document.getElementById('npc-health');
    this.eventLog = document.getElementById('event-log');
    
    // Array to store recent events for the event log
    this.recentEvents = [];
    this.maxEvents = 5; // Maximum number of events to display
    
    // Update control elements
    this.debugUpdateBtn = document.getElementById('debug-update');
    this.autoUpdateCheckbox = document.getElementById('auto-update');
    
    // Debug visual helpers
    this.helpers = new THREE.Group();
    this.game.scene.scene.add(this.helpers);
    
    // Player hitbox visualization
    this.playerBodyHitbox = null;
    this.playerShellHitbox = null;
    
    // NPC hitbox visualization
    this.npcBodyHitbox = null;
    this.npcShellHitbox = null;
    
    // Eye stalk lines
    this.playerStalkLine = null;
    this.npcStalkLine = null;
    
    // Eye stalk tip markers
    this.playerTipMarker = null;
    this.npcTipMarker = null;
    
    // Oriented bounding boxes
    this.playerOrientedBox = null;
    this.npcOrientedBox = null;
    
    // Bind event listeners
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    // Make the debug toggle button interactive
    this.debugToggle.addEventListener('click', () => {
      this.toggleDebugMode();
    });
    
    // Manual update button
    this.debugUpdateBtn.addEventListener('click', () => {
      this.updateDebugInfo();
    });
    
    // Auto update checkbox
    this.autoUpdateCheckbox.addEventListener('change', (e) => {
      this.autoUpdate = e.target.checked;
    });
  }
  
  toggleDebugMode() {
    this.enabled = !this.enabled;
    console.log(`Debug mode toggled to: ${this.enabled}`);
    
    if (this.enabled) {
      console.log('Showing debug info and creating helpers');
      this.debugInfo.classList.remove('hidden');
      this.createDebugHelpers();
      // Enable debugging in collision detection
      this.game.collisionDetection.setDebugMode(true);
      
      // Set default for auto-update (off)
      this.autoUpdate = false;
      this.autoUpdateCheckbox.checked = false;
      
      // Update info immediately
      this.updateDebugInfo();
      console.log('Debug info updated and displayed');
    } else {
      console.log('Hiding debug info and clearing helpers');
      this.debugInfo.classList.add('hidden');
      this.clearDebugHelpers();
      // Disable debugging in collision detection
      this.game.collisionDetection.setDebugMode(false);
    }
  }
  
  createDebugHelpers() {
    // Clear any existing helpers
    this.clearDebugHelpers();
    
    // Create wireframe materials with different colors
    // Player colors - green family
    const playerBodyWireframeMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x00ff00, // Bright green for body
      wireframe: true 
    });
    
    const playerShellWireframeMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x009900, // Darker green for shell
      wireframe: true 
    });
    
    // NPC colors - red family
    const npcBodyWireframeMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff0000, // Bright red for body
      wireframe: true 
    });
    
    const npcShellWireframeMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x990000, // Darker red for shell
      wireframe: true 
    });
    
    // Create player hitbox visualizations - separate geometries for body and shell
    // Player body (capsule)
    const playerBodyGeometry = new THREE.CapsuleGeometry(1.1, 2.2, 8, 8); // Slightly larger than actual
    this.playerBodyHitbox = new THREE.Mesh(playerBodyGeometry, playerBodyWireframeMaterial);
    this.playerBodyHitbox.rotation.x = Math.PI / 2; // Match player body rotation
    this.helpers.add(this.playerBodyHitbox);
    
    // Player shell (hemisphere)
    const playerShellGeometry = new THREE.SphereGeometry(1.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    this.playerShellHitbox = new THREE.Mesh(playerShellGeometry, playerShellWireframeMaterial);
    this.helpers.add(this.playerShellHitbox);
    
    // Create NPC hitbox visualizations - separate geometries for body and shell
    // NPC body (capsule)
    const npcBodyGeometry = new THREE.CapsuleGeometry(1.1, 2.2, 8, 8); // Slightly larger than actual
    this.npcBodyHitbox = new THREE.Mesh(npcBodyGeometry, npcBodyWireframeMaterial);
    this.npcBodyHitbox.rotation.x = Math.PI / 2; // Match NPC body rotation
    this.helpers.add(this.npcBodyHitbox);
    
    // NPC shell (hemisphere)
    const npcShellGeometry = new THREE.SphereGeometry(1.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    this.npcShellHitbox = new THREE.Mesh(npcShellGeometry, npcShellWireframeMaterial);
    this.helpers.add(this.npcShellHitbox);
    
    // Add eye stalk tip marker for player
    const tipMarkerGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const tipMarkerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    this.playerTipMarker = new THREE.Mesh(tipMarkerGeometry, tipMarkerMaterial);
    this.helpers.add(this.playerTipMarker);
    
    // Add eye stalk tip marker for NPC
    const npcTipMarkerGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const npcTipMarkerMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff });
    this.npcTipMarker = new THREE.Mesh(npcTipMarkerGeometry, npcTipMarkerMaterial);
    this.helpers.add(this.npcTipMarker);
    
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
    
    // Reset all references
    this.playerBodyHitbox = null;
    this.playerShellHitbox = null;
    this.npcBodyHitbox = null;
    this.npcShellHitbox = null;
    this.playerStalkLine = null;
    this.npcStalkLine = null;
    this.playerTipMarker = null;
    this.npcTipMarker = null;
  }
  
  update() {
    if (!this.enabled) return;
    
    // Always update visual helpers
    this.updateVisualHelpers();
    
    // Only update UI information if auto-update is enabled
    if (this.autoUpdate) {
      this.updateDebugInfo();
    }
  }
  
  updateVisualHelpers() {
    // Update player hitbox components
    if (this.playerBodyHitbox && this.playerShellHitbox) {
      // We need to create groups to handle the rotation correctly
      if (!this.playerHitboxGroup) {
        this.playerHitboxGroup = new THREE.Group();
        this.helpers.add(this.playerHitboxGroup);
        
        // Move hitboxes to the group (if they're not already there)
        if (this.playerBodyHitbox.parent !== this.playerHitboxGroup) {
          this.helpers.remove(this.playerBodyHitbox);
          this.helpers.remove(this.playerShellHitbox);
          this.playerHitboxGroup.add(this.playerBodyHitbox);
          this.playerHitboxGroup.add(this.playerShellHitbox);
          
          // Reset the body hitbox position within the group
          this.playerBodyHitbox.position.set(0, 0, 0);
          
          // Position the shell relative to the body within the group
          this.playerShellHitbox.position.set(0, 0.5, -0.8);
        }
      }
      
      // Get player position
      const playerPosition = this.game.playerSnail.mesh.position.clone();
      
      // Update the group position and rotation
      this.playerHitboxGroup.position.copy(playerPosition);
      this.playerHitboxGroup.rotation.y = this.game.playerSnail.mesh.rotation.y;
    }
    
    // Update NPC hitbox components
    if (this.npcBodyHitbox && this.npcShellHitbox) {
      // We need to create groups to handle the rotation correctly
      if (!this.npcHitboxGroup) {
        this.npcHitboxGroup = new THREE.Group();
        this.helpers.add(this.npcHitboxGroup);
        
        // Move hitboxes to the group (if they're not already there)
        if (this.npcBodyHitbox.parent !== this.npcHitboxGroup) {
          this.helpers.remove(this.npcBodyHitbox);
          this.helpers.remove(this.npcShellHitbox);
          this.npcHitboxGroup.add(this.npcBodyHitbox);
          this.npcHitboxGroup.add(this.npcShellHitbox);
          
          // Reset the body hitbox position within the group
          this.npcBodyHitbox.position.set(0, 0, 0);
          
          // Position the shell relative to the body within the group
          this.npcShellHitbox.position.set(0, 0.5, -0.8);
        }
      }
      
      // Get NPC position
      const npcPosition = this.game.npcSnail.mesh.position.clone();
      
      // Update the group position and rotation
      this.npcHitboxGroup.position.copy(npcPosition);
      this.npcHitboxGroup.rotation.y = this.game.npcSnail.mesh.rotation.y;
    }
    
    // Update eye stalk tip markers
    if (this.playerTipMarker) {
      const playerStalkTipPos = this.game.playerSnail.getEyeStalkPosition();
      this.playerTipMarker.position.copy(playerStalkTipPos);
    }
    
    if (this.npcTipMarker) {
      const npcStalkPos = this.game.npcSnail.getEyeStalkPosition();
      this.npcTipMarker.position.copy(npcStalkPos);
    }
    
    // Update eye stalk lines
    this.updateEyeStalkLines();
    
    // For the NPC snail
    if (this.npcBodyHitbox && this.npcShellHitbox) {
      const npcScaleFactor = this.game.npcSnail.scaleFactor || 1;
      
      // Update body hitbox
      this.npcBodyHitbox.scale.set(npcScaleFactor, npcScaleFactor, npcScaleFactor);
      this.npcBodyHitbox.position.set(0, 0, 0);
      
      // Update shell hitbox
      this.npcShellHitbox.scale.set(npcScaleFactor, npcScaleFactor, npcScaleFactor);
      this.npcShellHitbox.position.set(0, 0.5, -0.8);
    }
  }
  
  updateDebugInfo() {
    // Calculate and display distances
    this.updateDistanceDisplays();
    
    // Check and display collision status
    this.updateCollisionStatus();
    
    // Update additional debug information
    this.updateAdditionalDebugInfo();
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
    
    // Update NPC eye stalk line (we'll use the new getEyeStalkPosition method)
    const npcStalkPos = this.game.npcSnail.getEyeStalkPosition();
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
    const npcStalkPos = this.game.npcSnail.getEyeStalkPosition();
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
      this.game.npcSnail
    );
    
    // Extract the detailed collision data
    const details = this.game.collisionDetection.lastCollisionDetails;
    let collisionType = '';
    
    if (isColliding) {
      // Determine which part was hit
      const bodyCollision = details.distanceToBody < details.bodyRadius;
      const shellCollision = details.distanceToShell < details.shellRadius;
      
      if (bodyCollision && shellCollision) {
        collisionType = 'BOTH BODY & SHELL';
      } else if (bodyCollision) {
        collisionType = 'BODY';
      } else if (shellCollision) {
        collisionType = 'SHELL';
      }
    }
    
    // If collision is newly detected, log it as an event
    if (isColliding && this.lastCollisionStatus !== true) {
      this.addEvent(`Collision detected! Hit ${collisionType}`);
      
      // If NPC is invincible during collision, log that too
      if (this.game.npcSnail.isInvincible) {
        this.addEvent("NPC is invincible - no damage taken");
      }
    }
    
    // Store last collision status to detect changes
    this.lastCollisionStatus = isColliding;
    
    // Update the collision status display
    if (isColliding) {
      this.collisionStatus.textContent = `COLLISION DETECTED! (${collisionType})`;
    } else {
      this.collisionStatus.textContent = 'No collision';
    }
    this.collisionStatus.className = isColliding ? 'collision-true' : '';
  }
  
  updateAdditionalDebugInfo() {
    // Update player strike status
    const wasStriking = this.lastStrikeStatus;
    const isStriking = this.game.playerSnail.isStriking;
    
    // Log strike events
    if (isStriking && !wasStriking) {
      this.addEvent("Strike initiated");
    } else if (!isStriking && wasStriking) {
      this.addEvent("Strike completed");
    }
    
    this.lastStrikeStatus = isStriking;
    
    this.playerStrikeStatus.textContent = 
      isStriking ? 'Yes (Striking)' : 
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

    // Update health display
    if (this.npcHealth) {
      const currentHealth = this.game.npcSnail.health;
      
      // Log health changes
      if (this.lastHealth !== undefined && currentHealth < this.lastHealth) {
        this.addEvent(`NPC took damage! Health: ${currentHealth}/${this.game.npcSnail.maxHealth}`);
      }
      
      this.lastHealth = currentHealth;
      this.npcHealth.textContent = `${currentHealth}/${this.game.npcSnail.maxHealth}`;
      
      // Color based on health percentage
      const healthPercentage = (currentHealth / this.game.npcSnail.maxHealth) * 100;
      if (healthPercentage <= 33) {
        this.npcHealth.className = 'health-critical';
      } else if (healthPercentage <= 66) {
        this.npcHealth.className = 'health-warning';
      } else {
        this.npcHealth.className = '';
      }
    }

    // Update invincibility status
    if (this.npcInvincibility) {
      const wasInvincible = this.lastInvincibleStatus;
      const isInvincible = this.game.npcSnail.isInvincible;
      
      // Log invincibility state changes
      if (isInvincible && !wasInvincible) {
        this.addEvent("Invincibility started");
      } else if (!isInvincible && wasInvincible) {
        this.addEvent("Invincibility ended");
      }
      
      this.lastInvincibleStatus = isInvincible;
      
      this.npcInvincibility.textContent = isInvincible ? 
        `Yes (${(this.game.npcSnail.invincibilityDuration - this.game.npcSnail.invincibilityTime).toFixed(2)}s left)` : 
        'No';
      this.npcInvincibility.className = isInvincible ? 'invincible-true' : '';
    }
    
    // Update event log UI
    this.updateEventLog();
  }

  /**
   * Add an event to the event log
   * @param {string} eventText - Text describing the event
   */
  addEvent(eventText) {
    const timestamp = new Date().toLocaleTimeString();
    this.recentEvents.unshift(`[${timestamp}] ${eventText}`);
    
    // Trim to max length
    if (this.recentEvents.length > this.maxEvents) {
        this.recentEvents = this.recentEvents.slice(0, this.maxEvents);
    }
  }

  /**
   * Update the event log UI with recent events
   */
  updateEventLog() {
    if (this.eventLog) {
        this.eventLog.innerHTML = '';
        
        for (const event of this.recentEvents) {
            const eventElement = document.createElement('div');
            eventElement.textContent = event;
            this.eventLog.appendChild(eventElement);
        }
    }
  }
} 