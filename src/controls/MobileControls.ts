const MOVE_PAD_RADIUS = 54;
const LOOK_SENSITIVITY = 1.15;
const REACH_STEP_PER_FRAME = 0.055;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function bindButtonHold(button, onChange) {
  if (!button) {
    return;
  }

  const setPressed = (isPressed) => {
    button.classList.toggle('active', isPressed);
    button.setAttribute('aria-pressed', `${isPressed}`);
    onChange(isPressed);
  };

  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    button.setPointerCapture?.(event.pointerId);
    setPressed(true);
  });

  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      setPressed(false);
    });
  }
}

export class MobileControls {
  declare enabled: any;
  declare interactButton: any;
  declare jumpButton: any;
  declare leftButton: any;
  declare lockOnActive: any;
  declare lockOnButton: any;
  declare lookDeltaX: any;
  declare lookDeltaY: any;
  declare lookPad: any;
  declare lookPointerId: any;
  declare moveKnob: any;
  declare movePad: any;
  declare movePointerId: any;
  declare movementAxes: any;
  declare pendingInteract: any;
  declare pendingJump: any;
  declare planeDownButton: any;
  declare planeDownHeld: any;
  declare planeUpButton: any;
  declare planeUpHeld: any;
  declare reachDelta: any;
  declare rightButton: any;
  declare root: any;
  declare secondaryBothButton: any;
  declare stalkButtonsHeld: any;
  declare turnDeltaX: any;
  declare lastLookClientX: any;
  declare lastLookClientY: any;
  constructor(root) {
    this.root = root;
    this.enabled = false;
    this.movementAxes = { forward: 0, right: 0 };
    this.stalkButtonsHeld = {
      left: false,
      right: false,
      both: false
    };
    this.planeUpHeld = false;
    this.planeDownHeld = false;
    this.lockOnActive = false;
    this.pendingJump = false;
    this.pendingInteract = false;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.turnDeltaX = 0;
    this.reachDelta = 0;
    this.movePointerId = null;
    this.lookPointerId = null;
    this.lastLookClientX = null;
    this.lastLookClientY = null;

    if (!this.root) {
      return;
    }

    this.movePad = document.getElementById('mobile-move-pad');
    this.moveKnob = document.getElementById('mobile-move-knob');
    this.lookPad = document.getElementById('mobile-look-pad');
    this.leftButton = document.getElementById('mobile-left-stalk');
    this.rightButton = document.getElementById('mobile-right-stalk');
    this.secondaryBothButton = document.getElementById('mobile-both-stalks');
    this.jumpButton = document.getElementById('mobile-jump');
    this.interactButton = document.getElementById('mobile-interact');
    this.lockOnButton = document.getElementById('mobile-lockon');
    this.planeUpButton = document.getElementById('mobile-plane-up');
    this.planeDownButton = document.getElementById('mobile-plane-down');

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.setupMovePad();
    this.setupLookPad();

    bindButtonHold(this.leftButton, (isPressed) => {
      this.stalkButtonsHeld.left = isPressed;
    });
    bindButtonHold(this.rightButton, (isPressed) => {
      this.stalkButtonsHeld.right = isPressed;
    });
    bindButtonHold(this.secondaryBothButton, (isPressed) => {
      this.stalkButtonsHeld.both = isPressed;
    });
    bindButtonHold(this.planeUpButton, (isPressed) => {
      this.planeUpHeld = isPressed;
    });
    bindButtonHold(this.planeDownButton, (isPressed) => {
      this.planeDownHeld = isPressed;
    });

    this.jumpButton?.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.pendingJump = true;
      this.jumpButton.classList.add('active');
    });
    this.jumpButton?.addEventListener('pointerup', () => {
      this.jumpButton.classList.remove('active');
    });
    this.jumpButton?.addEventListener('pointercancel', () => {
      this.jumpButton.classList.remove('active');
    });

    this.interactButton?.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.pendingInteract = true;
      this.interactButton.classList.add('active');
    });
    this.interactButton?.addEventListener('pointerup', () => {
      this.interactButton.classList.remove('active');
    });
    this.interactButton?.addEventListener('pointercancel', () => {
      this.interactButton.classList.remove('active');
    });

    this.lockOnButton?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.lockOnActive = !this.lockOnActive;
      this.lockOnButton.classList.toggle('active', this.lockOnActive);
      this.lockOnButton.setAttribute('aria-pressed', `${this.lockOnActive}`);
    });

    window.addEventListener('blur', () => this.resetHeldState());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.resetHeldState();
      }
    });
  }

  setupMovePad() {
    if (!this.movePad) {
      return;
    }

    this.movePad.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.movePointerId = event.pointerId;
      this.movePad.setPointerCapture?.(event.pointerId);
      this.updateMovePad(event.clientX, event.clientY);
    });

    this.movePad.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.movePointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.updateMovePad(event.clientX, event.clientY);
    });

    for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.movePad.addEventListener(eventName, (event) => {
        if (event.pointerId !== undefined && event.pointerId !== this.movePointerId) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        this.movePointerId = null;
        this.movementAxes.forward = 0;
        this.movementAxes.right = 0;
        this.updateMoveKnob(0, 0);
      });
    }
  }

  updateMovePad(clientX, clientY) {
    const rect = this.movePad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const length = Math.hypot(dx, dy);
    const scale = length > MOVE_PAD_RADIUS ? MOVE_PAD_RADIUS / length : 1;
    const knobX = dx * scale;
    const knobY = dy * scale;

    this.movementAxes.right = clamp(knobX / MOVE_PAD_RADIUS, -1, 1);
    this.movementAxes.forward = clamp(-knobY / MOVE_PAD_RADIUS, -1, 1);
    this.updateMoveKnob(knobX, knobY);
  }

  updateMoveKnob(x, y) {
    if (!this.moveKnob) {
      return;
    }

    this.moveKnob.style.transform = `translate(${x}px, ${y}px)`;
  }

  setupLookPad() {
    if (!this.lookPad) {
      return;
    }

    this.lookPad.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.lookPointerId = event.pointerId;
      this.lastLookClientX = event.clientX;
      this.lastLookClientY = event.clientY;
      this.lookPad.setPointerCapture?.(event.pointerId);
      this.lookPad.classList.add('active');
    });

    this.lookPad.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.lookPointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const deltaX = event.clientX - this.lastLookClientX;
      const deltaY = event.clientY - this.lastLookClientY;
      this.lastLookClientX = event.clientX;
      this.lastLookClientY = event.clientY;
      this.recordLookDelta(deltaX * LOOK_SENSITIVITY, deltaY * LOOK_SENSITIVITY);
    });

    for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.lookPad.addEventListener(eventName, (event) => {
        if (event.pointerId !== undefined && event.pointerId !== this.lookPointerId) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        this.lookPointerId = null;
        this.lastLookClientX = null;
        this.lastLookClientY = null;
        this.lookPad.classList.remove('active');
      });
    }
  }

  recordLookDelta(deltaX, deltaY) {
    if (this.isStalkEngaged()) {
      this.lookDeltaX += deltaX;
      this.lookDeltaY += deltaY;
      return;
    }

    this.turnDeltaX += deltaX;
  }

  resetHeldState() {
    this.movePointerId = null;
    this.lookPointerId = null;
    this.lastLookClientX = null;
    this.lastLookClientY = null;
    this.movementAxes.forward = 0;
    this.movementAxes.right = 0;
    this.stalkButtonsHeld.left = false;
    this.stalkButtonsHeld.right = false;
    this.stalkButtonsHeld.both = false;
    this.planeUpHeld = false;
    this.planeDownHeld = false;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.turnDeltaX = 0;
    this.reachDelta = 0;
    this.updateMoveKnob(0, 0);
    for (const button of [
      this.leftButton,
      this.rightButton,
      this.secondaryBothButton,
      this.planeUpButton,
      this.planeDownButton,
      this.jumpButton,
      this.interactButton
    ]) {
      button?.classList.remove('active');
      button?.setAttribute?.('aria-pressed', 'false');
    }
    this.lookPad?.classList.remove('active');
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.resetHeldState();
    }
  }

  getMovementAxes() {
    if (!this.enabled) {
      return { forward: 0, right: 0 };
    }

    return {
      forward: this.movementAxes.forward,
      right: this.movementAxes.right
    };
  }

  isStalkEngaged() {
    return Boolean(
      this.stalkButtonsHeld.left ||
      this.stalkButtonsHeld.right ||
      this.stalkButtonsHeld.both
    );
  }

  isLockOnHeld() {
    return this.enabled && this.lockOnActive;
  }

  consumeJumpRequest() {
    const shouldJump = this.enabled && this.pendingJump;
    this.pendingJump = false;
    return shouldJump;
  }

  consumeInteractRequest() {
    const shouldInteract = this.enabled && this.pendingInteract;
    this.pendingInteract = false;
    return shouldInteract;
  }

  consumeCombatInput() {
    const leftHeld = this.enabled && (this.stalkButtonsHeld.left || this.stalkButtonsHeld.both);
    const rightHeld = this.enabled && (this.stalkButtonsHeld.right || this.stalkButtonsHeld.both);
    const reachDelta = this.enabled
      ? this.reachDelta +
        (this.planeUpHeld ? REACH_STEP_PER_FRAME : 0) -
        (this.planeDownHeld ? REACH_STEP_PER_FRAME : 0)
      : 0;
    const input = {
      engaged: leftHeld || rightHeld,
      leftHeld,
      rightHeld,
      lookX: this.enabled ? this.lookDeltaX : 0,
      lookY: this.enabled ? this.lookDeltaY : 0,
      turnX: (leftHeld || rightHeld) ? 0 : (this.enabled ? this.turnDeltaX : 0),
      reachDelta,
      pointerLocked: false
    };

    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.turnDeltaX = 0;
    this.reachDelta = 0;
    return input;
  }
}
