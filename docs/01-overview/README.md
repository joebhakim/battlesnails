# BattleSnails Overview

## Game Concept

BattleSnails is a 3D web-based game built using Three.js, where players control a snail with a single eye stalk attempting to battle against an enemy NPC snail. The game focuses on precision and timing, as players must maneuver their snail and strike the enemy with their eye stalk to inflict damage.

## Core Gameplay

The core gameplay revolves around a simple but engaging mechanic:

1. **Player Control**: The player controls a blue snail character using keyboard keys for movement and the mouse for aiming the eye stalk.

2. **Eye Stalk Combat**: The player's primary weapon is their snail's eye stalk, which can be extended in a striking motion by clicking the mouse. If the eye stalk makes contact with the enemy snail during the strike, it deals 1 point of damage.

3. **Enemy Snail**: The red enemy snail moves autonomously around the game environment. It has 3 hit points, which are displayed as a health bar in the UI.

4. **Victory Condition**: The player wins by successfully striking the enemy snail three times, reducing its health to zero.

## Game Environment

The game takes place on a flat green surface representing grass or ground, with a sky-blue background. This minimalist environment keeps the focus on the snail combat mechanics. The game's visuals are deliberately simple but cohesive, using basic Three.js geometries to construct the snails and environment.

## Core Technical Components

BattleSnails is built using several key technologies:

- **Three.js**: Provides the 3D rendering capabilities and handles the scene, camera, and lighting.
- **JavaScript (ES6+)**: Powers the game logic, controls, and animations.
- **HTML5/CSS3**: Structures the page and UI elements.
- **Vite**: Serves as the build tool and development server.

The game is organized into a modular structure with separate components handling rendering, entity behavior, user controls, collision detection, and UI elements.

## Unique Features

What sets BattleSnails apart:

1. **Eye Stalk Mechanics**: The game's unique eye stalk attack system provides a distinctive combat mechanic that requires precision and timing.

2. **Snail Movement**: The slow, deliberate movement of the snails creates a pacing that emphasizes strategic positioning rather than rapid reactions.

3. **Debug Mode**: The game includes a comprehensive debug mode that visualizes hitboxes, collision lines, and displays detailed position information to aid in understanding the game mechanics and troubleshooting. 