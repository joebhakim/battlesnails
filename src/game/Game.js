import * as THREE from 'three';

import { Scene } from './Scene.js';
import { Renderer } from './Renderer.js';
import { CameraController } from './CameraController.js';
import { PlayerSnail } from '../entities/PlayerSnail.js';
import { NPCSnail } from '../entities/NPCSnail.js';
import { MouseControls } from '../controls/MouseControls.js';
import { KeyboardControls } from '../controls/KeyboardControls.js';
import { CollisionDetection } from '../utils/CollisionDetection.js';
import { UI } from '../utils/UI.js';
import { Debug } from '../utils/Debug.js';
import { AudioController } from '../audio/AudioController.js';

export class Game {
  constructor(container) {
    this.container = container;
    this.scene = new Scene();
    this.renderer = new Renderer(container);
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.cameraController = new CameraController(this.camera);

    this.playerSnail = null;
    this.npcSnail = null;
    this.mouseControls = null;
    this.keyboardControls = null;
    this.collisionDetection = null;
    this.ui = null;
    this.debug = null;
    this.audio = null;

    this.isRunning = false;
    this.gameResult = null;
    this.lastFrameTime = performance.now();
  }

  init() {
    this.scene.init();

    this.playerSnail = new PlayerSnail();
    this.npcSnail = new NPCSnail();
    this.scene.scene.add(this.playerSnail.mesh);
    this.scene.scene.add(this.npcSnail.mesh);

    this.mouseControls = new MouseControls(this.container);
    this.keyboardControls = new KeyboardControls();
    this.collisionDetection = new CollisionDetection();
    this.ui = new UI();
    this.debug = new Debug(this);

    this.ui.updatePlayerHealth(this.playerSnail.health, this.playerSnail.maxHealth);
    this.ui.updateEnemyHealth(this.npcSnail.health, this.npcSnail.maxHealth);
    this.ui.setInstructions('WASD move · Hold LMB sweep · Hold RMB thrust · Click arena to capture mouse');
    this.ui.setMusicState(false);
    this.ui.setupMusicButton(this.toggleMusic.bind(this));

    this.cameraController.snapToTarget(
      this.playerSnail.getBodyPosition(),
      this.npcSnail.getBodyPosition(),
      this.playerSnail.getFacingVector()
    );
    this.onWindowResize();
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.animate();
  }

  stop() {
    this.isRunning = false;
  }

  animate() {
    if (!this.isRunning) {
      return;
    }

    requestAnimationFrame(() => this.animate());

    const now = performance.now();
    const delta = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    this.update(delta);
    this.renderer.render(this.scene.scene, this.camera);
  }

  update(delta) {
    if (this.gameResult) {
      return;
    }

    const movementAxes = this.keyboardControls.getMovementAxes();
    const movementDirection = this.cameraController.getMovementDirection(movementAxes);
    const combatInput = this.mouseControls.consumeCombatInput();

    this.playerSnail.move(movementDirection, delta);
    this.playerSnail.update(delta, combatInput);

    this.npcSnail.update(delta, this.playerSnail.getBodyPosition());
    this.resolveBodyCollision();

    this.cameraController.update(
      this.playerSnail.getBodyPosition(),
      this.npcSnail.getBodyPosition(),
      this.playerSnail.getFacingVector()
    );
    this.handleCombat();
    this.updateHud();

    if (this.debug) {
      this.debug.update();
    }
  }

  resolveBodyCollision() {
    const collision = this.collisionDetection.checkBodyCollision(this.playerSnail, this.npcSnail);
    if (!collision.collision) {
      return;
    }

    const displacement = collision.direction.clone().multiplyScalar(collision.overlap / 2);
    this.playerSnail.mesh.position.addScaledVector(displacement, -1);
    this.npcSnail.mesh.position.add(displacement);
    this.playerSnail.clampToArena();
    this.npcSnail.clampToArena();
    this.playerSnail.refreshPositionCache();
    this.npcSnail.refreshPositionCache();
  }

  handleCombat() {
    const playerImpact = this.collisionDetection.checkImpactCollision(this.playerSnail, this.npcSnail);
    this.playerSnail.setImpactPower(playerImpact.impactPower);

    if (playerImpact.collision && playerImpact.impactPower >= playerImpact.threshold) {
      const npcDamaged = this.npcSnail.takeDamage(1);
      if (npcDamaged && this.npcSnail.health <= 0) {
        this.endGame(true);
        return;
      }
    }

    const npcImpact = this.collisionDetection.checkImpactCollision(this.npcSnail, this.playerSnail);
    this.npcSnail.setImpactPower(npcImpact.impactPower);

    if (npcImpact.collision && npcImpact.impactPower >= npcImpact.threshold) {
      const playerDamaged = this.playerSnail.takeDamage(1);
      if (playerDamaged && this.playerSnail.health <= 0) {
        this.endGame(false);
      }
    }
  }

  updateHud() {
    this.ui.updatePlayerHealth(this.playerSnail.health, this.playerSnail.maxHealth);
    this.ui.updateEnemyHealth(this.npcSnail.health, this.npcSnail.maxHealth);
  }

  endGame(playerWon) {
    this.gameResult = playerWon ? 'won' : 'lost';
    if (document.pointerLockElement === this.container && document.exitPointerLock) {
      document.exitPointerLock();
    }
    this.ui.showGameOverMessage(playerWon);
    this.stop();
  }

  toggleMusic() {
    if (!this.audio) {
      this.audio = new AudioController();
    }

    if (this.audio.isPlaying) {
      this.audio.stopMusic();
    } else {
      this.audio.startMusic();
    }

    this.ui.setMusicState(this.audio.isPlaying);
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.updateSize();
  }
}
