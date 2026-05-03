import * as THREE from 'three';

function createMaterial(color, roughness = 0.85) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.03
  });
}

function createTransparentMaterial(color, opacity = 0.55, roughness = 0.35) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.02,
    transparent: true,
    opacity,
    depthWrite: false
  });
}

function createVertexColorMaterial(roughness = 0.98) {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness,
    metalness: 0.02,
    flatShading: true,
    side: THREE.DoubleSide
  });
}

function getPropShapeHalfHeight(prop) {
  const shape = prop.collisionShape ?? {};
  if (shape.type === 'box') {
    return shape.halfExtents?.y ?? prop.bodyRadius ?? 1;
  }

  if (shape.type === 'cylinder') {
    return Number.isFinite(shape.halfHeight)
      ? shape.halfHeight
      : Number.isFinite(shape.height)
        ? shape.height / 2
        : prop.bodyRadius ?? 1;
  }

  if (shape.type === 'polygon_prism') {
    return shape.halfHeight ?? prop.bodyRadius ?? 1;
  }

  return shape.radius ?? prop.bodyRadius ?? 1;
}

function createLabelSprite(text) {
  if (typeof document === 'undefined') {
    return null;
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  const fontSize = 34;
  const paddingX = 18;
  const paddingY = 10;
  const font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  context.font = font;
  const width = Math.ceil(context.measureText(text).width + paddingX * 2);
  const height = fontSize + paddingY * 2;
  canvas.width = Math.max(64, width);
  canvas.height = height;

  context.font = font;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = 'rgba(20, 16, 12, 0.72)';
  context.strokeStyle = 'rgba(255, 244, 210, 0.92)';
  context.lineWidth = 3;
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(1.5, 1.5, canvas.width - 3, canvas.height - 3, 8);
  } else {
    context.rect(1.5, 1.5, canvas.width - 3, canvas.height - 3);
  }
  context.fill();
  context.stroke();
  context.fillStyle = '#fff4d2';
  context.strokeStyle = 'rgba(0, 0, 0, 0.75)';
  context.lineWidth = 5;
  context.strokeText(text, canvas.width / 2, canvas.height / 2);
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  const worldHeight = 4.4;
  sprite.scale.set((canvas.width / canvas.height) * worldHeight, worldHeight, 1);
  sprite.renderOrder = 20;
  sprite.visible = false;
  return sprite;
}

function createTree(prop) {
  const radius = prop.visual?.trunkRadius ?? prop.visual?.radius ?? prop.collisionShape?.radius ?? 4;
  const canopyRadius = prop.visual?.canopyRadius ?? radius * 4;
  const height = prop.visual?.height ?? (prop.collisionShape?.halfHeight ?? 16) * 2;
  const treeType = prop.visual?.treeType ?? 'deciduous';
  const group = new THREE.Group();
  const seed = hashText(prop.id ?? prop.kind ?? 'tree');
  const branchReach = prop.visual?.branchReach ?? canopyRadius * (treeType === 'conifer' ? 0.62 : 0.9);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 8),
    createMaterial(0x5b4633, 0.95)
  );
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  const branchMaterial = createMaterial(0x46321f, 0.97);
  const branchCount = treeType === 'conifer' ? 5 : 7;
  for (let index = 0; index < branchCount; index += 1) {
    const angle = (index / branchCount) * Math.PI * 2 + hashUnit(seed, index) * 0.48;
    const heightAlpha = treeType === 'conifer'
      ? 0.1 + index * 0.09
      : 0.04 + index * 0.065;
    const startY = (-height * 0.32) + height * heightAlpha;
    const branchLength = branchReach * (treeType === 'conifer'
      ? 0.72 + hashUnit(seed + 17, index) * 0.28
      : 0.68 + hashUnit(seed + 23, index) * 0.4);
    const lift = branchLength * (treeType === 'conifer'
      ? -0.12 + hashUnit(seed + 31, index) * 0.18
      : 0.08 + hashUnit(seed + 37, index) * 0.28);
    addFrustumSegment(
      group,
      branchMaterial,
      {
        x: Math.cos(angle) * radius * 0.78,
        y: startY,
        z: Math.sin(angle) * radius * 0.78
      },
      {
        x: Math.cos(angle) * (radius + branchLength),
        y: startY + lift,
        z: Math.sin(angle) * (radius + branchLength)
      },
      radius * 0.32,
      radius * 0.09,
      5
    );
  }

  if (treeType === 'conifer') {
    const needleMaterial = createMaterial(0x244b36, 0.94);
    const tierCount = 3;
    for (let index = 0; index < tierCount; index += 1) {
      const tierRadius = canopyRadius * (1 - index * 0.2);
      const tierHeight = height * 0.28;
      const tier = new THREE.Mesh(
        new THREE.ConeGeometry(tierRadius, tierHeight, 8),
        needleMaterial
      );
      tier.position.y = height * (0.28 + index * 0.18);
      tier.castShadow = true;
      tier.receiveShadow = true;
      group.add(tier);
    }
    return group;
  }

  const canopy = new THREE.Mesh(
    new THREE.IcosahedronGeometry(canopyRadius, 1),
    createMaterial(0x355b36, 0.92)
  );
  canopy.position.y = height * 0.44;
  canopy.scale.y = 1.15;
  canopy.castShadow = true;
  canopy.receiveShadow = true;
  group.add(canopy);
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
    new THREE.ConeGeometry(radius, height, 10),
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
    new THREE.CylinderGeometry(radius, radius, length, 6),
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
    createMaterial(prop.visual?.color ?? 0x65645f, 0.94)
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createRockCluster(prop) {
  const radius = prop.visual?.radius ?? prop.collisionShape?.radius ?? 1.4;
  const material = createMaterial(prop.visual?.color ?? 0x66635d, 0.96);
  const group = new THREE.Group();
  const offsets = [
    [-0.32, 0, -0.12, 0.62],
    [0.22, 0.03, 0.18, 0.78],
    [0.04, 0.12, -0.28, 0.52]
  ];

  for (const [x, y, z, scale] of offsets) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(radius * scale, 0), material);
    rock.position.set(radius * x, radius * y, radius * z);
    rock.rotation.set(radius * 0.04, x, z);
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  }

  return group;
}

function createMossCushion(prop) {
  const radius = prop.visual?.radius ?? prop.collisionShape?.radius ?? 1.2;
  const squash = prop.visual?.squash ?? 0.5;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 14, 8),
    createMaterial(0x4d8f4f, 0.98)
  );
  mesh.scale.y = squash;
  mesh.position.y = -radius * (1 - squash);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function fract(value) {
  return value - Math.floor(value);
}

function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < `${text}`.length; index += 1) {
    hash ^= `${text}`.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function hashUnit(seed, index) {
  return fract(Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453123);
}

function isPointInPolygon2D(point, polygon) {
  let inside = false;
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const intersects = ((current.z > point.z) !== (previous.z > point.z)) &&
      (point.x < ((previous.x - current.x) * (point.z - current.z)) / ((previous.z - current.z) || 0.000001) + current.x);
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function getPolygonBounds(points) {
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    maxX: Math.max(bounds.maxX, point.x),
    minZ: Math.min(bounds.minZ, point.z),
    maxZ: Math.max(bounds.maxZ, point.z)
  }), {
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity
  });
}

function getScalePlateBoundary(center, along, across, length, width, noseJitter = 0) {
  const points = [
    [-0.58, -0.34],
    [-0.42, 0.42],
    [-0.05, 0.55],
    [0.42, 0.34],
    [0.62 + noseJitter, 0],
    [0.42, -0.34],
    [-0.05, -0.55]
  ];

  return points.map(([u, v]) => ({
    x: center.x + along.x * u * length + across.x * v * width,
    z: center.z + along.z * u * length + across.z * v * width,
    u
  }));
}

function pushFanGeometry({ positions, colors, indices, points, centerY, colorPalette, seed, yForPoint }) {
  if (points.length < 3) {
    return;
  }

  const startIndex = positions.length / 3;
  const center = points.reduce((accumulator, point) => ({
    x: accumulator.x + point.x / points.length,
    z: accumulator.z + point.z / points.length
  }), { x: 0, z: 0 });
  const centerColor = colorPalette[Math.floor(hashUnit(seed, 0) * colorPalette.length)]?.clone() ?? colorPalette[0].clone();
  positions.push(center.x, centerY, center.z);
  colors.push(centerColor.r, centerColor.g, centerColor.b);

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const y = yForPoint(point, index);
    positions.push(point.x, y, point.z);
    const color = colorPalette[Math.floor(hashUnit(seed, index + 1) * colorPalette.length)]?.clone() ?? colorPalette[0].clone();
    color.offsetHSL(0, 0, (hashUnit(seed, index + 19) - 0.5) * 0.12);
    colors.push(color.r, color.g, color.b);
  }

  for (let index = 1; index <= points.length; index += 1) {
    const next = index === points.length ? 1 : index + 1;
    indices.push(startIndex, startIndex + next, startIndex + index);
  }
}

function createRoughGroundPatch(prop, {
  baseColor,
  palette,
  xSegments = 10,
  zSegments = 7,
  roughnessMultiplier = 0.52,
  baseThicknessScale = 0.55,
  surfaceLift = 0.34
}) {
  const length = prop.visual?.length ?? (prop.collisionShape?.halfExtents?.x ?? 3) * 2;
  const width = prop.visual?.width ?? (prop.collisionShape?.halfExtents?.z ?? 2) * 2;
  const thickness = prop.visual?.thickness ?? (prop.collisionShape?.halfExtents?.y ?? 0.08) * 2;
  const roughness = prop.visual?.roughness ?? 0.75;
  const group = new THREE.Group();
  const footprint = Array.isArray(prop.visual?.footprint)
    ? prop.visual.footprint.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z))
    : [];
  const colorPalette = palette.map((color) => new THREE.Color(color));

  if (footprint.length >= 3) {
    const positions = [];
    const colors = [];
    const indices = [];
    const seed = hashText(prop.id ?? prop.kind ?? 'ground-patch');
    const shapeHalfHeight = prop.collisionShape?.halfHeight ?? thickness / 2;
    const relief = prop.visual?.relief ?? thickness * roughness * 0.35;
    const grainAngle = prop.visual?.grainAngle ?? 0;
    const scaleLength = Math.max(1.2, prop.visual?.scaleLength ?? length * 0.14);
    const scaleWidth = Math.max(0.7, prop.visual?.scaleWidth ?? width * 0.08);
    const density = Math.max(0.2, prop.visual?.scaleDensity ?? 0.65);
    const maxPlateLimit = Math.max(8, prop.visual?.maxPlates ?? 34);
    const plateCoverage = Math.max(0.08, prop.visual?.plateCoverage ?? 0.18);
    const along = { x: Math.cos(grainAngle), z: Math.sin(grainAngle) };
    const across = { x: -along.z, z: along.x };
    const bounds = getPolygonBounds(footprint);

    pushFanGeometry({
      positions,
      colors,
      indices,
      points: footprint,
      centerY: -shapeHalfHeight + thickness * 0.08,
      colorPalette,
      seed,
      yForPoint: (point, index) => {
        const waveA = Math.sin((point.x * 0.037) + (point.z * 0.041) + index * 1.37);
        const waveB = Math.cos((point.x * 0.029) - (point.z * 0.033) + index * 0.79);
        return -shapeHalfHeight + thickness * 0.08 + (waveA * 0.55 + waveB * 0.45) * thickness * roughness * 0.08;
      }
    });

    const platePositions = [];
    const stepU = scaleLength * 0.76;
    const stepV = scaleWidth * 0.74;
    const diagonal = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    const minU = -diagonal;
    const maxU = diagonal;
    const minV = -diagonal;
    const maxV = diagonal;
    const maxPlates = Math.max(8, Math.min(maxPlateLimit, Math.round((length * width) / Math.max(1, scaleLength * scaleWidth) * plateCoverage * density)));

    for (let row = 0, v = minV; v <= maxV && platePositions.length < maxPlates; row += 1, v += stepV) {
      const rowOffset = row % 2 === 0 ? 0 : stepU * 0.44;
      for (let column = 0, u = minU + rowOffset; u <= maxU && platePositions.length < maxPlates; column += 1, u += stepU) {
        const jitterU = (hashUnit(seed + row * 31, column) - 0.5) * scaleLength * 0.26;
        const jitterV = (hashUnit(seed + column * 17, row) - 0.5) * scaleWidth * 0.34;
        const center = {
          x: along.x * (u + jitterU) + across.x * (v + jitterV),
          z: along.z * (u + jitterU) + across.z * (v + jitterV)
        };
        if (
          center.x < bounds.minX - scaleLength ||
          center.x > bounds.maxX + scaleLength ||
          center.z < bounds.minZ - scaleLength ||
          center.z > bounds.maxZ + scaleLength ||
          !isPointInPolygon2D(center, footprint)
        ) {
          continue;
        }
        platePositions.push({ center, row, column });
      }
    }

    for (const [plateIndex, plate] of platePositions.entries()) {
      const plateLength = scaleLength * (0.86 + hashUnit(seed + plate.row, plate.column + 5) * 0.42);
      const plateWidth = scaleWidth * (0.82 + hashUnit(seed + plate.column, plate.row + 11) * 0.38);
      const localAngle = (hashUnit(seed + plateIndex, 23) - 0.5) * 0.32;
      const localAlong = {
        x: Math.cos(grainAngle + localAngle),
        z: Math.sin(grainAngle + localAngle)
      };
      const localAcross = { x: -localAlong.z, z: localAlong.x };
      const boundary = getScalePlateBoundary(
        plate.center,
        localAlong,
        localAcross,
        plateLength,
        plateWidth,
        (hashUnit(seed, plateIndex + 29) - 0.5) * 0.12
      );
      const clippedBoundary = boundary.filter((point) => isPointInPolygon2D(point, footprint));
      if (clippedBoundary.length < 3) {
        continue;
      }

      const plateBase = -shapeHalfHeight + thickness * (0.42 + hashUnit(seed, plateIndex + 37) * 0.18);
      pushFanGeometry({
        positions,
        colors,
        indices,
        points: clippedBoundary,
        centerY: plateBase + relief * 0.36,
        colorPalette,
        seed: seed + plateIndex * 101,
        yForPoint: (point, index) => {
          const frontLift = Math.max(0, point.u + 0.58) / 1.2;
          const crinkle = (hashUnit(seed + plateIndex * 13, index) - 0.5) * relief * roughness * roughnessMultiplier;
          return plateBase + frontLift * relief + crinkle;
        }
      });
    }

    const surfaceGeometry = new THREE.BufferGeometry();
    surfaceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    surfaceGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    surfaceGeometry.setIndex(indices);
    surfaceGeometry.computeVertexNormals();
    const surface = new THREE.Mesh(surfaceGeometry, createVertexColorMaterial(0.99));
    surface.castShadow = true;
    surface.receiveShadow = true;
    group.add(surface);
    return group;
  }

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(length, thickness * baseThicknessScale, width),
    createMaterial(prop.visual?.color ?? baseColor, 0.98)
  );
  base.position.y = -thickness * 0.12;
  base.receiveShadow = true;
  group.add(base);

  const positions = [];
  const colors = [];
  const indices = [];

  for (let zIndex = 0; zIndex <= zSegments; zIndex += 1) {
    for (let xIndex = 0; xIndex <= xSegments; xIndex += 1) {
      const u = xIndex / xSegments;
      const v = zIndex / zSegments;
      const edgeTaper = Math.min(u, v, 1 - u, 1 - v);
      const edgeLift = Math.max(0, 0.18 - edgeTaper) * thickness * 0.35;
      const waveA = Math.sin((xIndex * 1.73) + (zIndex * 2.41));
      const waveB = Math.cos((xIndex * 3.17) - (zIndex * 1.29));
      const crinkle = ((waveA * 0.55) + (waveB * 0.45)) * thickness * roughness * roughnessMultiplier;
      const xJitter = Math.sin((xIndex * 8.31) + (zIndex * 2.23)) * length * 0.014 * roughness;
      const zJitter = Math.cos((xIndex * 4.17) - (zIndex * 6.37)) * width * 0.018 * roughness;
      const x = ((u - 0.5) * length) + xJitter;
      const z = ((v - 0.5) * width) + zJitter;
      const y = (thickness * surfaceLift) + edgeLift + crinkle;
      positions.push(x, y, z);

      const paletteIndex = Math.abs(Math.floor((waveA + waveB + 2) * 1.7 + xIndex + zIndex)) % colorPalette.length;
      const color = colorPalette[paletteIndex].clone();
      color.offsetHSL(0, 0, Math.max(-0.08, Math.min(0.08, crinkle / Math.max(thickness * 6, 0.001))));
      colors.push(color.r, color.g, color.b);
    }
  }

  const verticesPerRow = xSegments + 1;
  for (let zIndex = 0; zIndex < zSegments; zIndex += 1) {
    for (let xIndex = 0; xIndex < xSegments; xIndex += 1) {
      const topLeft = zIndex * verticesPerRow + xIndex;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + verticesPerRow;
      const bottomRight = bottomLeft + 1;
      if ((xIndex + zIndex) % 2 === 0) {
        indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
      } else {
        indices.push(topLeft, bottomLeft, bottomRight, topLeft, bottomRight, topRight);
      }
    }
  }

  const surfaceGeometry = new THREE.BufferGeometry();
  surfaceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  surfaceGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  surfaceGeometry.setIndex(indices);
  surfaceGeometry.computeVertexNormals();
  const surface = new THREE.Mesh(surfaceGeometry, createVertexColorMaterial(0.99));
  surface.castShadow = true;
  surface.receiveShadow = true;
  group.add(surface);

  return group;
}

function createMossMat(prop) {
  return createRoughGroundPatch(prop, {
    baseColor: 0x4d8f4f,
    palette: [0x244b36, 0x3f7c43, 0x4d8f4f, 0x5fa64d, 0x6dad50],
    roughnessMultiplier: 0.48,
    surfaceLift: 0.42
  });
}

function createDewBead(prop) {
  const radius = prop.visual?.radius ?? prop.collisionShape?.radius ?? 0.8;
  const group = new THREE.Group();
  const bead = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 12, 8),
    createTransparentMaterial(0xa6e7ff, 0.58, 0.18)
  );
  const highlight = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.28, 8, 6),
    createTransparentMaterial(0xffffff, 0.72, 0.08)
  );
  highlight.position.set(-radius * 0.28, radius * 0.38, radius * 0.24);
  bead.castShadow = true;
  bead.receiveShadow = true;
  group.add(bead, highlight);
  return group;
}

function createDewPool(prop) {
  const radius = prop.visual?.radius ?? prop.collisionShape?.radius ?? 2;
  const height = prop.visual?.height ?? (prop.collisionShape?.halfHeight ?? 0.03) * 2;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 0.92, height, 14),
    createTransparentMaterial(0x7fdcff, 0.45, 0.2)
  );
  mesh.receiveShadow = true;
  return mesh;
}

function createMushroom(prop) {
  const capRadius = prop.visual?.capRadius ?? prop.collisionShape?.radius ?? 1.8;
  const stemRadius = prop.visual?.stemRadius ?? capRadius * 0.28;
  const stemHeight = prop.visual?.stemHeight ?? 2.4;
  const capThickness = prop.visual?.capThickness ?? 0.6;
  const height = stemHeight + capThickness;
  const group = new THREE.Group();
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(stemRadius * 0.8, stemRadius, stemHeight, 6),
    createMaterial(0xd8c7a0, 0.92)
  );
  stem.position.y = (-height / 2) + (stemHeight / 2);
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(capRadius, 12, 6),
    createMaterial(prop.visual?.color ?? 0xb64d48, 0.78)
  );
  cap.scale.y = Math.max(0.18, capThickness / Math.max(0.001, capRadius));
  cap.position.y = (height / 2) - (capThickness * 0.45);
  stem.castShadow = true;
  stem.receiveShadow = true;
  cap.castShadow = true;
  cap.receiveShadow = true;
  group.add(stem, cap);
  return group;
}

function createDryLeafPatch(prop) {
  return createRoughGroundPatch(prop, {
    baseColor: 0x6d4c2a,
    palette: [0x3f2f20, 0x573a22, 0x6f4a28, 0x8a6233, 0x2f241a],
    roughnessMultiplier: 0.52,
    surfaceLift: 0.34
  });
}

function createDirtStickPatch(prop) {
  const length = prop.visual?.length ?? (prop.collisionShape?.halfExtents?.x ?? 3) * 2;
  const width = prop.visual?.width ?? (prop.collisionShape?.halfExtents?.z ?? 1.5) * 2;
  const thickness = prop.visual?.thickness ?? (prop.collisionShape?.halfExtents?.y ?? 0.05) * 2;
  const group = createRoughGroundPatch(prop, {
    baseColor: 0x5a3924,
    palette: [0x2f2117, 0x4a3020, 0x5a3924, 0x6a3f25, 0x3b2a1e],
    roughnessMultiplier: 0.42,
    surfaceLift: 0.28
  });

  const stickMaterial = createMaterial(0x3b2618, 0.98);
  const stickCount = prop.visual?.stickCount ?? 3;
  for (let index = 0; index < stickCount; index += 1) {
    const stickLength = length * (0.18 + (index % 3) * 0.05);
    const stickWidth = Math.max(0.08, width * 0.018);
    const stick = new THREE.Mesh(
      new THREE.BoxGeometry(stickLength, Math.max(0.04, thickness * 0.22), stickWidth),
      stickMaterial
    );
    stick.position.x = Math.sin(index * 1.77) * length * 0.28;
    stick.position.z = Math.cos(index * 2.19) * width * 0.28;
    stick.position.y = thickness * 0.92;
    stick.rotation.y = index * 0.93;
    stick.castShadow = true;
    stick.receiveShadow = true;
    group.add(stick);
  }

  return group;
}

function createBranchLikeProp(prop) {
  const length = prop.visual?.length ?? (prop.collisionShape?.halfExtents?.x ?? 3) * 2;
  const radius = prop.visual?.radius ?? prop.collisionShape?.halfExtents?.y ?? 0.4;
  const color = prop.visual?.color ?? 0x5f3f2a;
  const group = new THREE.Group();
  const branch = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.72, radius, length, 6),
    createMaterial(color, 0.98)
  );
  branch.rotation.z = Math.PI / 2;
  branch.castShadow = true;
  branch.receiveShadow = true;
  group.add(branch);

  const knot = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.35, 8, 5),
    createMaterial(0x3f2a1c, 0.98)
  );
  knot.scale.set(1.2, 0.7, 0.9);
  knot.position.x = length * 0.18;
  knot.position.y = radius * 0.15;
  knot.castShadow = true;
  knot.receiveShadow = true;
  group.add(knot);
  return group;
}

function addFrustumSegment(group, material, from, to, baseRadius, tipRadius, radialSegments = 5) {
  const start = new THREE.Vector3(from.x, from.y, from.z);
  const end = new THREE.Vector3(to.x, to.y, to.z);
  const axis = end.clone().sub(start);
  const length = axis.length();
  if (length <= 0.0001) {
    return;
  }

  const segment = new THREE.Mesh(
    new THREE.CylinderGeometry(tipRadius, baseRadius, length, radialSegments),
    material
  );
  segment.position.copy(start).addScaledVector(axis, 0.5);
  segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
  segment.castShadow = true;
  segment.receiveShadow = true;
  group.add(segment);
}

function createSprout(prop) {
  const height = prop.visual?.height ?? (prop.collisionShape?.halfHeight ?? 1) * 2;
  const radius = prop.visual?.radius ?? prop.collisionShape?.radius ?? 0.08;
  const leafLength = prop.visual?.leafLength ?? height * 0.35;
  const material = createMaterial(prop.visual?.color ?? 0x4f8b3d, 0.92);
  const group = new THREE.Group();
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.38, radius, height, 4),
    createMaterial(0x35632e, 0.94)
  );
  stem.castShadow = true;
  stem.receiveShadow = true;
  group.add(stem);

  const leafCount = prop.visual?.leafCount ?? 2;
  for (let index = 0; index < leafCount; index += 1) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), material);
    const angle = index * Math.PI * 1.13;
    leaf.scale.set(leafLength * 0.5, Math.max(0.025, radius * 0.26), leafLength * 0.13);
    leaf.position.y = height * (0.04 + index * 0.18);
    leaf.position.x = Math.cos(angle) * leafLength * 0.2;
    leaf.position.z = Math.sin(angle) * leafLength * 0.2;
    leaf.rotation.y = angle;
    leaf.rotation.z = 0.35;
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    group.add(leaf);
  }

  return group;
}

function createShrub(prop) {
  const height = prop.visual?.height ?? (prop.collisionShape?.halfHeight ?? 4) * 2;
  const radius = prop.visual?.radius ?? prop.collisionShape?.radius ?? 3;
  const stemCount = prop.visual?.stemCount ?? 6;
  const leafCount = prop.visual?.leafCount ?? 3;
  const seed = hashText(prop.id ?? 'shrub');
  const group = new THREE.Group();
  const twigMaterial = createMaterial(0x45301f, 0.98);
  const leafMaterial = createMaterial(prop.visual?.color ?? 0x4f6f39, 0.94);
  const baseY = -height / 2;

  for (let index = 0; index < stemCount; index += 1) {
    const angle = (index / stemCount) * Math.PI * 2 + hashUnit(seed, index) * 0.7;
    const reach = radius * (0.38 + hashUnit(seed + 11, index) * 0.58);
    const topY = baseY + height * (0.54 + hashUnit(seed + 23, index) * 0.46);
    addFrustumSegment(
      group,
      twigMaterial,
      { x: 0, y: baseY + height * 0.05, z: 0 },
      { x: Math.cos(angle) * reach, y: topY, z: Math.sin(angle) * reach },
      radius * 0.055,
      radius * 0.02,
      5
    );
  }

  for (let index = 0; index < leafCount; index += 1) {
    const angle = (index / Math.max(1, leafCount)) * Math.PI * 2 + hashUnit(seed + 41, index);
    const leaf = new THREE.Mesh(
      new THREE.DodecahedronGeometry(radius * (0.14 + hashUnit(seed + 59, index) * 0.07), 0),
      leafMaterial
    );
    leaf.position.set(
      Math.cos(angle) * radius * (0.32 + hashUnit(seed + 67, index) * 0.38),
      baseY + height * (0.46 + hashUnit(seed + 73, index) * 0.42),
      Math.sin(angle) * radius * (0.32 + hashUnit(seed + 83, index) * 0.38)
    );
    leaf.scale.y = 0.55;
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    group.add(leaf);
  }

  return group;
}

function createFallenBranch(prop) {
  const length = prop.visual?.length ?? (prop.collisionShape?.halfExtents?.x ?? 5) * 2;
  const radius = prop.visual?.radius ?? prop.collisionShape?.halfExtents?.y ?? 0.5;
  const sideSpan = prop.visual?.sideSpan ?? length * 0.24;
  const branchCount = prop.visual?.branchCount ?? 3;
  const tilt = prop.visual?.tilt ?? 0.35;
  const horizontalLength = Math.cos(tilt) * length;
  const verticalSpan = Math.sin(tilt) * length;
  const shapeHalfHeight = prop.collisionShape?.halfExtents?.y ?? radius * 1.8;
  const seed = hashText(prop.id ?? 'fallen-branch');
  const group = new THREE.Group();
  const material = createMaterial(prop.visual?.color ?? 0x4a3020, 0.98);
  const baseY = -shapeHalfHeight + radius * 0.35;

  addFrustumSegment(
    group,
    material,
    { x: -horizontalLength / 2, y: baseY, z: 0 },
    { x: horizontalLength / 2, y: baseY + verticalSpan, z: 0 },
    radius,
    radius * 0.45,
    6
  );

  for (let index = 0; index < branchCount; index += 1) {
    const alpha = index / Math.max(1, branchCount - 1);
    const x = -horizontalLength * 0.28 + alpha * horizontalLength * 0.6;
    const y = baseY + verticalSpan * (0.22 + alpha * 0.56);
    const side = index % 2 === 0 ? -1 : 1;
    const twigLength = sideSpan * (0.52 + hashUnit(seed, index) * 0.56);
    addFrustumSegment(
      group,
      material,
      { x, y: y + radius * 0.18, z: 0 },
      {
        x: x + length * (0.05 + hashUnit(seed + 7, index) * 0.12),
        y: y + radius * (0.35 + hashUnit(seed + 13, index) * 0.6),
        z: side * twigLength
      },
      radius * 0.42,
      radius * 0.15,
      5
    );
  }

  return group;
}

function createAntTrail(prop) {
  const length = prop.visual?.length ?? (prop.collisionShape?.halfExtents?.x ?? 4) * 2;
  const width = prop.visual?.width ?? (prop.collisionShape?.halfExtents?.z ?? 0.5) * 2;
  const thickness = prop.visual?.thickness ?? (prop.collisionShape?.halfExtents?.y ?? 0.02) * 2;
  const group = new THREE.Group();
  const road = new THREE.Mesh(
    new THREE.BoxGeometry(length, thickness, width),
    createMaterial(0x2b231d, 0.98)
  );
  road.receiveShadow = true;
  group.add(road);

  const dotMaterial = createMaterial(0x15110e, 0.95);
  const dotCount = Math.max(3, Math.min(9, Math.round(length / Math.max(1, width * 3))));
  for (let index = 0; index < dotCount; index += 1) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(width * 0.18, 6, 4), dotMaterial);
    const alpha = dotCount === 1 ? 0 : (index / (dotCount - 1)) - 0.5;
    dot.position.x = alpha * length * 0.72;
    dot.position.z = (index % 2 === 0 ? -1 : 1) * width * 0.18;
    dot.position.y = thickness * 1.7;
    group.add(dot);
  }

  return group;
}

function createLichenTower(prop) {
  const radius = prop.visual?.radius ?? prop.collisionShape?.radius ?? 0.5;
  const height = prop.visual?.height ?? (prop.collisionShape?.halfHeight ?? 1.5) * 2;
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.7, radius, height, 5),
    createMaterial(prop.visual?.color ?? 0xa7b86a, 0.97)
  );
  const crown = new THREE.Mesh(
    new THREE.DodecahedronGeometry(radius * 1.35, 0),
    createMaterial(0xd2d89a, 0.94)
  );
  crown.position.y = height * 0.48;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  crown.castShadow = true;
  crown.receiveShadow = true;
  group.add(trunk, crown);
  return group;
}

function createShellShard(prop) {
  const length = prop.visual?.length ?? (prop.collisionShape?.halfExtents?.x ?? 0.9) * 2;
  const width = prop.visual?.width ?? (prop.collisionShape?.halfExtents?.z ?? 0.3) * 2;
  const thickness = prop.visual?.thickness ?? (prop.collisionShape?.halfExtents?.y ?? 0.14) * 2;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, thickness, width),
    createMaterial(prop.visual?.color ?? 0xd6c8a2, 0.82)
  );
  mesh.rotation.z = 0.18;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createLog(prop) {
  const length = prop.visual?.length ?? (prop.collisionShape?.halfExtents?.x ?? 3) * 2;
  const radius = prop.visual?.radius ?? prop.collisionShape?.halfExtents?.y ?? 0.6;
  const group = new THREE.Group();
  const log = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 10),
    createMaterial(0x5f3f2a, 0.96)
  );
  log.rotation.z = Math.PI / 2;
  log.castShadow = true;
  log.receiveShadow = true;
  const capMaterial = createMaterial(0x8a6a49, 0.9);
  const capA = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.01, 10), capMaterial);
  const capB = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.01, 10), capMaterial);
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
    case 'deciduous_tree':
    case 'conifer_tree':
      return createTree(prop);
    case 'rock_spire':
      return createRockSpire(prop);
    case 'rock':
    case 'talus_rock':
    case 'forest_rock':
      return createRockChunk(prop);
    case 'rock_cluster':
      return createRockCluster(prop);
    case 'moss_cushion':
      return createMossCushion(prop);
    case 'moss_mat':
      return createMossMat(prop);
    case 'dew_bead':
      return createDewBead(prop);
    case 'dew_pool':
      return createDewPool(prop);
    case 'mushroom':
      return createMushroom(prop);
    case 'dry_leaf_patch':
      return createDryLeafPatch(prop);
    case 'dirt_stick_patch':
      return createDirtStickPatch(prop);
    case 'root_branch':
    case 'twig':
      return createBranchLikeProp(prop);
    case 'fallen_branch':
      return createFallenBranch(prop);
    case 'sprout':
      return createSprout(prop);
    case 'shrub':
      return createShrub(prop);
    case 'ant_trail':
      return createAntTrail(prop);
    case 'lichen_tower':
      return createLichenTower(prop);
    case 'shell_shard':
      return createShellShard(prop);
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
  declare body: any;
  declare id: any;
  declare kind: any;
  declare label: any;
  declare labelDistance: any;
  declare mesh: any;
  declare nibbleTimer: any;
  constructor(prop) {
    this.id = prop.id;
    this.kind = prop.kind;
    this.mesh = new THREE.Group();
    this.body = createPropMesh(prop);
    this.mesh.add(this.body);
    this.label = createLabelSprite(prop.kind ?? prop.displayName ?? prop.id);
    if (this.label) {
      this.label.position.y = getPropShapeHalfHeight(prop) + 4.8;
      this.mesh.add(this.label);
    }
    this.labelDistance = Math.max(48, Math.min(120, (prop.bodyRadius ?? 1) * 1.1 + 34));
    this.nibbleTimer = 0;
    this.applyPropState(prop);
    this.setShadowCastingEnabled(false);
  }

  applyPropState(prop) {
    this.mesh.position.set(prop.position.x, prop.position.y, prop.position.z);
    this.mesh.rotation.y = prop.rotationY ?? 0;
    this.mesh.visible = true;
  }

  startNibble() {
    this.nibbleTimer = 0.35;
  }

  setBodyVisible(visible) {
    this.body.visible = visible;
  }

  setShadowCastingEnabled(enabled) {
    this.mesh.traverse((node) => {
      if (!node.isMesh) {
        return;
      }

      node.castShadow = enabled;
      node.receiveShadow = enabled;
    });
  }

  update(delta, localPlayerPosition = null) {
    if (this.label) {
      if (localPlayerPosition) {
        const dx = this.mesh.position.x - localPlayerPosition.x;
        const dz = this.mesh.position.z - localPlayerPosition.z;
        const maxDistance = this.labelDistance;
        this.label.visible = (dx * dx) + (dz * dz) <= maxDistance * maxDistance;
      } else {
        this.label.visible = false;
      }
    }

    if (this.nibbleTimer <= 0) {
      this.body.scale.setScalar(1);
      return;
    }

    this.nibbleTimer = Math.max(0, this.nibbleTimer - delta);
    const pulse = Math.sin(this.nibbleTimer * 80) * 0.05;
    this.body.scale.set(1 + pulse, 1 - pulse * 0.5, 1 + pulse);
  }
}
