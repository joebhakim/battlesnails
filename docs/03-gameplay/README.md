# Gameplay

## Flow

1. Move around the enemy with `WASD`
2. Click the arena to capture the mouse when you are ready to fight
3. Hold `Left mouse` and move the mouse to sweep the eye stalk
4. Hold `Right mouse` and move the mouse to lunge or jab with the eye stalk
5. Win after landing three clean impacts before the NPC does

## Combat Rules

- Hits only count when eye-stalk contact has enough impact power
- Fast mouse motion and forward movement both add to impact quality
- Body overlap pushes the snails apart but does not deal damage
- Short invulnerability windows prevent duplicate hits from one collision

## NPC Behavior

The enemy uses a readable four-state loop:

- `approach`
- `windup`
- `strike`
- `recover`
