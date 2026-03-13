# Architecture

## Main Runtime

- `Game`: owns the scene, camera, view actors, input, UI, and the active session
- `Scene`: creates the arena, lighting, and ground
- `Renderer`: owns the Three.js renderer
- `CameraController`: third-person duel-follow camera that keeps the fight readable without mouse orbit
- `SinglePlayerSession` and `MultiplayerSession`: mode-specific hosts for the shared simulation

## Entities

- `SnailActor`: shared body, shell, eye-stalk pose, health, and motion cache logic for rendered snails
- `PlayerSnail`: blue presentation actor for the local player
- `NPCSnail`: red presentation actor for the opponent

## Support Systems

- `MouseControls`: held-button relative mouse deltas, pointer-lock state, and combat mode
- `KeyboardControls`: movement axes
- `CollisionDetection`: debug-facing impact inspection on rendered actors
- `UI`: HUD, mode menu, connection/game overlays, and music button
- `Debug`: text-only debug panel values and combat/session event log
- `MatchSimulation`: headless authoritative duel state
- `LocalMultiplayerClient` plus the `server/` runtime: localhost networking stack
