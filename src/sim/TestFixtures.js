export const IMMORTAL_FIXTURE_HEALTH = 999999;

export const TEST_PLAYGROUND_FIXTURES = Object.freeze([
  Object.freeze({
    slot: 9001,
    profile: 'fixture',
    fixtureKind: 'cube',
    displayName: 'Karl the Cube',
    immortal: true,
    maxHealth: IMMORTAL_FIXTURE_HEALTH,
    position: Object.freeze({ x: -5.5, z: -1.5 }),
    bodyRadius: 2.1,
    collisionShape: Object.freeze({
      type: 'box',
      halfExtents: Object.freeze({ x: 1.25, y: 1.25, z: 1.25 })
    })
  }),
  Object.freeze({
    slot: 9002,
    profile: 'fixture',
    fixtureKind: 'cylinder',
    displayName: "Karl's Brother the Cylinder",
    immortal: true,
    maxHealth: IMMORTAL_FIXTURE_HEALTH,
    position: Object.freeze({ x: 5.5, z: -1.5 }),
    bodyRadius: 1.75,
    collisionShape: Object.freeze({
      type: 'cylinder',
      radius: 1.2,
      halfHeight: 1.35
    })
  }),
  Object.freeze({
    slot: 9003,
    profile: 'fixture',
    fixtureKind: 'snail',
    displayName: 'Sifu Snail',
    immortal: true,
    maxHealth: IMMORTAL_FIXTURE_HEALTH,
    position: Object.freeze({ x: 0, z: -10.5 }),
    rotationY: 0,
    bodyRadius: 1.8,
    collisionShape: Object.freeze({
      type: 'sphere'
    })
  })
]);
