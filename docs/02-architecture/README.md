# BattleSnails Architecture

## Project Structure

The BattleSnails project follows a modular structure with clear separation of concerns. This document outlines the overall architecture and how the different components interact.

```
battlesnails/
├── index.html              # Main HTML file
├── package.json            # Node.js package configuration
├── vite.config.js          # Vite build tool configuration
├── docs/                   # Documentation
├── public/                 # Public assets
│   └── assets/
│       ├── models/         # 3D models (not used in MVP)
│       ├── textures/       # Textures (not used in MVP)
│       └── sounds/         # Audio files (not used in MVP)
└── src/                    # Source code
    ├── main.js             # Entry point
    ├── style.css           # Global styles
    ├── game/               # Core game classes
    │   ├── Game.js         # Main game controller
    │   ├── Scene.js        # 3D scene setup
    │   └── Renderer.js     # Three.js renderer
    ├── entities/           # Game entities
    │   ├── PlayerSnail.js  # Player-controlled snail
    │   └── NPCSnail.js     # AI-controlled enemy snail
    ├── controls/           # User input handling
    │   ├── MouseControls.js    # Mouse input for eye stalk
    │   └── KeyboardControls.js # Keyboard input for movement
    └── utils/              # Utility classes
        ├── CollisionDetection.js # Collision detection
        ├── Debug.js        # Debugging utilities
        └── UI.js           # User interface management
```

## Architectural Patterns

BattleSnails uses an object-oriented approach with the following key architectural patterns:

1. **Component-Based Architecture**: The game is divided into components (entities, controls, utilities) that have specific responsibilities and can be developed and tested independently.

2. **Game Loop Pattern**: The core game logic runs in a continuous loop that updates the game state and renders the scene at regular intervals.

3. **Event-Driven Architecture**: User interactions are handled through event listeners, which trigger appropriate actions in the game.

## Core Classes and Responsibilities

### Game Core

- **Game**: The central controller that coordinates all game elements. It maintains the game state, handles the game loop, and connects all components.
  
- **Scene**: Responsible for setting up the 3D scene, including the environment, lighting, and background.
  
- **Renderer**: Handles the rendering of the 3D scene to the canvas using Three.js.

### Entities

- **PlayerSnail**: Represents the player-controlled snail. Handles movement, eye stalk animation, and strike mechanics.
  
- **NPCSnail**: Represents the enemy snail. Manages AI movement, health system, and visual feedback for damage.

### Controls

- **MouseControls**: Processes mouse input for controlling both the eye stalk and the snail's rotation through a hybrid control system. Implements a boundary-based approach where mouse movement inside a circular boundary controls the eye stalk, while movement outside the boundary rotates the entire snail. Also handles attack initiation and velocity-based attack power.
  
- **KeyboardControls**: Processes keyboard input for moving the player snail.

### Utilities

- **CollisionDetection**: Handles detection of collisions between the player's eye stalk and the enemy snail.
  
- **UI**: Manages UI elements like the health bar, game over message, and visual indicators such as the crosshair and boundary circle in attack mode.
  
- **Debug**: Provides visual and text-based debugging tools to help understand the game's inner workings.

## Data Flow

1. **Input Processing**: User inputs (mouse movements, clicks, keyboard presses) are captured by the controls classes.

2. **State Update**: Based on inputs and time, the game updates the positions and states of all entities.

3. **Collision Checking**: During the strike animation's peak extension, the game checks for collisions between the player's eye stalk and the enemy snail.

4. **Render**: The updated game state is rendered to the screen.

5. **UI Update**: UI elements are updated to reflect the current game state (health, debugging information).

## Initialization Sequence

1. The HTML page loads and creates the container elements.
2. The main.js script initializes the Game instance.
3. The Game instance initializes all other components:
   - Creates the Scene and Renderer
   - Instantiates the PlayerSnail and NPCSnail
   - Sets up the Controls
   - Initializes the utility classes (CollisionDetection, UI, Debug)
4. Event listeners are attached for user input.
5. The game loop starts, continuously updating and rendering the game.

## Communication Between Components

Components communicate primarily through direct method calls. For example:

- The Game calls update methods on entities and controls each frame.
- The Controls update the player snail's properties based on user input.
- The CollisionDetection checks positions of entities to determine collisions.
- The UI is updated based on the state of the entities.

This direct communication approach keeps the architecture simple and ensures good performance for this relatively small-scale game. 