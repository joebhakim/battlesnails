import * as THREE from 'three';

const RENDERER_PROFILES: { id: string; options: THREE.WebGLRendererParameters }[] = [
  {
    id: 'default',
    options: {
      antialias: true,
      powerPreference: 'high-performance'
    }
  },
  {
    id: 'compatibility',
    options: {
      antialias: false,
      powerPreference: 'default'
    }
  },
  {
    id: 'low-spec',
    options: {
      antialias: false,
      stencil: false,
      powerPreference: 'low-power'
    }
  }
];

function getPixelRatioCap() {
  const isTouchDevice = (
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
    window.matchMedia?.('(hover: none), (pointer: coarse)')?.matches
  );
  return isTouchDevice ? 1.35 : 2;
}

export class Renderer {
  declare renderer: any;
  declare container: any;
  declare profileId: any;
  constructor(container) {
    this.container = container;
    this.profileId = 'default';
    this.renderer = this.createRendererWithFallback();
    this.updatePixelRatio();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = false;

    this.container.appendChild(this.renderer.domElement);
  }

  createRendererWithFallback() {
    const errors: { profileId: string; error: unknown }[] = [];

    for (const profile of RENDERER_PROFILES) {
      try {
        const renderer = new THREE.WebGLRenderer(profile.options);
        this.profileId = profile.id;
        return renderer;
      } catch (error) {
        errors.push({ profileId: profile.id, error });
      }
    }

    const details = errors
      .map(({ profileId, error }) => `${profileId}: ${error instanceof Error ? error.message : String(error)}`)
      .join(' | ');

    throw new Error(`Unable to create a WebGL renderer. ${details}`);
  }

  render(scene, camera) {
    this.renderer.render(scene, camera);
  }

  updatePixelRatio() {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, getPixelRatioCap()));
  }

  updateSize() {
    this.updatePixelRatio();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
