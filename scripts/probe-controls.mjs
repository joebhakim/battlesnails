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

function roundPose(pose) {
  return {
    yaw: Number(pose.yaw.toFixed(4)),
    pitch: Number(pose.pitch.toFixed(4))
  };
}

function createCombatInput(mode, lookX, lookY) {
  return {
    engaged: mode !== 'idle',
    mode,
    primaryHeld: mode === 'swing',
    secondaryHeld: mode === 'thrust',
    lookX,
    lookY,
    pointerLocked: true
  };
}

const [modeArg = 'swing', lookXArg = '0', lookYArg = '0', framesArg = '1'] = process.argv.slice(2);
const mode = ['idle', 'swing', 'thrust'].includes(modeArg) ? modeArg : 'swing';
const lookX = parseNumber(lookXArg, 0);
const lookY = parseNumber(lookYArg, 0);
const frames = Math.max(1, Math.floor(parseNumber(framesArg, 1)));
const delta = 1 / 60;

const player = new PlayerSnail();
const input = createCombatInput(mode, lookX, lookY);

for (let index = 0; index < frames; index += 1) {
  player.update(delta, input);
}

const snapshot = {
  mode,
  lookX,
  lookY,
  frames,
  targetPose: roundPose(player.stalkTargetPose),
  pose: roundPose(player.stalkPose),
  eyeRotation: {
    x: Number(player.eyeStalk.rotation.x.toFixed(4)),
    y: Number(player.eyeStalk.rotation.y.toFixed(4)),
    z: Number(player.eyeStalk.rotation.z.toFixed(4))
  },
  eyeScaleY: Number(player.eyeStalk.scale.y.toFixed(4)),
  controlMode: player.getCombatMode(),
  intensity: Number(player.getControlIntensity().toFixed(4)),
  tipPosition: roundVector(player.getEyeStalkPosition()),
  tipVelocity: roundVector(player.getEyeStalkVelocity())
};

console.log(JSON.stringify(snapshot, null, 2));
