(function initMemoryEnvelopeAudio(root) {
  'use strict';

  const AudioContextType = root.AudioContext || root.webkitAudioContext;
  let context = null;
  let masterGain = null;
  let musicGain = null;
  let sfxGain = null;
  let enabled = false;
  let musicTimer = null;
  let musicGeneration = 0;
  let voices = new Set();
  let phraseIndex = 0;
  let lastEffect = null;
  let effectCount = 0;

  // An original, airy major-key score. Each three-note wash overlaps the next,
  // so the sound stays continuous without introducing an ominous low drone.
  const phrases = Object.freeze([
    Object.freeze([
      Object.freeze({ frequency: 261.63, offset: 0.00, duration: 4.60, level: 0.070 }),
      Object.freeze({ frequency: 329.63, offset: 0.18, duration: 4.55, level: 0.056 }),
      Object.freeze({ frequency: 392.00, offset: 0.36, duration: 4.50, level: 0.044 }),
    ]),
    Object.freeze([
      Object.freeze({ frequency: 293.66, offset: 0.00, duration: 4.60, level: 0.064 }),
      Object.freeze({ frequency: 369.99, offset: 0.18, duration: 4.55, level: 0.052 }),
      Object.freeze({ frequency: 440.00, offset: 0.36, duration: 4.50, level: 0.042 }),
    ]),
    Object.freeze([
      Object.freeze({ frequency: 329.63, offset: 0.00, duration: 4.60, level: 0.060 }),
      Object.freeze({ frequency: 392.00, offset: 0.18, duration: 4.55, level: 0.050 }),
      Object.freeze({ frequency: 493.88, offset: 0.36, duration: 4.50, level: 0.040 }),
    ]),
    Object.freeze([
      Object.freeze({ frequency: 349.23, offset: 0.00, duration: 4.60, level: 0.060 }),
      Object.freeze({ frequency: 440.00, offset: 0.18, duration: 4.55, level: 0.048 }),
      Object.freeze({ frequency: 523.25, offset: 0.36, duration: 4.50, level: 0.038 }),
    ]),
  ]);

  function state() {
    return Object.freeze({
      supported: Boolean(AudioContextType),
      enabled,
      audible: Boolean(enabled && context && context.state === 'running' && !document.hidden),
      contextState: context ? context.state : 'uninitialized',
      activeVoiceCount: voices.size,
      lastEffect,
      effectCount,
    });
  }

  function ensureContext() {
    if (context || !AudioContextType) return context;
    context = new AudioContextType();
    masterGain = context.createGain();
    musicGain = context.createGain();
    sfxGain = context.createGain();
    masterGain.gain.value = 0;
    musicGain.gain.value = 0.18;
    sfxGain.gain.value = 0.09;
    musicGain.connect(masterGain);
    sfxGain.connect(masterGain);
    masterGain.connect(context.destination);
    return context;
  }

  function disconnectVoice(voice) {
    voices.delete(voice);
    [voice.oscillator, voice.filter, voice.gain].forEach((node) => {
      try { node.disconnect(); } catch (error) { /* already disconnected */ }
    });
  }

  function stopVoices() {
    Array.from(voices).forEach((voice) => {
      voice.oscillator.onended = null;
      try { voice.oscillator.stop(); } catch (error) { /* already stopped */ }
      disconnectVoice(voice);
    });
    voices.clear();
  }

  function playSustainedNote(note) {
    if (!context || !enabled || context.state !== 'running' || document.hidden) return;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const startAt = context.currentTime + note.offset;
    const endAt = startAt + note.duration;

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(note.frequency, startAt);
    oscillator.detune.setValueAtTime(-2.5, startAt);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2100, startAt);
    filter.frequency.exponentialRampToValueAtTime(1250, endAt);
    filter.Q.value = 0.35;

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(note.level, startAt + 0.42);
    gain.gain.exponentialRampToValueAtTime(note.level * 0.72, startAt + 2.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(musicGain);

    const voice = { oscillator, filter, gain };
    voices.add(voice);
    oscillator.onended = () => disconnectVoice(voice);
    oscillator.start(startAt);
    oscillator.stop(endAt + 0.04);
  }

  function playPhrase() {
    if (!context || !enabled || context.state !== 'running' || document.hidden) return;
    phrases[phraseIndex % phrases.length].forEach(playSustainedNote);
    phraseIndex = (phraseIndex + 1) % phrases.length;
  }

  function scheduleMusic(generation) {
    if (!enabled || generation !== musicGeneration || document.hidden) return;
    playPhrase();
    musicTimer = root.setTimeout(() => scheduleMusic(generation), 3400);
  }

  function startMusic() {
    if (!context || !enabled || context.state !== 'running' || document.hidden) return;
    musicGeneration += 1;
    const generation = musicGeneration;
    stopVoices();
    scheduleMusic(generation);
  }

  function stopMusic() {
    musicGeneration += 1;
    if (musicTimer !== null) root.clearTimeout(musicTimer);
    musicTimer = null;
    stopVoices();
  }

  async function toggle() {
    if (!AudioContextType) return state();
    const audioContext = ensureContext();
    if (!enabled) {
      enabled = true;
      try {
        if (audioContext.state !== 'running') await audioContext.resume();
        if (!enabled) return state();
        const now = audioContext.currentTime;
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(Math.max(0.0001, masterGain.gain.value), now);
        masterGain.gain.exponentialRampToValueAtTime(0.68, now + 0.42);
        startMusic();
      } catch (error) {
        enabled = false;
        stopMusic();
      }
      return state();
    }

    enabled = false;
    stopMusic();
    const now = audioContext.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(Math.max(0.0001, masterGain.gain.value), now);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    root.setTimeout(() => {
      if (!enabled && context && context.state === 'running') context.suspend().catch(() => {});
    }, 55);
    return state();
  }

  function playPhotoPick() {
    if (!enabled || !context || context.state !== 'running' || document.hidden) return false;
    const now = context.currentTime;
    const duration = 0.095;
    const frameCount = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      const envelope = 1 - index / channel.length;
      channel[index] = (Math.random() * 2 - 1) * envelope * envelope;
    }

    const paper = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const paperGain = context.createGain();
    paper.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = 1900;
    filter.Q.value = 0.9;
    paperGain.gain.setValueAtTime(0.0001, now);
    paperGain.gain.exponentialRampToValueAtTime(0.48, now + 0.009);
    paperGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    paper.connect(filter);
    filter.connect(paperGain);
    paperGain.connect(sfxGain);
    paper.onended = () => {
      [paper, filter, paperGain].forEach((node) => {
        try { node.disconnect(); } catch (error) { /* already disconnected */ }
      });
    };
    paper.start(now);
    paper.stop(now + duration);

    const chime = context.createOscillator();
    const chimeGain = context.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(659.25, now);
    chime.frequency.exponentialRampToValueAtTime(783.99, now + 0.075);
    chimeGain.gain.setValueAtTime(0.0001, now);
    chimeGain.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    chime.connect(chimeGain);
    chimeGain.connect(sfxGain);
    chime.onended = () => {
      [chime, chimeGain].forEach((node) => {
        try { node.disconnect(); } catch (error) { /* already disconnected */ }
      });
    };
    chime.start(now);
    chime.stop(now + 0.15);

    lastEffect = 'photo-pick';
    effectCount += 1;
    return true;
  }

  function canPlayEffect() {
    return Boolean(enabled && context && context.state === 'running' && !document.hidden);
  }

  function playNoise(duration, peak, centerFrequency, effectName) {
    if (!canPlayEffect()) return false;
    const now = context.currentTime;
    const frameCount = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      const progress = index / channel.length;
      const envelope = Math.sin(Math.PI * progress) * (1 - progress * 0.38);
      channel[index] = (Math.random() * 2 - 1) * envelope;
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(centerFrequency * 0.82, now);
    filter.frequency.exponentialRampToValueAtTime(centerFrequency, now + duration);
    filter.Q.value = 0.72;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + Math.min(0.045, duration * 0.28));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);
    source.onended = () => {
      [source, filter, gain].forEach((node) => {
        try { node.disconnect(); } catch (error) { /* already disconnected */ }
      });
    };
    source.start(now);
    source.stop(now + duration);
    lastEffect = effectName;
    effectCount += 1;
    return true;
  }

  function playAdvance() {
    if (!canPlayEffect()) return false;
    const now = context.currentTime;
    const tone = context.createOscillator();
    const gain = context.createGain();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(523.25, now);
    tone.frequency.exponentialRampToValueAtTime(659.25, now + 0.16);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    tone.connect(gain);
    gain.connect(sfxGain);
    tone.onended = () => {
      [tone, gain].forEach((node) => {
        try { node.disconnect(); } catch (error) { /* already disconnected */ }
      });
    };
    tone.start(now);
    tone.stop(now + 0.23);
    lastEffect = 'advance';
    effectCount += 1;
    return true;
  }

  function playPaperOpen() {
    return playNoise(0.34, 0.34, 1450, 'paper-open');
  }
  function pauseForPage() {
    if (!context || !enabled) return;
    stopMusic();
    if (context.state === 'running') context.suspend().catch(() => {});
  }

  function resumeForPage() {
    if (!context || !enabled || document.hidden) return;
    context.resume().then(startMusic).catch(() => {});
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseForPage();
      return;
    }
    resumeForPage();
  });

  root.addEventListener('pagehide', pauseForPage);
  root.addEventListener('pageshow', resumeForPage);

  root.MemoryEnvelopeAudio = Object.freeze({
    getState: state,
    toggle,
    playPhotoPick,
    playAdvance,
    playPaperOpen,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
