# BattleSnails Specification

## Summary

BattleSnails is a small arena duel game with two supported modes: single-player versus a bot and 2-player PvP over localhost or LAN. The player controls a snail in third-person view and drives its eye stalk with held mouse input.

## Rules

- Single-player: one human versus one bot
- Localhost multiplayer: two human players on the same machine
- `40 HP` each
- `1` damage per landed impact
- No level progression
- No passive contact damage

## Controls

- `WASD` or arrows: camera-relative movement
- `Space`: jump
- Hold `Left mouse` and move the mouse: sweeping attacks
- Hold `Right mouse` and move the mouse: thrusting attacks
- Hold `Shift`: enable lock-on camera and target-facing mode
- Click arena: capture mouse
- `Esc`: release mouse capture

## Systems

- Third-person duel-follow camera
- Mouse-delta-driven eye-stalk pose control
- Momentum-based hit detection using eye-stalk speed plus body movement
- Shared headless match simulation for single-player and LAN multiplayer
- Local authoritative multiplayer server with one fixed auto-paired room
- Bot controller for the single-player opponent
- Optional debug overlay
