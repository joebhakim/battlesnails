# Implementation Notes

## Shared Simulation

- The duel rules now live in a headless shared simulation core
- Single-player and LAN multiplayer both use the same movement, jump, stalk pose, impact, and win logic
- The browser client renders snapshots instead of owning combat authority

## Camera And Input

- Movement is camera-relative
- The camera is a dedicated duel-follow system rather than being embedded in the main loop
- `Left mouse` drives sweeping stalk motion; `Right mouse` biases the stalk into thrusts
- Releasing the mouse recenters the stalk toward a neutral pose
- `Shift` is a hold-to-lock input, not a toggle

## LAN Multiplayer

- A small Node server on the host machine owns the authoritative match state
- The server auto-pairs two clients into one fixed room
- `npm run dev` auto-starts that server on port `2567` and exposes it to the local network
- Clients send inputs only and render authoritative snapshots

## Bot Opponent

- The NPC does not use the old sine-wave or erratic thrash behavior
- Instead the bot controller drives the same simulation core with approach, windup, strike, and recover behavior

## Removed / Replaced Systems

- Boundary-based attack mode
- Cursor raycast aiming
- Orbit camera mouse controls
- Discrete strike windows
- The abandoned browser-only multiplayer scaffolding
- Level progression and scaling enemy stats
