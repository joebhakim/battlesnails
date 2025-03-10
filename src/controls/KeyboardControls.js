export class KeyboardControls {
  constructor(playerSnail) {
    this.playerSnail = playerSnail;
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false
    };
    
    // Set up event listeners
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    // Key down event
    document.addEventListener('keydown', (event) => {
      this.handleKeyDown(event);
    });
    
    // Key up event
    document.addEventListener('keyup', (event) => {
      this.handleKeyUp(event);
    });
  }
  
  handleKeyDown(event) {
    switch (event.key.toLowerCase()) {
      case 'w':
      case 'arrowup':
        this.keys.forward = true;
        break;
      case 's':
      case 'arrowdown':
        this.keys.backward = true;
        break;
      case 'a':
      case 'arrowleft':
        this.keys.left = true;
        break;
      case 'd':
      case 'arrowright':
        this.keys.right = true;
        break;
    }
  }
  
  handleKeyUp(event) {
    switch (event.key.toLowerCase()) {
      case 'w':
      case 'arrowup':
        this.keys.forward = false;
        break;
      case 's':
      case 'arrowdown':
        this.keys.backward = false;
        break;
      case 'a':
      case 'arrowleft':
        this.keys.left = false;
        break;
      case 'd':
      case 'arrowright':
        this.keys.right = false;
        break;
    }
  }
  
  update() {
    // Update player movement based on key states
    this.playerSnail.moveForward = this.keys.forward;
    this.playerSnail.moveBackward = this.keys.backward;
    this.playerSnail.moveLeft = this.keys.left;
    this.playerSnail.moveRight = this.keys.right;
  }
} 