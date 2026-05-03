# Rolling Todos

## Network Snapshot Optimization

- Defer the next online protocol pass until local and single-player tuning settle. Stalk rope nodes are now client-side visuals, static match metadata is split from dynamic updates, trail cells use deltas, and regular LAN snapshots default to `30 Hz`.
- Replace repeated JSON player objects with compact, versioned arrays or binary packing; quantize positions, velocities, normals, health, and control scalars before worrying about sim CPU.
- Add client interpolation/extrapolation for the `30 Hz` dynamic snapshot target; keep `20 Hz` as a fallback experiment and reserve `10 Hz`-class updates for far NPCs or noncritical interest groups.
- Consider pre-encoding shared room broadcasts so the server does not stringify the same dynamic snapshot separately per client.

## TypeScript Tightening

- Gradually replace first-pass `any` declarations with explicit public contracts for snapshots, player state, inputs, terrain props, tuning schemas, and network messages.
- Re-enable stricter compiler checks in stages after the core gameplay APIs stop moving quickly; start with shared sim/network boundaries before presentation internals.

## Combat Model Follow-Up

- Revisit the impulse score once larger enemy profiles exist. The next pass should decide whether enemy mass, stalk radius, eye radius, and body momentum are separate knobs or a single simplified ballistic strength value.

## Terrain Clearance Follow-Up

- Recheck body clearance whenever terrain curvature formulas change. The current clearance is numerically estimated from `getTerrainHeight`, but the capsule approximation and safety cap are still pragmatic and should be validated visually on new terrain families.

## Mobile Follow-Up

- Add phone rotation sensing after the touch beta is usable. Use an explicit tap-to-enable permission/calibration flow, then feed filtered orientation deltas into the same mobile control packet instead of creating a separate input path.
