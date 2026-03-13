# Gameplay

## Flow

1. Choose `Single Player` or `LAN Multiplayer` from the start menu
2. In `npm run dev`, the multiplayer server starts automatically and the app is served on your LAN; otherwise run `npm run mp:server`
3. Open a second browser client locally or from another device on the same network to auto-pair
4. Move with `WASD` and jump with `Space`
5. Click the arena to capture the mouse when you are ready to fight
6. Hold `Shift` whenever you want lock-on facing and duel framing
7. Hold `Left mouse` and move the mouse to sweep the eye stalk
8. Hold `Right mouse` and move the mouse to lunge or jab with the eye stalk
9. Win after reducing the other snail from `40 HP` to `0`

## Combat Rules

- Hits only count when eye-stalk contact has enough impact power
- Fast mouse motion and forward movement both add to impact quality
- Body overlap pushes the snails apart but does not deal damage
- Short invulnerability windows prevent duplicate hits from one collision

## Single-Player Bot

The bot uses a readable four-state loop:

- `approach`
- `windup`
- `strike`
- `recover`
