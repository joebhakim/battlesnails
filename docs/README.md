# BattleSnails Documentation

This is the complete documentation for the BattleSnails game project. The documentation is organized into chapters that cover different aspects of the game.

## Documentation Chapters

1. [Game Overview](01-overview/README.md) - Introduction to the game concept and basic gameplay
2. [Architecture](02-architecture/README.md) - The structure and organization of the codebase
3. [Gameplay Mechanics](03-gameplay/README.md) - Detailed explanation of game mechanics and controls
4. [Debugging System](04-debugging/README.md) - Information about the debug mode and tools
5. [Implementation Details](05-implementation/README.md) - Deep dive into code implementation

## Quick Start

To run the game:

1. Install dependencies:
   ```
   npm install
   ```

2. Start the development server:
   ```
   npm run dev
   ```

3. Open the game in your browser (typically at http://localhost:5173)

## Controls

### Movement
- **W/A/S/D or Arrow Keys**: Move the player snail

### Exploration Mode (Mouse Released)
- **Mouse Movement**: Control camera and rotate snail body

### Attack Mode (Mouse Held Down)
- **Mouse Inside Boundary Circle**: Aim the eye stalk for precise targeting
- **Mouse Outside Boundary Circle**: Rotate the snail body while maintaining eye stalk position
- **Mouse Button Release**: Perform attack (strike or swing based on velocity)

A large circular boundary (visible as a translucent circle) determines which control scheme is active in attack mode, allowing for intuitive transitions between aiming and repositioning.

### Debug
- **Debug Toggle Button**: Enable or disable debug mode

## Development Resources

When working on the game, these documentation sections can help with specific tasks:

- For understanding the overall structure, see the [Architecture](02-architecture/README.md) documentation
- For implementing new mechanics, check the [Gameplay Mechanics](03-gameplay/README.md) and [Implementation Details](05-implementation/README.md) sections
- For debugging issues, refer to the [Debugging System](04-debugging/README.md) documentation 