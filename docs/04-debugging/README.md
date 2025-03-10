# BattleSnails Debugging System

This document details the debugging system implemented in BattleSnails, which helps developers and players understand the game mechanics and diagnose issues.

## Debug Mode Overview

The debugging system provides both visual and textual information about the game state, with a focus on the collision detection system that is critical to the combat mechanics. It can be toggled on and off during gameplay without affecting the core game functionality.

## Activating Debug Mode

Debug mode can be activated by clicking the "Debug Mode" button in the UI. When active, it displays:

1. Visual aids in the 3D environment
2. Numerical and status information in the debug panel
3. A legend explaining the visual markers

## Debug UI Controls

The debug UI provides controls to manage how debug information is displayed:

- **Debug Toggle Button**: Turns the debug mode on and off
- **Update Debug Info Button**: Manually refreshes the debug information display
- **Auto-update Checkbox**: When checked, debug information updates continuously; when unchecked, updates only happen when the update button is clicked

This control over updates allows for precise examination of the game state at specific moments, which is particularly useful when investigating collision issues.

## Visual Debug Elements

When debug mode is active, the following visual elements are added to the game scene:

### Wireframe Hitboxes

- **Player Hitbox**: A green wireframe sphere that represents the player snail's body for general positioning.
- **NPC Hitbox**: A red wireframe sphere that shows the exact collision radius of the enemy snail. This is particularly important for understanding collision detection.

### Connection Lines

- **Player-to-NPC Line**: A cyan line connecting the player's eye stalk tip to the NPC snail's body center. This helps visualize the attack vector and distance.
- **NPC-to-Player Line**: A magenta line connecting the NPC's eye stalk to the player's body. This is primarily for symmetry and completeness of the debug visualization.

### Position Markers

- **Eye Stalk Tip Markers**: Small colored spheres showing the exact position of the eye stalk tips:
  - **Cyan Sphere**: Marks the player's eye stalk tip position used for collision detection
  - **Magenta Sphere**: Marks the NPC's eye stalk tip position

These markers are particularly helpful for understanding any potential mismatch between the visual representation of the eye stalks and the actual collision points used for hit detection.

## Debug Panel Sections

The debug panel is organized into informative sections:

1. **Distance Measurements**:
   - Player Stalk → NPC: The distance from the player's eye stalk tip to the NPC snail's body center
   - NPC Stalk → Player: The distance from the NPC's eye stalk to the player's body center

2. **Collision Information**:
   - Status: Shows whether a collision is currently detected between the player's eye stalk and the NPC's body
   - Player Strike: Indicates whether the player is currently in a striking animation
   - Body Radius: The collision radius of the NPC snail

3. **Positions**:
   - Eye Stalk Position: The exact X, Y, Z coordinates of the player's eye stalk tip
   - NPC Body Position: The exact X, Y, Z coordinates of the NPC's body center

4. **Debug Legend**: Visual explanation of the color coding used in the 3D scene

5. **Update Control**: Controls for manual or automatic updating of debug information

## Color Coding

The debug system uses color to highlight important information:

- **Distance Colors**:
  - Yellow: When the eye stalk is getting close to the NPC (within 2× the body radius)
  - Red: When the eye stalk is very close to the NPC (within 1.2× the body radius)

- **Collision Status**: Turns red when a collision is detected

- **Strike Status**: Turns yellow when the player is performing a strike action

## Implementation Details

The debugging system is implemented through several components:

### Debug Class

The `Debug` class (`src/utils/Debug.js`) is the core of the debugging system. It:

1. Creates and manages visual debug elements
2. Updates the debug panel information
3. Interfaces with other game components to gather debug data
4. Controls whether debug information updates automatically or manually

### Debug UI Elements

The debug UI is defined in `index.html` and styled in `style.css`. Key elements include:

- A toggle button for enabling/disabling debug mode
- A panel containing organized sections of debug information
- A manual update button and auto-update checkbox
- Styled text elements for displaying different types of debug data

### Integration with Game Components

The debug system interfaces with several game components:

- **Game**: The main `Game` class initializes the debug system and provides access to other components
- **CollisionDetection**: Provides collision information and can be set to output detailed debugging logs
- **PlayerSnail**: Provides eye stalk position and strike status information
- **NPCSnail**: Provides body position and radius information

### Debug Update Modes

The debug system supports two update modes:

1. **Manual Update**: Debug information is only updated when the "Update Debug Info" button is clicked
2. **Auto Update**: Debug information updates continuously with the game loop

Visual helpers (hitboxes, lines, markers) always update regardless of the chosen mode to ensure they remain accurately positioned.

## Debugging Command Flow

When debug mode is active, the following sequence occurs each frame:

1. The `Game` class calls `debug.update()` in the animation loop
2. The `Debug` class:
   - Updates the positions of visual debug elements
   - Recalculates distances between key points
   - Checks collision status using the same logic as the game
   - Updates all displayed information in the debug panel

## Using Debug Mode for Development

The debug mode is particularly useful for:

1. **Understanding Collision Detection**: Visualizing exactly when and where collisions occur
2. **Tuning Game Parameters**: Adjusting values like the NPC body radius for better gameplay
3. **Fixing Bugs**: Identifying issues with positioning, timing, or collision detection
4. **Learning the Codebase**: Seeing the relationships between game elements visualized in real-time

## Console Debugging

In addition to the visual elements, the debug mode enables detailed logging to the browser console, including:

- Strike initiation events
- Collision checking details
- Hit detection and damage events
- Position and distance data at critical moments

This can be accessed through the browser's developer tools console while playing the game with debug mode active. 