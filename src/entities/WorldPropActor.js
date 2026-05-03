import * as THREE from 'three';

function createMaterial(color, roughness = 0.85) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.03
  });
}

function createTree(prop) {
  const radius = prop.visual?.radius ?? prop.collisionShape?.radius ?? 4;
  const height = prop.visual?.height ?? (prop.collisionShape?.halfHeight ?? 16) * 2;
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 12),
    createMaterial(0x5b4633, 0.95)
  );
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  const canopy = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius * 2.2, 1),
    createMaterial(0x355b36, 0.92)
  );
  canopy.position.y = height * 0.48;
  canopy.scale.y = 1.3;
  canopy.castShadow = true;
  canopy.receiveShadow = true;
  group.add(trunk, canopy);
  return group;
}

function createRockSpire(prop) {
  const radius = prop.visual?.radius ?? prop.collisionShape?.radius ?? 5;
  const height = prop.visual?.height ?? (prop.collisionShape?.halfHeight ?? 6) * 2;
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(radius, height, 8),
    createMaterial(0x5f6260, 0.9)
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createSaltCone(prop) {
  const radius = prop.visual?.radius ?? prop.collisionShape?.radius ?? 1.2;
  const height = prop.visual?.height ?? (prop.collisionShape?.halfHeight ?? 0.8) * 2;
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(radius, height, 18),
    createMaterial(0xe8e3cc, 0.78)
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createBambooStick(prop) {
  const length = prop.visual?.length ?? 6;
  const radius = prop.visual?.radius ?? 0.12;
  const tilt = prop.visual?.tilt ?? 0.28;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 8),
    createMaterial(0x9aa05b, 0.8)
  );
  mesh.rotation.z = tilt;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createGravel(prop) {
  const radius = prop.visual?.radius ?? prop.collisionShape?.radius ?? 0.3;
  const mesh = new THREE.Mesh(
    new THREE.DodecahedronGeometry(radius, 0),
    createMaterial(0x77746b, 0.96)
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createRockChunk(prop) {
  const radius = prop.visual?.radius ?? prop.collisionShape?.radius ?? 1.4;
  const mesh = new THREE.Mesh(
    new THREE.DodecahedronGeometry(radius, 0),
    createMaterial(0x65645f, 0.94)
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createLog(prop) {
  const length = prop.visual?.length ?? (prop.collisionShape?.halfExtents?.x ?? 3) * 2;
  const radius = prop.visual?.radius ?? prop.collisionShape?.halfExtents?.y ?? 0.6;
  const group = new THREE.Group();
  const log = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 14),
    createMaterial(0x5f3f2a, 0.96)
  );
  log.rotation.z = Math.PI / 2;
  log.castShadow = true;
  log.receiveShadow = true;
  const capMaterial = createMaterial(0x8a6a49, 0.9);
  const capA = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.01, 14), capMaterial);
  const capB = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.01, 14), capMaterial);
  capA.position.x = -length / 2 - 0.01;
  capB.position.x = length / 2 + 0.01;
  capA.rotation.y = -Math.PI / 2;
  capB.rotation.y = Math.PI / 2;
  group.add(log, capA, capB);
  return group;
}

function createDefaultProp(prop) {
  const radius = prop.bodyRadius ?? 1;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 12, 8),
    createMaterial(0x777777)
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createPropMesh(prop) {
  switch (prop.kind) {
    case 'giant_tree':
      return createTree(prop);
    case 'rock_spire':
      return createRockSpire(prop);
    case 'rock':
      return createRockChunk(prop);
    case 'salt_cone':
      return createSaltCone(prop);
    case 'bamboo_stick':
      return createBambooStick(prop);
    case 'gravel':
      return createGravel(prop);
    case 'rotting_log':
      return createLog(prop);
    default:
      return createDefaultProp(prop);
  }
}

export class WorldPropActor {
  constructor(prop) {
    this.id = prop.id;
    this.kind = prop.kind;
    this.mesh = new THREE.Group();
    this.body = createPropMesh(prop);
    this.mesh.add(this.body);
    this.nibbleTimer = 0;
    this.applyPropState(prop);
  }

  applyPropState(prop) {
    this.mesh.position.set(prop.position.x, prop.position.y, prop.position.z);
    this.mesh.rotation.y = prop.rotationY ?? 0;
    this.mesh.visible = true;
  }

  startNibble() {
    this.nibbleTimer = 0.35;
  }

  update(delta) {
    if (this.nibbleTimer <= 0) {
      this.body.scale.setScalar(1);
      return;
    }

    this.nibbleTimer = Math.max(0, this.nibbleTimer - delta);
    const pulse = Math.sin(this.nibbleTimer * 80) * 0.05;
    this.body.scale.set(1 + pulse, 1 - pulse * 0.5, 1 + pulse);
  }
}
