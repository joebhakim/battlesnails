import * as THREE from 'three';

export class CollisionDetection {
  constructor() {
    // Debug flag
    this.debugMode = false;
    // Last collision check result
    this.lastCollisionResult = false;
    // Last collision check details
    this.lastCollisionDetails = {
      eyeStalkPosition: null,
      npcBodyPosition: null,
      npcBodyRadius: 0,
      distance: 0
    };
  }
  
  /**
   * Check if an eye stalk is colliding with another snail
   * @param {THREE.Vector3} eyeStalkPosition - Position of the eye stalk tip
   * @param {Object} targetSnail - The snail to check collision with
   * @returns {boolean} Whether a collision occurred
   */
  checkEyeStalkCollision(eyeStalkPosition, targetSnail) {
    // Get the world position and rotation of the target snail mesh
    const snailPosition = new THREE.Vector3();
    targetSnail.mesh.getWorldPosition(snailPosition);
    const snailRotation = targetSnail.mesh.rotation.y;
    
    // Get scaling factor (defaults to 1 if not set)
    const scaleFactor = targetSnail.scaleFactor || 1;
    
    // BODY COLLISION: Capsule shape
    // Capsule dimensions (from Debug.js visualization)
    const bodyRadius = 1.1 * scaleFactor;
    const bodyLength = 2.2 * scaleFactor;
    
    // Get the body's world position
    const bodyWorldPos = new THREE.Vector3();
    targetSnail.body.getWorldPosition(bodyWorldPos);
    
    // Transform eye stalk position to local space relative to snail's orientation
    const localEyePos = eyeStalkPosition.clone().sub(snailPosition);
    localEyePos.applyAxisAngle(new THREE.Vector3(0, 1, 0), -snailRotation);
    
    // Adjust for body position relative to snail center
    localEyePos.sub(new THREE.Vector3(0, 0, 0)); // Body is at center of snail
    
    // For a capsule lying on Z-axis (rotated by PI/2 on X):
    // We need to swap Y and Z because of the rotation
    const tempY = localEyePos.y;
    localEyePos.y = -localEyePos.z;
    localEyePos.z = tempY;
    
    // Calculate closest point on capsule's central axis (a line segment on the Z axis)
    const halfLength = bodyLength / 2;
    const clampedZ = Math.max(-halfLength, Math.min(halfLength, localEyePos.z));
    
    // Calculate distance from eye position to closest point on axis
    const closestPointOnAxis = new THREE.Vector3(0, 0, clampedZ);
    const distToAxis = new THREE.Vector3()
      .subVectors(localEyePos, closestPointOnAxis)
      .length();
      
    // Body collision occurs if this distance is less than the capsule radius
    const bodyCollision = distToAxis < bodyRadius;
    
    // SHELL COLLISION: Hemisphere shape
    // Shell dimensions (from Debug.js visualization)
    const shellRadius = 1.3 * scaleFactor;
    
    // Get the shell's world position
    const shellWorldPos = new THREE.Vector3();
    targetSnail.shell.getWorldPosition(shellWorldPos);
    
    // Calculate shell position relative to snail center in local space
    const shellLocalPos = new THREE.Vector3(0, 0.5, -0.8);
    
    // Transform eye stalk position to local space relative to shell position
    const localEyePosForShell = eyeStalkPosition.clone().sub(snailPosition);
    localEyePosForShell.applyAxisAngle(new THREE.Vector3(0, 1, 0), -snailRotation);
    localEyePosForShell.sub(shellLocalPos);
    
    // For a hemisphere, we check:
    // 1. Is the point within the radius?
    // 2. Is the point in the correct half-space? (Z <= 0 for hemisphere oriented to -Z)
    const distToShellCenter = localEyePosForShell.length();
    const inCorrectHalfSpace = localEyePosForShell.z <= 0;
    
    const shellCollision = distToShellCenter < shellRadius && inCorrectHalfSpace;
    
    // Store collision details for debugging
    this.lastCollisionDetails = {
      eyeStalkPosition: eyeStalkPosition.clone(),
      bodyPosition: bodyWorldPos.clone(),
      shellPosition: shellWorldPos.clone(),
      bodyRadius: bodyRadius,
      shellRadius: shellRadius,
      distToAxis: distToAxis,
      distToShellCenter: distToShellCenter,
      bodyCollision: bodyCollision,
      shellCollision: shellCollision
    };
    
    // Collision detected if either body or shell is hit
    const hasCollision = bodyCollision || shellCollision;
    this.lastCollisionResult = hasCollision;
    
    return hasCollision;
  }
  
  /**
   * Check if two snail bodies are colliding
   * 
   * @param {THREE.Object3D} snail1 - The first snail
   * @param {THREE.Object3D} snail2 - The second snail
   * @returns {Object} Collision result object with properties: collision, overlap, direction
   */
  checkBodyCollision(snail1, snail2) {
    // Get positions of both snails' bodies and shells
    const snail1BodyPosition = new THREE.Vector3();
    snail1.body.getWorldPosition(snail1BodyPosition);
    
    const snail1ShellPosition = new THREE.Vector3();
    snail1.shell.getWorldPosition(snail1ShellPosition);
    
    const snail2BodyPosition = new THREE.Vector3();
    snail2.body.getWorldPosition(snail2BodyPosition);
    
    const snail2ShellPosition = new THREE.Vector3();
    snail2.shell.getWorldPosition(snail2ShellPosition);
    
    // Define the collision radii
    const bodyRadius = 1.0;
    const shellRadius = 1.2;
    
    // Check all possible collisions between parts
    // Body-to-body
    const bodyBodyDistance = snail1BodyPosition.distanceTo(snail2BodyPosition);
    const bodyBodyCollision = bodyBodyDistance < (bodyRadius * 2);
    const bodyBodyOverlap = bodyBodyCollision ? (bodyRadius * 2) - bodyBodyDistance : 0;
    
    // Body-to-shell
    const bodyShellDistance = snail1BodyPosition.distanceTo(snail2ShellPosition);
    const bodyShellCollision = bodyShellDistance < (bodyRadius + shellRadius);
    const bodyShellOverlap = bodyShellCollision ? (bodyRadius + shellRadius) - bodyShellDistance : 0;
    
    // Shell-to-body
    const shellBodyDistance = snail1ShellPosition.distanceTo(snail2BodyPosition);
    const shellBodyCollision = shellBodyDistance < (shellRadius + bodyRadius);
    const shellBodyOverlap = shellBodyCollision ? (shellRadius + bodyRadius) - shellBodyDistance : 0;
    
    // Shell-to-shell
    const shellShellDistance = snail1ShellPosition.distanceTo(snail2ShellPosition);
    const shellShellCollision = shellShellDistance < (shellRadius * 2);
    const shellShellOverlap = shellShellCollision ? (shellRadius * 2) - shellShellDistance : 0;
    
    // Determine if there's any collision
    const collision = bodyBodyCollision || bodyShellCollision || 
                       shellBodyCollision || shellShellCollision;
    
    // Find the maximum overlap to report
    const overlap = Math.max(
      bodyBodyOverlap,
      bodyShellOverlap,
      shellBodyOverlap,
      shellShellOverlap
    );
    
    // Calculate the direction vector from snail1 to snail2
    // Use body centers for direction calculation
    const direction = new THREE.Vector3();
    
    if (bodyBodyDistance > 0) {
      // Safe normalization
      direction.copy(snail2BodyPosition).sub(snail1BodyPosition).normalize();
    } else {
      // If centers are at the exact same position (unlikely), use a default direction
      direction.set(1, 0, 0);
    }
    
    // Additional debug information if needed
    if (this.debugMode && collision) {
      console.log('Body collision check:');
      console.log('  Collision detected:', collision);
      console.log('  Maximum overlap:', overlap);
    }
    
    // Return detailed collision information
    return {
      collision,
      overlap,
      direction
    };
  }
  
  /**
   * Enable or disable debug mode
   * 
   * @param {boolean} enabled - Whether debug mode should be enabled
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
  }
  
  /**
   * Get the last collision check details
   * 
   * @returns {Object} Last collision check details
   */
  getLastCollisionDetails() {
    return this.lastCollisionDetails;
  }
} 