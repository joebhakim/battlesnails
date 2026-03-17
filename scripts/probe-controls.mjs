import { PlayerSnail } from '../src/entities/PlayerSnail.js';

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundVector(vector) {
  return {
    x: Number(vector.x.toFixed(4)),
    y: Number(vector.y.toFixed(4)),
    z: Number(vector.z.toFixed(4))
  };
}

function createCombatInput(side, lookX, lookY) {
  return {
    engaged: side !== 'idle',
    leftHeld: side === 'left' || side === 'both',
    rightHeld: side === 'right' || side === 'both',
    lookX,
    lookY,
    pointerLocked: true
  };
}

const [sideArg = 'left', lookXArg = '0', lookYArg = '0', framesArg = '1'] = process.argv.slice(2);
const side = ['idle', 'left', 'right', 'both'].includes(sideArg) ? sideArg : 'left';
const lookX = parseNumber(lookXArg, 0);
const lookY = parseNumber(lookYArg, 0);
const frames = Math.max(1, Math.floor(parseNumber(framesArg, 1)));
const delta = 1 / 60;

const player = new PlayerSnail();
const input = createCombatInput(side, lookX, lookY);

for (let index = 0; index < frames; index += 1) {
  player.update(delta, input);
}

const snapshot = {
  side,
  lookX,
  lookY,
  frames,
  controlMode: player.getCombatMode(),
  intensity: Number(player.getControlIntensity().toFixed(4)),
  left: {
    targetVector: roundVector(player.getStalkTargetVector('left')),
    currentVector: roundVector(player.getStalkCurrentVector('left')),
    tipPosition: roundVector(player.getEyeStalkPosition('left')),
    tipVelocity: roundVector(player.getEyeStalkVelocity('left'))
  },
  right: {
    targetVector: roundVector(player.getStalkTargetVector('right')),
    currentVector: roundVector(player.getStalkCurrentVector('right')),
    tipPosition: roundVector(player.getEyeStalkPosition('right')),
    tipVelocity: roundVector(player.getEyeStalkVelocity('right'))
  }
};

console.log(JSON.stringify(snapshot, null, 2));
