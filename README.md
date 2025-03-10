# BattleSnails

A minimalist 3D game built with Three.js where you control a snail with an eye stalk to battle against an enemy snail.

## Game Overview

In BattleSnails, you control a snail and use its eye stalk to attack an enemy snail. Your goal is to strike the enemy snail's body with your eye stalk to inflict damage. The enemy snail has 3 hit points, and you win when you reduce its health to zero.

## Controls

- **Mouse Movement**: Control the eye stalk direction
- **WASD/Arrow Keys**: Move your snail around
- **Mouse Click**: Perform a "strike" action with the eye stalk
- **Debug Button**: Toggle debug mode for development insights

## Comprehensive Documentation

The game is fully documented across several chapters:

1. **[Game Overview](docs/01-overview/README.md)** - Introduction to the game concept and its features
2. **[Architecture](docs/02-architecture/README.md)** - Details of the project structure and design patterns
3. **[Gameplay Mechanics](docs/03-gameplay/README.md)** - Deep dive into the gameplay systems
4. **[Debugging System](docs/04-debugging/README.md)** - Guide to the debug mode features
5. **[Implementation Details](docs/05-implementation/README.md)** - Code-level explanations of key features

For a complete guide to all documentation, see the [Documentation Index](docs/README.md).

## Development

This project uses:
- Three.js for 3D rendering
- Vite as the build tool
- JavaScript for game logic

### Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Start the development server:
   ```
   npm run dev
   ```

## Features

- 3D snail models created with Three.js geometries
- Interactive eye stalk aiming and striking mechanics
- Enemy snail with basic AI movement patterns
- Health system with visual feedback
- Comprehensive debug mode for development
- Collision detection system
- Simple but engaging gameplay loop

## License

MIT
