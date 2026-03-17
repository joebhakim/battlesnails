export class MouseControls {
  constructor(container) {
    this.container = container;
    this.primaryHeld = false;
    this.secondaryHeld = false;
    this.pointerLocked = false;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.lastClientX = null;
    this.lastClientY = null;

    this.setupEventListeners();
  }

  setupEventListeners() {
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.container;
    });

    window.addEventListener('mousemove', (event) => {
      const deltaX = this.pointerLocked
        ? event.movementX
        : this.lastClientX === null
          ? 0
          : event.clientX - this.lastClientX;
      const deltaY = this.pointerLocked
        ? event.movementY
        : this.lastClientY === null
          ? 0
          : event.clientY - this.lastClientY;

      this.lastClientX = event.clientX;
      this.lastClientY = event.clientY;

      if (this.primaryHeld || this.secondaryHeld) {
        this.lookDeltaX += deltaX;
        this.lookDeltaY += deltaY;
      }
    });

    this.container.addEventListener('mousedown', (event) => {
      if (event.button !== 0 && event.button !== 2) {
        return;
      }

      event.preventDefault();

      if (event.button === 0) {
        this.primaryHeld = true;
      }

      if (event.button === 2) {
        this.secondaryHeld = true;
      }

      if (!this.pointerLocked && this.container.requestPointerLock) {
        this.container.requestPointerLock();
      }
    });

    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) {
        this.primaryHeld = false;
      }

      if (event.button === 2) {
        this.secondaryHeld = false;
      }
    });

    window.addEventListener('blur', () => {
      this.primaryHeld = false;
      this.secondaryHeld = false;
      this.lookDeltaX = 0;
      this.lookDeltaY = 0;
      this.lastClientX = null;
      this.lastClientY = null;
    });

    this.container.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });
  }

  consumeCombatInput() {
    const input = {
      engaged: this.primaryHeld || this.secondaryHeld,
      leftHeld: this.primaryHeld,
      rightHeld: this.secondaryHeld,
      lookX: this.lookDeltaX,
      lookY: this.lookDeltaY,
      pointerLocked: this.pointerLocked
    };

    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    return input;
  }

  isPointerLocked() {
    return this.pointerLocked;
  }
}
