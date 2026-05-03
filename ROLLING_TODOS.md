# Rolling Todos

## Network Snapshot Optimization

- Defer the online snapshot protocol pass until local and single-player tuning settle. Current JSON snapshots are dominated by repeated object shape and full stalk rope payloads, not just numeric precision.
- Replace full stalk node snapshots with simplified stalk snapshots suitable for networking: compact arrays, quantized coordinates/velocities, eye/root/tip summaries, and client-side reconstruction where possible.
- Evaluate lower-rate snapshots with interpolation, delta encoding, binary packing, trail-cell deltas, and pre-encoded room broadcasts before optimizing authoritative simulation CPU.

## Combat Model Follow-Up

- Revisit the impulse score once larger enemy profiles exist. The next pass should decide whether enemy mass, stalk radius, eye radius, and body momentum are separate knobs or a single simplified ballistic strength value.

## Terrain Clearance Follow-Up

- Recheck body clearance whenever terrain curvature formulas change. The current clearance is numerically estimated from `getTerrainHeight`, but the capsule approximation and safety cap are still pragmatic and should be validated visually on new terrain families.
