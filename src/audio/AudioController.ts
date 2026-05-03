/**
 * Controller for audio and music in the game
 */
export class AudioController {
  declare attackTime: any;
  declare audioContext: any;
  declare availableNotes: any;
  declare compressor: any;
  declare currentNoteIndex: any;
  declare isPlaying: any;
  declare mainGainNode: any;
  declare noteDuration: any;
  declare noteTimerId: any;
  declare noteToFreq: any;
  declare notes: any;
  declare releaseTime: any;
  declare sequenceChangeTimer: any;
  constructor() {
    // Initialize Web Audio API
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error('Web Audio API is not available.');
    }
    this.audioContext = new AudioContextCtor();

    // Set up main gain node
    this.mainGainNode = this.audioContext.createGain();
    this.mainGainNode.gain.value = 0.5; // 50% volume
    this.mainGainNode.connect(this.audioContext.destination);

    this.noteToFreq = {
      'C3': 130.81,
      'C#3': 138.59,
      'D3': 146.83,
      'D#3': 155.56,
      'E3': 164.81,
      'F3': 174.61,
      'F#3': 185.00,
      'G3': 196.00,
      'G#3': 207.65,
      'A3': 220.00,
      'A#3': 233.08,
      'B3': 246.94,
      'C4': 261.63,
    };

    // Available notes for random sequence generation
    this.availableNotes = Object.keys(this.noteToFreq);

    // Music sequence configuration
    this.noteDuration = 0.5; // Duration of each note in seconds
    this.notes = this.generateRandomSequence(); // Generate initial random sequence
    this.currentNoteIndex = 0;
    this.isPlaying = false;
    this.noteTimerId = null;

    // Use a small attack/release time to avoid clicks
    this.attackTime = 0.05; // 50ms attack time
    this.releaseTime = 0.05; // 50ms release time

    // Create a compressor to smooth out transitions
    this.compressor = this.audioContext.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 30;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;
    this.compressor.connect(this.mainGainNode);

    // Timer for changing sequences periodically
    this.sequenceChangeTimer = null;
  }

  /**
   * Generate a random sequence of notes
   * @param {number} length - The length of the sequence (default: 4-8 notes)
   * @returns {string[]} An array of note names
   */
  generateRandomSequence(length: number | null = null) {
    // If no length specified, choose a random length between 4 and 8
    if (length === null) {
      length = Math.floor(Math.random() * 5) + 4; // 4 to 8 notes
    }

    const sequence: { note: string; duration: number }[] = [];

    // Generate sequence with some musical rules
    for (let i = 0; i < length; i++) {
      let noteIndex;

      if (i === 0) {
        // First note is completely random from available notes
        noteIndex = Math.floor(Math.random() * this.availableNotes.length);
      } else {
        // Subsequent notes are more likely to be close to the previous note
        // to create a more musical sequence
        const prevNoteIndex = this.availableNotes.indexOf(sequence[i - 1].note);
        const maxJump = 3; // Maximum jump in either direction

        // Generate a random jump between -maxJump and +maxJump
        const jump = Math.floor(Math.random() * (maxJump * 2 + 1)) - maxJump;

        // Calculate new index and wrap around if needed
        noteIndex = (prevNoteIndex + jump + this.availableNotes.length) % this.availableNotes.length;
      }

      const duration = Math.random() < 0.5 ? this.noteDuration : this.noteDuration * 0.5;
      sequence.push({ note: this.availableNotes[noteIndex], duration });
    }

    console.log("New music sequence generated:", sequence.map(n => `${n.note}(${n.duration}s)`));
    return sequence;
  }

  /**
   * Change to a new random sequence
   */
  changeSequence() {
    this.notes = this.generateRandomSequence();
    this.currentNoteIndex = 0;

    // If already playing, the new sequence will start on the next note
    console.log("Music sequence changed");
  }

  /**
   * Start playing the music sequence
   */
  startMusic() {
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.currentNoteIndex = 0;

    // Resume audio context if it was suspended (browser policy)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    this.playNextNote();

    // Set up sequence change timer - change sequence every 20-30 seconds
    const changeInterval = (Math.random() * 10000) + 20000; // 20-30 seconds
    this.sequenceChangeTimer = setInterval(() => {
      this.changeSequence();
    }, changeInterval);
  }

  /**
   * Stop the music sequence
   */
  stopMusic() {
    if (!this.isPlaying) return;

    this.isPlaying = false;

    // Clear any pending note timer
    if (this.noteTimerId) {
      clearTimeout(this.noteTimerId);
      this.noteTimerId = null;
    }

    // Clear sequence change timer
    if (this.sequenceChangeTimer) {
      clearInterval(this.sequenceChangeTimer);
      this.sequenceChangeTimer = null;
    }
  }

  /**
   * Play the next note in the sequence
   */
  playNextNote() {
    if (!this.isPlaying) return;

    // Get the current note to play
    const { note: noteName, duration } = this.notes[this.currentNoteIndex];
    const frequency = this.noteToFreq[noteName];

    // Play the note
    this.playTone(frequency, duration);

    // Move to the next note in the sequence
    this.currentNoteIndex = (this.currentNoteIndex + 1) % this.notes.length;

    // Schedule the next note slightly before this one ends for smoother transition
    const schedulingOffset = 0.05; // 50ms overlap
    const nextNoteTime = Math.max(0, duration - schedulingOffset) * 1000;

    this.noteTimerId = setTimeout(() => {
      this.playNextNote();
    }, nextNoteTime);
  }

  /**
   * Play a single tone at the specified frequency
   * @param {number} frequency - The frequency of the tone to play
   * @param {number} duration - The duration of the tone in seconds
   */
  playTone(frequency, duration) {
    // Get the current time
    const currentTime = this.audioContext.currentTime;

    // Create oscillator
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = 'sine'; // Could also be square, sawtooth, triangle
    oscillator.frequency.value = frequency;

    // Create a gain node for this specific note
    const noteGainNode = this.audioContext.createGain();
    noteGainNode.gain.value = 0;

    // Connect the oscillator to the note gain node, then to the compressor and main gain
    oscillator.connect(noteGainNode);
    noteGainNode.connect(this.compressor);

    // Start with zero gain
    noteGainNode.gain.setValueAtTime(0, currentTime);

    // Fade in - attack
    noteGainNode.gain.linearRampToValueAtTime(1, currentTime + this.attackTime);

    // Fade out - release (start a bit before the note ends)
    const releaseStart = currentTime + duration - this.releaseTime;
    noteGainNode.gain.setValueAtTime(1, releaseStart);
    noteGainNode.gain.linearRampToValueAtTime(0, currentTime + duration);

    // Start the oscillator
    oscillator.start(currentTime);
    oscillator.stop(currentTime + duration);

    // Clean up after stopping
    oscillator.onended = function () {
      oscillator.disconnect();
      noteGainNode.disconnect();
    };
  }

  /**
   * Set the volume of the audio (0.0 to 1.0)
   * @param {number} volume - Volume from 0 to 1
   */
  setVolume(volume) {
    this.mainGainNode.gain.value = Math.max(0, Math.min(1, volume));
  }
} 
