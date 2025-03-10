export class MouseControls {
  constructor(playerSnail, container) {
    this.playerSnail = playerSnail;
    this.container = container;
    
    // Mouse position
    this.mouseX = 0;
    this.mouseY = 0;
    
    // Set up event listeners
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    // Track mouse movement
    this.container.addEventListener('mousemove', (event) => {
      this.mouseX = event.clientX;
      this.mouseY = event.clientY;
    });
    
    // Make sure we don't lose tracking when mouse leaves the window
    this.container.addEventListener('mouseout', () => {
      // Keep last known position
    });
  }
  
  update() {
    // Update the eye stalk direction based on mouse position
    this.playerSnail.aimEyeStalk(this.mouseX, this.mouseY);
  }
} 