// A tiny tracker-style chiptune engine on top of WebAudio. Patterns are written
// as space-separated steps: a note name ("c4", "f#3"), "-" for a rest, or "."
// to hold the previous note for another step.

const NOTE_OFFSETS = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function noteToHz(token) {
  const match = /^([a-g])([#b]?)(-?\d)$/.exec(token);
  if (!match) return null;
  const [, letter, accidental, octave] = match;
  let semitone = NOTE_OFFSETS[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
  const midi = semitone + (Number(octave) + 1) * 12;
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Turns a pattern string into [{hz, step, steps}] note events. */
function compile(pattern) {
  const tokens = pattern.trim().split(/\s+/);
  const events = [];
  tokens.forEach((token, step) => {
    if (token === '.') {
      if (events.length) events[events.length - 1].steps++;
      return;
    }
    if (token === '-') return;
    const hz = noteToHz(token);
    if (hz) events.push({ hz, step, steps: 1 });
  });
  return { events, length: tokens.length };
}

const VOICES = {
  lead: { type: 'square', gain: 0.16, attack: 0.006, release: 0.06, detune: 0 },
  harmony: { type: 'square', gain: 0.075, attack: 0.02, release: 0.12, detune: 7 },
  bass: { type: 'triangle', gain: 0.2, attack: 0.008, release: 0.08, detune: 0 },
};

class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.track = null;
    this.trackName = null;
    this.nextStepTime = 0;
    this.step = 0;
    this.stepDuration = 0.125;
  }

  /** Must be called from a user gesture; browsers block audio otherwise. */
  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  }

  /** Starts a looping track. Re-requesting the current track is a no-op. */
  play(name, tracks) {
    if (this.trackName === name) return;
    const def = tracks[name];
    this.trackName = name;
    if (!def) {
      this.track = null;
      return;
    }
    this.track = {
      voices: Object.entries(def.voices).map(([voice, pattern]) => ({
        voice,
        ...compile(pattern),
      })),
      length: Math.max(...Object.values(def.voices).map((p) => p.trim().split(/\s+/).length)),
    };
    this.stepDuration = 15 / (def.tempo * 2); // tempo in BPM, two steps per beat
    this.step = 0;
    this.nextStepTime = this.ctx ? this.ctx.currentTime + 0.05 : 0;
  }

  stop() {
    this.track = null;
    this.trackName = null;
  }

  /** Called every frame; schedules a short window of notes ahead of time. */
  update() {
    if (!this.ctx || !this.track) return;
    const horizon = this.ctx.currentTime + 0.2;
    let guard = 64;
    while (this.nextStepTime < horizon && guard-- > 0) {
      for (const line of this.track.voices) {
        for (const event of line.events) {
          if (event.step === this.step) {
            this.tone(event.hz, this.nextStepTime, event.steps * this.stepDuration, VOICES[line.voice]);
          }
        }
      }
      this.nextStepTime += this.stepDuration;
      this.step = (this.step + 1) % this.track.length;
    }
  }

  tone(hz, at, duration, voice) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = voice.type;
    osc.frequency.value = hz;
    osc.detune.value = voice.detune;
    const peak = voice.gain;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(peak, at + voice.attack);
    gain.gain.setTargetAtTime(peak * 0.6, at + voice.attack, 0.08);
    gain.gain.setTargetAtTime(0.0001, at + Math.max(0.03, duration - voice.release), 0.03);
    osc.connect(gain).connect(this.master);
    osc.start(at);
    osc.stop(at + duration + 0.12);
  }

  /** One-shot sound effect: a short pitch sweep plus optional noise. */
  sfx(name) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const presets = {
      cursor: { from: 880, to: 1180, dur: 0.05, type: 'square', gain: 0.12 },
      confirm: { from: 660, to: 1320, dur: 0.1, type: 'square', gain: 0.14 },
      cancel: { from: 520, to: 300, dur: 0.09, type: 'square', gain: 0.12 },
      hit: { from: 320, to: 120, dur: 0.16, type: 'sawtooth', gain: 0.16, noise: 0.2 },
      strong: { from: 420, to: 90, dur: 0.28, type: 'sawtooth', gain: 0.2, noise: 0.35 },
      weak: { from: 240, to: 160, dur: 0.14, type: 'sine', gain: 0.12 },
      faint: { from: 500, to: 60, dur: 0.5, type: 'triangle', gain: 0.18 },
      heal: { from: 520, to: 1040, dur: 0.3, type: 'sine', gain: 0.16 },
      ball: { from: 300, to: 760, dur: 0.18, type: 'square', gain: 0.14 },
      caught: { from: 660, to: 1560, dur: 0.45, type: 'square', gain: 0.16 },
      levelup: { from: 520, to: 1560, dur: 0.5, type: 'square', gain: 0.15 },
      bump: { from: 150, to: 90, dur: 0.07, type: 'square', gain: 0.1 },
      encounter: { from: 180, to: 900, dur: 0.4, type: 'sawtooth', gain: 0.15 },
      money: { from: 990, to: 1480, dur: 0.14, type: 'square', gain: 0.13 },
    };
    const p = presets[name];
    if (!p) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = p.type;
    osc.frequency.setValueAtTime(p.from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, p.to), now + p.dur);
    gain.gain.setValueAtTime(p.gain, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + p.dur);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + p.dur + 0.02);

    if (p.noise) this.noiseBurst(now, p.dur, p.noise);
  }

  noiseBurst(at, duration, amount) {
    const frames = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = amount * 0.25;
    source.connect(gain).connect(this.master);
    source.start(at);
  }
}

export const audio = new Audio();
