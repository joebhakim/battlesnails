# BattleSnails Gameplay Mechanics

This document details the gameplay mechanics, controls, and interactions in the BattleSnails game.

## Player Controls

### Movement Controls

The player can move their snail using keyboard controls:

- **W / Up Arrow**: Move forward
- **S / Down Arrow**: Move backward
- **A / Left Arrow**: Rotate left
- **D / Right Arrow**: Rotate right

Movement is deliberately slow to match the snail theme. The snail moves in the direction it's facing, and rotation changes this direction.

### Eye Stalk Controls

The eye stalk is the player's weapon and is controlled with the mouse:

#### Exploration Mode (Mouse Button Released)
- **Mouse Movement**: Controls camera and snail rotation
- **Camera View**: Third-person view following behind the snail

#### Attack Mode (Mouse Button Held)
The game employs a hybrid control system in attack mode, using a large circular boundary:

- **Mouse Inside Boundary Circle**: Controls eye stalk aiming for precise targeting
- **Mouse Outside Boundary Circle**: Controls the snail's rotation while keeping eye stalk position fixed
- **Mouse Button Release**: Performs strike or swing attack depending on mouse velocity

The circular boundary is visible as a translucent circle around the crosshair when in attack mode, providing clear visual feedback about which control scheme is active.

## Snail Strike Mechanics

The strike mechanic is the core combat element of the game:

1. When the player releases the mouse button, the eye stalk begins a strike animation.
2. The eye stalk extends forward during the first half of the animation.
3. At the peak of extension, collision detection checks if the eye stalk tip has contacted the enemy snail.
4. If contact is made, damage is inflicted to the enemy snail.
5. The eye stalk then retracts back to its original position.

For higher mouse movement speeds, a more powerful swing attack is performed instead of a simple strike.

The strike has a specific timing window for damage, requiring precision and good aim to land successful hits.

## Enemy AI

The enemy snail (NPC) has simple AI behaviors:

1. **Movement Pattern**: The NPC snail moves randomly around the environment, changing direction periodically.
2. **Idle Periods**: At random intervals, the NPC may pause its movement before choosing a new direction.
3. **Boundary Response**: When approaching the edges of the playable area, the NPC will turn around to stay within bounds.
4. **Damage Response**: When the NPC takes damage, it briefly flashes red and may change its movement direction.

## Health System

The enemy snail has 3 hit points, visualized as a health bar in the UI:

- Each successful strike from the player's eye stalk reduces the enemy's health by 1 point.
- The health bar updates visually to reflect the current health.
- The health bar changes color based on the remaining health level:
  - Full health (3/3): Red
  - Medium health (2/3): Orange
  - Low health (1/3): Yellow

## Collision Detection

Collision detection is critical for the combat mechanics and works as follows:

1. During the strike animation's peak extension, the game checks if the eye stalk tip is within the enemy snail's body radius.
2. The eye stalk tip position is determined by a specific point at the end of the eye stalk model.
3. The enemy snail's collision area is represented by a sphere centered on its body.
4. If the distance between these two points is less than the enemy's body radius, a collision is detected.
5. Collisions only result in damage if they occur during the active strike animation.

## Game Environment

The game environment has the following characteristics:

1. **Bounded Area**: Both player and NPC snails are constrained within a limited area to ensure they remain in the playable space.
2. **Ground Plane**: A flat green surface serves as the ground where the snails move.
3. **Lighting**: The scene includes ambient and directional lighting to create appropriate shadows and atmosphere.

## Game States

The game includes several states:

1. **Gameplay**: The normal state where the player and NPC interact.
2. **Game Over**: Triggered when the enemy snail's health reaches zero. Displays a win message and a restart button.

## Debug Mode

The game includes a debug mode to help understand the mechanics:

1. **Activation**: Clicking the "Debug Mode" button toggles debug visualization and information.
2. **Visual Helpers**: Shows wireframe hitboxes for both snails and lines indicating eye stalk positions relative to snail bodies.
3. **Numerical Data**: Displays distances, positions, and collision status information.
4. **Collision Feedback**: Provides visual feedback when collisions are detected. 