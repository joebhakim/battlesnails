import * as THREE from 'three';

function createMaterial(color, roughness = 0.82) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.02,
    flatShading: true
  });
}

function createWingGeometry(side) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    side * 1, 0.04, -0.28,
    side * 0.28, 0.02, 0.54
  ], 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  return geometry;
}

export class BirdActor {
  declare birdRoot: any;
  declare body: any;
  declare flapTime: any;
  declare leftWing: any;
  declare mesh: any;
  declare rightWing: any;
  declare shadow: any;
  declare shadowMaterial: any;
  declare statePhase: any;
  constructor() {
    this.mesh = new THREE.Group();
    this.birdRoot = new THREE.Group();
    this.mesh.add(this.birdRoot);

    const bodyMaterial = createMaterial(0x2d2b27, 0.9);
    this.body = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), bodyMaterial);
    this.body.scale.set(0.9, 0.42, 1.25);
    this.birdRoot.add(this.body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 7, 5), createMaterial(0x25231f, 0.88));
    head.position.set(0, 0.12, 0.95);
    this.birdRoot.add(head);

    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.65, 4), createMaterial(0xc28b33, 0.72));
    beak.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
    beak.position.set(0, 0.08, 1.4);
    this.birdRoot.add(beak);

    const wingMaterial = createMaterial(0x24221f, 0.92);
    this.leftWing = new THREE.Mesh(createWingGeometry(1), wingMaterial);
    this.rightWing = new THREE.Mesh(createWingGeometry(-1), wingMaterial);
    this.leftWing.position.set(0.35, 0.04, 0.05);
    this.rightWing.position.set(-0.35, 0.04, 0.05);
    this.birdRoot.add(this.leftWing, this.rightWing);

    this.shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x050403,
      transparent: true,
      opacity: 0.16,
      depthWrite: false
    });
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 18), this.shadowMaterial);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 4;
    this.mesh.add(this.shadow);

    this.flapTime = 0;
    this.statePhase = 'patrol';
    this.setVisible(false);
  }

  setVisible(visible) {
    this.mesh.visible = visible;
  }

  applyCreatureState(state) {
    const bodyLength = state.bodyLength ?? 5.8;
    const wingSpan = state.wingSpan ?? bodyLength * 2;
    this.statePhase = state.phase ?? 'patrol';

    this.birdRoot.position.set(state.position.x, state.position.y, state.position.z);
    this.birdRoot.rotation.y = state.rotationY ?? 0;
    this.birdRoot.scale.setScalar(bodyLength * 0.42);
    this.leftWing.scale.set(wingSpan * 0.55, 1, bodyLength * 0.62);
    this.rightWing.scale.set(wingSpan * 0.55, 1, bodyLength * 0.62);

    this.shadow.position.set(
      state.shadowPosition.x,
      state.shadowPosition.y + 0.035,
      state.shadowPosition.z
    );
    const shadowRadius = Math.max(0.1, state.shadowRadius ?? 4);
    this.shadow.scale.set(shadowRadius, shadowRadius * 0.72, 1);
    this.shadowMaterial.opacity = Math.max(0, Math.min(0.75, state.shadowOpacity ?? 0.16));
    this.setVisible(true);
  }

  update(delta) {
    const flapSpeed = this.statePhase === 'swoop'
      ? 18
      : this.statePhase === 'tracking'
        ? 12
        : 7;
    this.flapTime += delta * flapSpeed;
    const flap = Math.sin(this.flapTime) * (this.statePhase === 'swoop' ? 0.72 : 0.42);
    this.leftWing.rotation.z = flap;
    this.rightWing.rotation.z = -flap;
    this.birdRoot.rotation.x = this.statePhase === 'swoop' ? -0.34 : 0;
  }
}
