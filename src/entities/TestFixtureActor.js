import * as THREE from 'three';

const FIXTURE_COLORS = Object.freeze({
  cube: {
    body: 0x6f8fb5,
    edge: 0xd9e6f2
  },
  cylinder: {
    body: 0xb98a52,
    edge: 0xf0d3a4
  }
});

function createShapeMesh(kind, collisionShape) {
  const colors = FIXTURE_COLORS[kind] ?? FIXTURE_COLORS.cube;
  const material = new THREE.MeshStandardMaterial({
    color: colors.body,
    roughness: 0.62,
    metalness: 0.08
  });

  if (kind === 'cylinder') {
    const radius = collisionShape?.radius ?? 1.2;
    const height = (collisionShape?.halfHeight ?? 1.35) * 2;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 24), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  const halfExtents = collisionShape?.halfExtents ?? { x: 1.25, y: 1.25, z: 1.25 };
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2),
    material
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createWireframe(kind, collisionShape) {
  const colors = FIXTURE_COLORS[kind] ?? FIXTURE_COLORS.cube;
  const material = new THREE.LineBasicMaterial({
    color: colors.edge,
    transparent: true,
    opacity: 0.55
  });

  if (kind === 'cylinder') {
    const radius = collisionShape?.radius ?? 1.2;
    const height = (collisionShape?.halfHeight ?? 1.35) * 2;
    return new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.CylinderGeometry(radius, radius, height, 24)),
      material
    );
  }

  const halfExtents = collisionShape?.halfExtents ?? { x: 1.25, y: 1.25, z: 1.25 };
  return new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.BoxGeometry(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2)),
    material
  );
}

export class TestFixtureActor {
  constructor({ fixtureKind = 'cube', collisionShape = null } = {}) {
    this.fixtureKind = fixtureKind;
    this.collisionShape = collisionShape;
    this.mesh = new THREE.Group();
    this.body = createShapeMesh(fixtureKind, collisionShape);
    this.bodyCenter = new THREE.Object3D();
    this.body.add(this.bodyCenter);
    this.mesh.add(this.body);
    this.mesh.add(createWireframe(fixtureKind, collisionShape));

    this.originalBodyColor = this.body.material.color.clone();
    this.bodyRadius = 1;
    this.bodyVelocity = new THREE.Vector3();
    this.previousPosition = new THREE.Vector3();
  }

  setTerrainConfig() { }

  setVisible(visible) {
    this.mesh.visible = visible;
  }

  applyMatchState(state) {
    if (!state) {
      this.setVisible(false);
      return;
    }

    this.bodyRadius = state.bodyRadius ?? this.bodyRadius;
    this.bodyVelocity.copy(this.mesh.position).sub(this.previousPosition);
    this.previousPosition.set(state.position.x, state.position.y, state.position.z);
    this.mesh.position.copy(this.previousPosition);
    this.mesh.rotation.y = state.rotationY ?? 0;
    this.mesh.visible = state.connected !== false && (state.immortal || state.health > 0);
  }

  getBodyPosition() {
    this.mesh.updateMatrixWorld(true);
    const position = new THREE.Vector3();
    this.bodyCenter.getWorldPosition(position);
    return position;
  }

  getBodyRadius() {
    return this.bodyRadius;
  }

  getBodyVelocity() {
    return this.bodyVelocity.clone();
  }

  getEyeStalkPosition() {
    return this.getBodyPosition();
  }
}
