const DEFAULT_MASTER_VOLUME = 0.72;

export class ProximityVoiceController {
  declare audioElement: HTMLAudioElement | null;
  declare blockedByAutoplay: boolean;
  declare currentSource: string | null;
  declare masterVolume: number;
  declare unlockHandler: any;

  constructor(options: any = {}) {
    this.audioElement = null;
    this.currentSource = null;
    this.masterVolume = options.masterVolume ?? DEFAULT_MASTER_VOLUME;
    this.blockedByAutoplay = false;
    this.unlockHandler = () => {
      this.blockedByAutoplay = false;
      if (this.audioElement?.paused) {
        void this.audioElement.play().catch(() => {
          this.blockedByAutoplay = true;
        });
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', this.unlockHandler, { passive: true });
      document.addEventListener('keydown', this.unlockHandler);
    }
  }

  ensureAudioElement(source: string) {
    if (this.audioElement && this.currentSource === source) {
      return this.audioElement;
    }

    this.stop();
    const audio = new Audio(source);
    audio.loop = true;
    audio.preload = 'auto';
    this.audioElement = audio;
    this.currentSource = source;
    return audio;
  }

  update(speakers: any[] = []) {
    const voiceSpeaker = speakers
      .filter((speaker) => speaker?.voiceSource && speaker.volume > 0)
      .sort((left, right) => right.volume - left.volume)[0] ?? null;

    if (!voiceSpeaker) {
      this.pause();
      return;
    }

    const audio = this.ensureAudioElement(voiceSpeaker.voiceSource);
    audio.volume = Math.max(0, Math.min(1, voiceSpeaker.volume * this.masterVolume));

    if (!audio.paused) {
      return;
    }

    if (this.blockedByAutoplay) {
      return;
    }

    const playPromise = audio.play();
    if (playPromise?.catch) {
      playPromise
        .then(() => {
          this.blockedByAutoplay = false;
        })
        .catch(() => {
          this.blockedByAutoplay = true;
        });
    }
  }

  pause() {
    if (!this.audioElement) {
      return;
    }

    this.audioElement.pause();
  }

  stop() {
    if (!this.audioElement) {
      return;
    }

    this.audioElement.pause();
    this.audioElement.currentTime = 0;
    this.audioElement = null;
    this.currentSource = null;
  }

  dispose() {
    this.stop();
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', this.unlockHandler);
      document.removeEventListener('keydown', this.unlockHandler);
    }
  }
}
