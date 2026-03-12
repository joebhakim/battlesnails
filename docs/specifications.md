# BattleSnails Specification

## Summary

BattleSnails is a single-player arena duel. The player controls a snail in third-person view and drives its eye stalk with held mouse input in a Half Sword-style adaptation.

## Rules

- One player snail versus one NPC snail
- `3 HP` each
- `1` damage per landed impact
- No multiplayer
- No level progression
- No passive contact damage

## Controls

- `WASD` or arrows: camera-relative movement
- Hold `Left mouse` and move the mouse: sweeping attacks
- Hold `Right mouse` and move the mouse: thrusting attacks
- Click arena: capture mouse
- `Esc`: release mouse capture

## Systems

- Third-person duel-follow camera
- Mouse-delta-driven eye-stalk pose control
- Momentum-based hit detection using eye-stalk speed plus body movement
- Simple NPC state machine: `approach`, `windup`, `strike`, `recover`
- Optional debug overlay
