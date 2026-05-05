# BattleSnails Architecture Direction

BattleSnails is staying custom: Vite, TypeScript, Three.js, and the existing minimal WebSocket server remain the base stack. The current rewrite goal is to split the code into reusable boundaries before considering any larger framework changes.

## Boundaries

- `src/protocol`: custom client/server protocol helpers. This owns input normalization, snapshot merging, trail deltas, and future quantized network payloads.
- `src/sim`: deterministic gameplay systems. This should not depend on DOM or rendering. `MatchSimulation` still exists as the orchestrator, but subsystems should continue moving into smaller modules.
- `src/world`: procedural world generation and terrain math.
- `src/entities`: Three.js render actors and generated meshes.
- `src/game`: browser session orchestration, UI wiring, camera, and renderer integration.
- `server`: custom authoritative LAN/server runtime using the same `src/protocol` and `src/sim` code.
- `scripts`: profiling, screenshot, asset review, and map tooling.

## Stack Decisions

- Keep Three.js for rendering and procedural mesh control.
- Keep the custom WebSocket server and custom snapshot protocol for now.
- Do not use Colyseus or a similarly opinionated multiplayer framework unless the custom protocol becomes the bottleneck.
- Svelte is acceptable later for menus/HUD/debug UI only. It should not own the game loop, canvas renderer, or simulation.
- Avoid introducing a general physics engine until the current snail-specific support/climbing/stalk rules are cleaner and benchmarked.

## Next Splits

- Continue moving snapshot quantization into `src/protocol`.
- Keep shrinking `MatchSimulation` toward orchestration. Snapshot serialization, trail cells, movement/support, player state, powerups, match lifecycle, stalk control, damage, bird/creature helpers, collision-shape helpers, and world-prop normalization/indexing now live in dedicated modules.
- Keep renderer-facing actors isolated from protocol and sim code.
- Add protocol round-trip tests before shrinking network snapshots.
