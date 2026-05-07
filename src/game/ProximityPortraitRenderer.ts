import * as THREE from 'three';

import { NPCSnail } from '../entities/NPCSnail.js';
import { PlayerSnail } from '../entities/PlayerSnail.js';
import { DEFAULT_TERRAIN_CONFIG } from '../world/Terrain.js';

const PORTRAIT_WIDTH = 192;
const PORTRAIT_HEIGHT = 116;
const PORTRAIT_FRAME_INTERVAL = 1 / 12;
const PORTRAIT_CAMERA_FOV = 58;
const PORTRAIT_CAMERA_DISTANCE = 6.25;
const PORTRAIT_CAMERA_HEIGHT = 1.75;
const PORTRAIT_LOOK_FORWARD_OFFSET = 0.95;
const PORTRAIT_LOOK_HEIGHT = 0.95;
const PORTRAIT_DEFAULT_COLOR = 0xd7c58a;

function parseCssHexColor(value, fallback = PORTRAIT_DEFAULT_COLOR) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const match = value.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) {
    return fallback;
  }

  return Number.parseInt(match[1], 16);
}

function disposeObject3D(root) {
  root.traverse?.((object) => {
    if (object.geometry?.dispose) {
      object.geometry.dispose();
    }

    const material = object.material;
    if (Array.isArray(material)) {
      for (const entry of material) {
        entry?.dispose?.();
      }
    } else {
      material?.dispose?.();
    }
  });
}

function createPortraitState(state) {
  return {
    ...state,
    connected: true,
    health: Math.max(0.001, Number(state.health) || 0.001),
    maxHealth: Number(state.maxHealth) || 1,
    position: {
      x: state.position?.x ?? 0,
      y: state.position?.y ?? 0,
      z: state.position?.z ?? 0
    },
    supportNormal: state.supportNormal ?? { x: 0, y: 1, z: 0 },
    controlMode: state.controlMode ?? 'idle',
    controlIntensity: state.controlIntensity ?? 0,
    impactPower: state.impactPower ?? 0,
    rotationY: state.rotationY ?? 0
  };
}

export class ProximityPortraitRenderer {
  declare actors: Map<number, any>;
  declare camera: any;
  declare frameAccumulator: number;
  declare light: any;
  declare renderer: any;
  declare scene: any;
  declare sourceCanvas: HTMLCanvasElement | null;

  constructor() {
    this.sourceCanvas = null;
    this.renderer = null;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      PORTRAIT_CAMERA_FOV,
      PORTRAIT_WIDTH / PORTRAIT_HEIGHT,
      0.05,
      80
    );
    this.actors = new Map();
    this.frameAccumulator = PORTRAIT_FRAME_INTERVAL;

    this.scene.add(new THREE.AmbientLight(0xe8f2ef, 1.9));
    this.light = new THREE.DirectionalLight(0xf6e7bf, 2.35);
    this.light.position.set(3, 7, 6);
    this.scene.add(this.light);
  }

  ensureRenderer() {
    if (this.renderer) {
      return;
    }

    this.sourceCanvas = document.createElement('canvas');
    this.sourceCanvas.width = PORTRAIT_WIDTH;
    this.sourceCanvas.height = PORTRAIT_HEIGHT;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.sourceCanvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power'
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(PORTRAIT_WIDTH, PORTRAIT_HEIGHT, false);
    this.renderer.setClearColor(0x071011, 0.92);
  }

  createActorForSpeaker(speaker, state) {
    const bodyColor = parseCssHexColor(speaker.bodyColor);
    const actor = state?.profileName === 'bot'
      ? new NPCSnail({
        bodyColor,
        shellColor: 0x315047,
        shellDamagedColor: 0x556b55,
        shellCriticalColor: 0x8f574f,
        deathBurstEnabled: false
      })
      : new PlayerSnail({
        bodyColor,
        shellColor: 0x315047,
        shellDamagedColor: 0x556b55,
        shellCriticalColor: 0x8f574f,
        deathBurstEnabled: false
      });

    actor.setTerrainConfig(DEFAULT_TERRAIN_CONFIG);
    actor.setVisible(true);
    this.scene.add(actor.mesh);
    return actor;
  }

  getActor(speaker, state) {
    const existing = this.actors.get(speaker.slot);
    if (existing) {
      return existing;
    }

    const actor = this.createActorForSpeaker(speaker, state);
    this.actors.set(speaker.slot, actor);
    return actor;
  }

  removeInactiveActors(activeSlots: Set<number>) {
    for (const [slot, actor] of this.actors.entries()) {
      if (activeSlots.has(slot)) {
        continue;
      }

      this.scene.remove(actor.mesh);
      disposeObject3D(actor.mesh);
      this.actors.delete(slot);
    }
  }

  ensureCanvasResolution(canvas) {
    if (!canvas) {
      return;
    }

    if (canvas.width !== PORTRAIT_WIDTH || canvas.height !== PORTRAIT_HEIGHT) {
      canvas.width = PORTRAIT_WIDTH;
      canvas.height = PORTRAIT_HEIGHT;
    }
  }

  applyPortraitCamera(state) {
    const position = new THREE.Vector3(
      state.position.x,
      state.position.y,
      state.position.z
    );
    const facing = new THREE.Vector3(Math.sin(state.rotationY), 0, Math.cos(state.rotationY));

    this.camera.position.copy(position)
      .addScaledVector(facing, PORTRAIT_CAMERA_DISTANCE)
      .add(new THREE.Vector3(0, PORTRAIT_CAMERA_HEIGHT, 0));
    const lookTarget = position.clone()
      .addScaledVector(facing, PORTRAIT_LOOK_FORWARD_OFFSET)
      .add(new THREE.Vector3(0, PORTRAIT_LOOK_HEIGHT, 0));
    this.camera.lookAt(lookTarget);
    this.light.position.copy(position).add(new THREE.Vector3(3, 7, 5));
  }

  renderSpeakerToCanvas(speaker, state, canvas, delta) {
    if (!state?.position || !canvas) {
      return;
    }

    this.ensureRenderer();
    this.ensureCanvasResolution(canvas);

    const actor = this.getActor(speaker, state);
    const portraitState = createPortraitState(state);
    for (const cachedActor of this.actors.values()) {
      cachedActor.mesh.visible = false;
    }

    actor.applyMatchState(portraitState, Math.max(delta, PORTRAIT_FRAME_INTERVAL), {
      stalkRenderFidelity: 'full'
    });
    actor.mesh.visible = true;
    this.applyPortraitCamera(portraitState);
    this.renderer.render(this.scene, this.camera);

    const context = canvas.getContext('2d');
    if (!context || !this.sourceCanvas) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(this.sourceCanvas, 0, 0, canvas.width, canvas.height);
  }

  update(speakers: any[] = [], statesBySlot: Map<number, any> = new Map(), getCanvasForSlot = (_slot?: any) => null, delta = 0) {
    const activeSlots = new Set(speakers.map((speaker) => speaker.slot));
    this.removeInactiveActors(activeSlots);

    if (speakers.length === 0) {
      this.frameAccumulator = PORTRAIT_FRAME_INTERVAL;
      return;
    }

    this.frameAccumulator += delta;
    if (this.frameAccumulator < PORTRAIT_FRAME_INTERVAL) {
      return;
    }

    const renderDelta = this.frameAccumulator;
    this.frameAccumulator = 0;
    for (const speaker of speakers) {
      this.renderSpeakerToCanvas(
        speaker,
        statesBySlot.get(speaker.slot),
        getCanvasForSlot(speaker.slot),
        renderDelta
      );
    }
  }

  clear() {
    this.removeInactiveActors(new Set());
  }

  dispose() {
    this.clear();
    this.renderer?.dispose?.();
    this.renderer = null;
    this.sourceCanvas = null;
  }
}
