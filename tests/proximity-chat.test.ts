import test from 'node:test';
import assert from 'node:assert/strict';

import { createIdleInput } from '../src/protocol/InputProtocol.js';
import { TestSession } from '../src/game/TestSession.js';
import {
  ANNOYING_LECTURER_SLOT,
  ANNOYING_LECTURER_VOICE_SOURCE,
  PROXIMITY_CHAT_MAX_DISTANCE,
  buildProximitySpeakerEntries,
  getProximityChatVolume
} from '../src/audio/ProximityChat.js';
import { MATCH_TICK_DURATION } from '../src/sim/MatchSimulation.js';

test('proximity chat filters audible snails and sorts them nearest first', () => {
  const local = {
    slot: 1,
    position: { x: 0, y: 0, z: 0 }
  };
  const speakers = buildProximitySpeakerEntries(local, [
    {
      slot: 2,
      profileName: 'human',
      connected: true,
      health: 10,
      displayName: 'Far Human',
      position: { x: PROXIMITY_CHAT_MAX_DISTANCE - 1, y: 0, z: 0 }
    },
    {
      slot: 3,
      profileName: 'bot',
      connected: true,
      health: 10,
      displayName: 'Close Bot',
      position: { x: 4, y: 0, z: 0 }
    },
    {
      slot: 4,
      profileName: 'bot',
      connected: true,
      health: 10,
      displayName: 'Too Far',
      position: { x: PROXIMITY_CHAT_MAX_DISTANCE + 0.5, y: 0, z: 0 }
    },
    {
      slot: 9001,
      profileName: 'fixture',
      fixtureKind: 'cube',
      connected: true,
      health: 10,
      displayName: 'Cube',
      position: { x: 2, y: 0, z: 0 }
    }
  ]);

  assert.deepEqual(speakers.map((speaker) => speaker.slot), [3, 2]);
  assert(speakers[0].volume > speakers[1].volume);
  assert.equal(getProximityChatVolume(PROXIMITY_CHAT_MAX_DISTANCE), 0);
});

test('test mode keeps the annoying lecturer inside half proximity range with looping voice metadata', () => {
  const session = new TestSession({ storage: null });
  session.update(MATCH_TICK_DURATION, createIdleInput());

  const local = session.getLocalPlayerState();
  const lecturer = session.getOtherPlayerStates().find((player) => player.slot === ANNOYING_LECTURER_SLOT);
  assert(lecturer);

  const distance = Math.hypot(
    lecturer.position.x - local.position.x,
    lecturer.position.z - local.position.z
  );
  assert(distance <= (PROXIMITY_CHAT_MAX_DISTANCE * 0.5) + 0.001);

  const speakers = buildProximitySpeakerEntries(local, session.getOtherPlayerStates());
  const lecturerSpeaker = speakers.find((speaker) => speaker.slot === ANNOYING_LECTURER_SLOT);
  assert(lecturerSpeaker);
  assert.equal(lecturerSpeaker.voiceSource, ANNOYING_LECTURER_VOICE_SOURCE);
  assert(lecturerSpeaker.volume > 0);
});
