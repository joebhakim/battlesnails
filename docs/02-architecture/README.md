# Architecture

## Main Runtime

- `Game`: owns the scene, camera, entities, input, collision checks, UI, and debug updates
- `Scene`: creates the arena, lighting, and ground
- `Renderer`: owns the Three.js renderer
- `CameraController`: third-person duel-follow camera that keeps the fight readable without mouse orbit

## Entities

- `SnailActor`: shared body, shell, eye-stalk pose, health, and motion cache logic
- `PlayerSnail`: camera-relative movement plus mouse-driven sweep and thrust control
- `NPCSnail`: simple state machine with approach/windup/strike/recover behavior and scripted stalk poses

## Support Systems

- `MouseControls`: held-button relative mouse deltas, pointer-lock state, and combat mode
- `KeyboardControls`: movement axes
- `CollisionDetection`: sphere-based body collision and momentum-based impact checks
- `UI`: HUD, music button, restart overlay
- `Debug`: text-only debug panel values and combat event log
