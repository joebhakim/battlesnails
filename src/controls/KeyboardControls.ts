export class KeyboardControls {
  declare keys: any;
  declare pendingInteract: any;
  declare pendingJump: any;
  constructor() {
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      lockOn: false
    };
    this.pendingJump = false;
    this.pendingInteract = false;

    this.setupEventListeners();
  }

  setupEventListeners() {
    document.addEventListener('keydown', (event) => {
      this.handleKeyChange(event, true);
    });

    document.addEventListener('keyup', (event) => {
      this.handleKeyChange(event, false);
    });
  }

  handleKeyChange(event, isPressed) {
    switch (event.key.toLowerCase()) {
      case 'w':
      case 'arrowup':
        this.keys.forward = isPressed;
        event.preventDefault();
        break;
      case 's':
      case 'arrowdown':
        this.keys.backward = isPressed;
        event.preventDefault();
        break;
      case 'a':
      case 'arrowleft':
        this.keys.left = isPressed;
        event.preventDefault();
        break;
      case 'd':
      case 'arrowright':
        this.keys.right = isPressed;
        event.preventDefault();
        break;
      case 'shift':
        this.keys.lockOn = isPressed;
        event.preventDefault();
        break;
      case ' ':
      case 'space':
      case 'spacebar':
        if (isPressed && !event.repeat) {
          this.pendingJump = true;
        }
        event.preventDefault();
        break;
      case 'e':
        if (isPressed && !event.repeat) {
          this.pendingInteract = true;
        }
        event.preventDefault();
        break;
    }
  }

  getMovementAxes() {
    return {
      forward: Number(this.keys.forward) - Number(this.keys.backward),
      right: Number(this.keys.right) - Number(this.keys.left)
    };
  }

  isLockOnHeld() {
    return this.keys.lockOn;
  }

  consumeJumpRequest() {
    const shouldJump = this.pendingJump;
    this.pendingJump = false;
    return shouldJump;
  }

  consumeInteractRequest() {
    const shouldInteract = this.pendingInteract;
    this.pendingInteract = false;
    return shouldInteract;
  }
}
