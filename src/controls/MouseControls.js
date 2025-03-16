import * as THREE from 'three';

export class MouseControls {
  constructor(playerSnail, container, gameInstance) {
    this.playerSnail = playerSnail;
    this.container = container;
    this.gameInstance = gameInstance; // Store reference to game
    
    // Mouse position
    this.mouseX = window.innerWidth / 2;  // Default to center
    this.mouseY = window.innerHeight / 2; // Default to center
    
    // Previous mouse position for calculating deltas
    this.prevMouseX = this.mouseX;
    this.prevMouseY = this.mouseY;
    
    // Mouse velocity tracking
    this.mouseVelocityX = 0;
    this.mouseVelocityY = 0;
    
    // Mouse button state
    this.isLMBPressed = false;
    
    // Attack state
    this.attackDirection = new THREE.Vector2(0, 0);
    this.attackVelocity = 0;
    
    // Camera rotation (accumulated from mouse movement)
    // Initialize with no rotation so player faces forward by default
    this.cameraRotation = {
      x: 0,
      y: 0
    };
    
    // Sensitivity settings
    this.cameraSensitivity = 0.002;
    this.attackSensitivity = 0.01;
    
    // Add variables to track initial attack mode position
    this.attackModeStartX = 0;
    this.attackModeStartY = 0;
    this.useRelativeAttackPositioning = false;
    
    // Add flags for eye stalk control
    this.isEyeStalkInitialized = false;
    this.lastUpdateTime = Date.now();
    
    // Last known stalk position for reverting after attack mode
    this.lastStalkRotationX = 0;
    this.lastStalkRotationY = 0;
    
    // Add a flag to track when we're in the first frame of attack mode
    // This will help with smooth transitions
    this.isFirstFrameOfAttackMode = false;
    
    // Track whether mouse is inside boundary circle
    this.isMouseInBoundary = true;
    
    // Keep the last valid eye stalk position when inside the boundary
    this.lastValidEyeStalkX = 0;
    this.lastValidEyeStalkY = 0;
    
    // Set up event listeners
    this.setupEventListeners();
    
    console.log("MouseControls initialized");
  }
  
  /**
   * Check if the mouse is inside the boundary circle
   * @returns {boolean} True if mouse is inside the circle
   */
  isMouseInsideBoundaryCircle() {
    // Get screen center
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    // Calculate distance from center
    const dx = this.mouseX - centerX;
    const dy = this.mouseY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Calculate boundary radius (5/3 of viewport width, 5x bigger than before)
    const boundaryRadius = Math.min(window.innerWidth * 0.33 * 5 / 2, 1000); // Match CSS max-width/2
    
    // Return true if inside, false if outside
    return distance <= boundaryRadius;
  }
  
  setupEventListeners() {
    // Track mouse movement
    this.container.addEventListener('mousemove', (event) => {
      // Store previous position
      this.prevMouseX = this.mouseX;
      this.prevMouseY = this.mouseY;
      
      // Update current mouse position
      this.mouseX = event.clientX;
      this.mouseY = event.clientY;
      
      // Calculate delta from previous position
      const deltaX = this.mouseX - this.prevMouseX;
      const deltaY = this.mouseY - this.prevMouseY;
      
      // Update mouse velocity with smoothing
      this.mouseVelocityX = this.mouseVelocityX * 0.8 + deltaX * 0.2;
      this.mouseVelocityY = this.mouseVelocityY * 0.8 + deltaY * 0.2;
      
      // Handle based on which mode we're in
      if (this.isLMBPressed) {
        // ATTACK MODE - Check if mouse is inside boundary circle
        const isInBoundary = this.isMouseInsideBoundaryCircle();
        
        // Update tracking state - used for determining behavior changes
        if (isInBoundary !== this.isMouseInBoundary) {
          this.isMouseInBoundary = isInBoundary;
          
          // If we just entered the boundary, initialize relative positioning again
          if (isInBoundary) {
            this.attackModeStartX = this.mouseX;
            this.attackModeStartY = this.mouseY;
          }
        }
        
        // Get the screen center coordinates
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        
        if (isInBoundary) {
          // INSIDE BOUNDARY: Control eye stalk as usual
          let effectiveMouseX, effectiveMouseY;
          
          if (this.useRelativeAttackPositioning) {
            // Calculate mouse position relative to where attack mode was entered
            // This prevents sudden jumps when entering attack mode with mouse off-center
            effectiveMouseX = centerX + (this.mouseX - this.attackModeStartX);
            effectiveMouseY = centerY + (this.mouseY - this.attackModeStartY);
          } else {
            // Use absolute positioning (original behavior)
            effectiveMouseX = this.mouseX;
            effectiveMouseY = this.mouseY;
          }
          
          // Calculate normalized direction from center (-1 to 1 range)
          const maxDistance = Math.min(window.innerWidth, window.innerHeight) / 2;
          const dirX = (effectiveMouseX - centerX) / maxDistance;
          const dirY = (effectiveMouseY - centerY) / maxDistance;
          
          // Convert to rotation angles with a maximum angle of 60 degrees (PI/3)
          const maxAngle = Math.PI / 3;
          const rotationX = dirY * maxAngle; // Note: Y axis is inverted in screen space
          const rotationY = dirX * maxAngle;
          
          // Apply rotation to eye stalk - with smooth transition on first frame
          if (this.isFirstFrameOfAttackMode) {
            // For smoother transition, lerp from previous position on first frame
            this.playerSnail.eyeStalk.rotation.x = THREE.MathUtils.lerp(
              this.lastStalkRotationX, 
              rotationX, 
              0.3 // Partial transition for smoothness
            );
            this.playerSnail.eyeStalk.rotation.y = THREE.MathUtils.lerp(
              this.lastStalkRotationY, 
              rotationY, 
              0.3 // Partial transition for smoothness
            );
            this.isFirstFrameOfAttackMode = false;
          } else {
            // Normal operation after first frame
            this.playerSnail.eyeStalk.rotation.x = rotationX;
            this.playerSnail.eyeStalk.rotation.y = rotationY;
          }
          
          // Store the valid eye stalk position
          this.lastValidEyeStalkX = rotationX;
          this.lastValidEyeStalkY = rotationY;
          
          // Store attack direction and calculate velocity from mouse movement
          this.attackDirection.set(dirX, dirY).normalize();
          
          // Calculate attack velocity based on current mouse movement speed
          const currentSpeed = Math.sqrt(
            this.mouseVelocityX * this.mouseVelocityX + 
            this.mouseVelocityY * this.mouseVelocityY
          );
          
          // Scale by sensitivity, and clamp between 0.5 and 5
          this.attackVelocity = Math.min(Math.max(currentSpeed * this.attackSensitivity, 0.5), 5);
        } else {
          // OUTSIDE BOUNDARY: Rotate snail/camera instead of eye stalk
          
          // Keep eye stalk at last valid position
          this.playerSnail.eyeStalk.rotation.x = this.lastValidEyeStalkX;
          this.playerSnail.eyeStalk.rotation.y = this.lastValidEyeStalkY;
          
          // Update camera rotation (similar to exploration mode)
          this.cameraRotation.y += deltaX * this.cameraSensitivity;
          this.cameraRotation.x -= deltaY * this.cameraSensitivity; // Invert Y axis
          
          // Clamp vertical rotation to prevent flipping
          const maxVerticalAngle = Math.PI / 3; // 60 degrees
          this.cameraRotation.x = Math.max(-maxVerticalAngle, Math.min(maxVerticalAngle, this.cameraRotation.x));
          
          // Importantly, we're in attack mode, so we'll directly update the player's orientation
          // This is the key behavior change: outside the circle, we rotate the entire snail
          this.playerSnail.mesh.rotation.y = this.cameraRotation.y + Math.PI;
        }
      } else {
        // CAMERA MODE - update camera rotation
        this.cameraRotation.y += deltaX * this.cameraSensitivity;
        this.cameraRotation.x -= deltaY * this.cameraSensitivity; // Invert Y axis
        
        // Clamp vertical rotation to prevent flipping
        const maxVerticalAngle = Math.PI / 3; // 60 degrees
        this.cameraRotation.x = Math.max(-maxVerticalAngle, Math.min(maxVerticalAngle, this.cameraRotation.x));
        
        // DO NOT update eye stalk position here - we'll do it in the update method
        // to avoid double updates that cause twitching
        
        // Store the current eye stalk rotation for reference
        this.lastStalkRotationX = this.playerSnail.eyeStalk.rotation.x;
        this.lastStalkRotationY = this.playerSnail.eyeStalk.rotation.y;
      }
    });
    
    // Handle mouse button down - enter attack mode
    this.container.addEventListener('mousedown', (event) => {
      if (event.button === 0) { // Left mouse button
        // Enter attack mode
        this.isLMBPressed = true;
        
        // Set flag for first frame of attack mode to enable smooth transition
        this.isFirstFrameOfAttackMode = true;
        
        // Store starting mouse position for relative positioning
        this.attackModeStartX = this.mouseX;
        this.attackModeStartY = this.mouseY;
        
        // Enable relative positioning in attack mode to prevent camera jumps
        this.useRelativeAttackPositioning = true;
        
        // Initialize boundary tracking
        this.isMouseInBoundary = this.isMouseInsideBoundaryCircle();
        
        // Reset attack values
        this.attackVelocity = 0.5; // Start with a minimum value
        
        // Store current eye stalk rotation for smooth transition
        this.lastStalkRotationX = this.playerSnail.eyeStalk.rotation.x;
        this.lastStalkRotationY = this.playerSnail.eyeStalk.rotation.y;
        
        // Initialize last valid stalk position
        this.lastValidEyeStalkX = this.lastStalkRotationX;
        this.lastValidEyeStalkY = this.lastStalkRotationY;
      }
    });
    
    // Handle mouse button up - execute attack
    this.container.addEventListener('mouseup', (event) => {
      if (event.button === 0) { // Left mouse button
        if (this.attackVelocity > 1.0) {
          // Execute a swing attack if we have sufficient velocity
          this.triggerSwingAttack();
        } else {
          // Just do a simple strike for low velocity
          this.playerSnail.strike();
        }
        
        // Exit attack mode
        this.isLMBPressed = false;
      }
    });
    
    // Handle mouse leaving window or clicking outside
    document.addEventListener('mouseup', (event) => {
      if (event.button === 0) {
        this.isLMBPressed = false;
      }
    });
    
    // Prevent losing tracking when mouse leaves the game area
    this.container.addEventListener('mouseout', () => {
      // Keep last known position, but don't change state
    });
  }
  
  /**
   * Trigger a physics-based swing attack
   */
  triggerSwingAttack() {
    // Use the current eye stalk rotation for the attack
    const eyeStalkRotationX = this.playerSnail.eyeStalk.rotation.x;
    const eyeStalkRotationY = this.playerSnail.eyeStalk.rotation.y;
    
    // Set the attack parameters in the player snail
    this.playerSnail.setAttackParameters(
      eyeStalkRotationX,
      eyeStalkRotationY,
      this.attackVelocity
    );
    
    // Trigger the actual swing attack
    this.playerSnail.swingAttack();
  }
  
  /**
   * Update method called each frame in the game loop
   * @param {number} deltaTime Time since last frame in seconds
   */
  update(deltaTime) {
    // Store the current time for update rate limiting
    this.lastUpdateTime = Date.now();
    
    // Get player snail state
    const isInAttackMode = this.isLMBPressed;
    
    // EXPLORATION MODE (mouse not pressed)
    if (!isInAttackMode) {
      // Apply camera rotation to player orientation
      this.playerSnail.mesh.rotation.y = this.cameraRotation.y + Math.PI;
      
      // In exploration mode, eye stalk follows camera direction with a gentle animation
      const targetRotationX = this.cameraRotation.x;
      const targetRotationY = 0; // Keep centered horizontally relative to body
      
      // Smoothly interpolate eye stalk rotation
      this.playerSnail.eyeStalk.rotation.x = THREE.MathUtils.lerp(
        this.playerSnail.eyeStalk.rotation.x,
        targetRotationX,
        deltaTime * 5 // Adjust the interpolation speed as needed
      );
      
      this.playerSnail.eyeStalk.rotation.y = THREE.MathUtils.lerp(
        this.playerSnail.eyeStalk.rotation.y,
        targetRotationY,
        deltaTime * 5
      );
    } 
    // ATTACK MODE (mouse pressed) - no need to do anything here 
    // since mouse movement handler already handles both inside and outside boundary cases
  }
  
  /**
   * Check if player is in attack mode (mouse pressed)
   * @returns {boolean} True if in attack mode
   */
  isInAttackMode() {
    return this.isLMBPressed;
  }
  
  /**
   * Get the current attack direction as a normalized vector
   * @returns {THREE.Vector2} Attack direction
   */
  getAttackDirection() {
    return this.attackDirection;
  }
  
  /**
   * Get the current attack velocity (based on mouse movement speed)
   * @returns {number} Attack velocity
   */
  getAttackVelocity() {
    return this.attackVelocity;
  }
  
  /**
   * Get the current camera rotation
   * @returns {object} Camera rotation with x and y components
   */
  getCameraRotation() {
    return this.cameraRotation;
  }
} 