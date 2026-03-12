# Implementation Notes

## Camera And Movement

- Movement is camera-relative
- The camera is a dedicated duel-follow system rather than being embedded in the main loop
- It stays behind the player relative to the current duel line so the mouse is free for combat input

## Combat Input

- The player no longer uses cursor aiming or a click-to-strike action
- `Left mouse` drives sweeping stalk motion; `Right mouse` biases the stalk into thrusts
- Releasing the mouse recenters the stalk toward a neutral pose

## Impact Resolution

- Damage is based on eye-stalk collision plus impact power, not a strike window
- Impact power comes from eye-stalk tip speed plus a contribution from body movement
- This keeps movement relevant while preserving a mouse-driven attack feel

## NPC AI

- The NPC does not use the old sine-wave or erratic thrash behavior
- Instead it rotates toward the player, manages spacing, winds up, strikes, then recovers using scripted stalk poses

## Removed Systems

- Boundary-based attack mode
- Cursor raycast aiming
- Orbit camera mouse controls
- Discrete strike windows
- Multiplayer and remote-player sync
- Level progression and scaling enemy stats
