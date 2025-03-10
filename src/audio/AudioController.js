/**
 * Controller for audio and music in the game
 */
export class AudioController {
  constructor() {
    // Initialize Web Audio API
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Set up main gain node
    this.mainGainNode = this.audioContext.createGain();
    this.mainGainNode.gain.value = 0.5; // 50% volume
    this.mainGainNode.connect(this.audioContext.destination);
    
    // Music sequence configuration
    this.notes = ['C2', 'C#2', 'D2', 'C#2']; // The note sequence to play
    this.currentNoteIndex = 0;
    this.noteDuration = 0.5; // Duration of each note in seconds
    this.isPlaying = false;
    this.noteTimerId = null;
    
    // Use a small attack/release time to avoid clicks
    this.attackTime = 0.05; // 50ms attack time
    this.releaseTime = 0.05; // 50ms release time
    
    // Frequency mapping for MIDI notes
    this.noteToFreq = {
      'C2': 65.41, // C2
      'C#2': 69.30, // C#2
      'D2': 73.42, // D2
    };
    
    // Create a compressor to smooth out transitions
    this.compressor = this.audioContext.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 30;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;
    this.compressor.connect(this.mainGainNode);
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
  }
  
  /**
   * Play the next note in the sequence
   */
  playNextNote() {
    if (!this.isPlaying) return;
    
    // Get the current note to play
    const noteName = this.notes[this.currentNoteIndex];
    const frequency = this.noteToFreq[noteName];
    
    // Play the note
    this.playTone(frequency, this.noteDuration);
    
    // Move to the next note in the sequence
    this.currentNoteIndex = (this.currentNoteIndex + 1) % this.notes.length;
    
    // Schedule the next note slightly before this one ends for smoother transition
    const schedulingOffset = 0.05; // 50ms overlap
    const nextNoteTime = Math.max(0, this.noteDuration - schedulingOffset) * 1000;
    
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
    oscillator.onended = function() {
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