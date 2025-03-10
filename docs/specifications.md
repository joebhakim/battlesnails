# BattleSnails Game Specification

## Overview
BattleSnails is a minimalist 3D game built with Three.js where the player controls a snail with an eye stalk, attempting to damage an NPC snail. The game features simple mechanics focused on aiming and striking the enemy snail with the player's eye stalk.

## Technologies Used
- **Three.js** - Core 3D rendering library
- **JavaScript/ES6+** - Programming language
- **HTML5/CSS3** - Page structure and styling
- **Vite** - Build tool and development server
- **Node.js** - Runtime environment for development

## Game Specifications

### Game Objects
1. **Player Snail**
   - 3D model of a snail with a prominent, controllable eye stalk
   - Eye stalk is controlled by mouse movement
   - Player controls the positioning of the snail using keyboard
   - Collision detection on the eye stalk for damage calculation

2. **NPC Snail**
   - 3D model of an enemy snail
   - Simple AI pattern (movement within a confined area)
   - Health system (3 hit points)
   - Visual indication of damage taken

3. **Environment**
   - Simple flat surface (representing the ground)
   - Basic lighting
   - Minimal decorative elements

### Game Mechanics
1. **Player Controls**
   - Mouse movement: Controls the eye stalk direction
   - WASD/Arrow keys: Move the player snail
   - Click: Initiate a "strike" action with the eye stalk

2. **Combat System**
   - Contact between player's eye stalk and enemy snail's body causes 1 damage
   - Enemy snail has 3 hit points
   - Visual and/or audio feedback on successful hits
   - Game conclusion when enemy health reaches zero

3. **Movement and Physics**
   - Simple physics for snail movement (slow, deliberate)
   - Constrained movement area
   - Basic collision detection
   - No gravity or advanced physics required for MVP

4. **UI Elements**
   - Enemy health indicator
   - Win/lose screen
   - Minimal instructions display

## Implementation Plan

### Directory Structure
```
battlesnails/
├── index.html
├── package.json
├── vite.config.js
├── public/
│   └── assets/
│       ├── models/
│       ├── textures/
│       └── sounds/
└── src/
    ├── main.js
    ├── style.css
    ├── game/
    │   ├── Game.js
    │   ├── Scene.js
    │   └── Renderer.js
    ├── entities/
    │   ├── PlayerSnail.js
    │   └── NPCSnail.js
    ├── controls/
    │   ├── MouseControls.js
    │   └── KeyboardControls.js
    └── utils/
        ├── CollisionDetection.js
        └── UI.js
```

### Implementation Phases

#### Phase 1: Project Setup and Environment
- Set up project structure with Vite
- Initialize Three.js scene, camera, and renderer
- Create a basic environment with lighting
- Implement a basic game loop

#### Phase 2: Player Snail Implementation
- Create simple 3D model for player snail
- Implement eye stalk that follows mouse cursor
- Add keyboard controls for snail movement
- Add click action for eye stalk "strike"

#### Phase 3: NPC Snail Implementation
- Create simple 3D model for enemy snail
- Implement basic AI movement pattern
- Add health system (3 hit points)
- Implement visual feedback for damage

#### Phase 4: Game Mechanics
- Implement collision detection between eye stalk and enemy snail
- Create damage calculation system
- Add win/lose conditions
- Implement UI elements for health and game state

#### Phase 5: Polishing
- Optimize performance
- Add basic sounds
- Improve visuals
- Add instructions and game feedback

## Minimum Viable Product (MVP) Features
- Player snail with controllable eye stalk
- Enemy NPC snail with 3 hit points
- Mouse-controlled eye stalk movement
- Keyboard-controlled player movement
- Collision detection for damage
- Basic UI showing enemy health
- Win condition when enemy health reaches zero
- Simple 3D environment

## Future Enhancements (Post-MVP)
- Multiple enemy snails
- Power-ups
- Different attack patterns
- Improved graphics and animations
- Sound effects and background music
- Level progression
- Multiplayer capabilities

## Technical Specifications
- Models: Simple geometric shapes for MVP; can be enhanced later
- Textures: Basic colors/patterns for MVP
- Performance: Target 60fps on modern browsers
- Browser compatibility: Chrome, Firefox, Edge, Safari 