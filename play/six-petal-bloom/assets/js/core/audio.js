// 离线声音：嵌入式背景曲 + Web Audio 瓷磬短音。
(function attachAudio(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LCN = root.LCN || {};
  Object.assign(root.LCN, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function createAudioApi(root) {
  'use strict';

  const PENTATONIC = [196.00, 220.00, 246.94, 293.66, 329.63, 392.00];

  function defaultFactory() {
    const AudioContext = root.AudioContext || root.webkitAudioContext;
    return AudioContext ? new AudioContext() : null;
  }

  function createSoundController(contextFactory, clock, musicAsset) {
    const makeContext = contextFactory || defaultFactory;
    const music = musicAsset || null;
    let context = null;
    let master = null;
    let musicGain = null;
    let musicBufferPromise = null;
    let musicSource = null;
    let musicOn = false;
    let musicStartPromise = null;
    let musicGeneration = 0;

    function ensureContext() {
      if (!context) {
        try {
          context = makeContext();
        } catch (error) {
          context = null;
        }
      }
      if (!context) return null;
      if (!master) {
        master = context.createGain();
        master.gain.setValueAtTime(0.72, context.currentTime);
        master.connect(context.destination);
      }
      if (context.state === 'suspended' && typeof context.resume === 'function') {
        const resumed = context.resume();
        if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
      }
      return context;
    }

    function ensureMusicGain(audio) {
      if (!musicGain) {
        musicGain = audio.createGain();
        musicGain.gain.setValueAtTime(0.38, audio.currentTime);
        musicGain.connect(audio.destination);
      }
      return musicGain;
    }

    function base64ToArrayBuffer(value) {
      if (typeof value !== 'string' || value.length === 0 || typeof root.atob !== 'function') {
        throw new Error('Embedded background music is unavailable.');
      }
      const binary = root.atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes.buffer;
    }

    function decodeAudioData(audio, data) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const succeed = (buffer) => {
          if (settled) return;
          settled = true;
          resolve(buffer);
        };
        const fail = (error) => {
          if (settled) return;
          settled = true;
          reject(error || new Error('Unable to decode background music.'));
        };

        try {
          const decoded = audio.decodeAudioData(data, succeed, fail);
          if (decoded && typeof decoded.then === 'function') decoded.then(succeed, fail);
        } catch (error) {
          fail(error);
        }
      });
    }

    function loadMusicBuffer(audio) {
      if (!musicBufferPromise) {
        const data = base64ToArrayBuffer(music.base64);
        musicBufferPromise = decodeAudioData(audio, data).catch((error) => {
          musicBufferPromise = null;
          throw error;
        });
      }
      return musicBufferPromise;
    }

    function stopMusicSource() {
      musicGeneration += 1;
      if (musicSource) {
        try { musicSource.stop(0); } catch (error) { /* source already stopped */ }
        if (typeof musicSource.disconnect === 'function') {
          try { musicSource.disconnect(); } catch (error) { /* disconnected */ }
        }
      }
      musicSource = null;
      musicOn = false;
    }

    function tone(frequency, duration, volume, type, startOffset) {
      const audio = ensureContext();
      if (!audio || !master) return;
      const startedAt = audio.currentTime + (startOffset || 0);
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const filter = audio.createBiquadFilter();
      oscillator.type = type || 'sine';
      oscillator.frequency.setValueAtTime(frequency, startedAt);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(4200, frequency * 5.5), startedAt);
      filter.Q.setValueAtTime(0.7, startedAt);
      gain.gain.setValueAtTime(0.0001, startedAt);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), startedAt + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + duration);
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      oscillator.start(startedAt);
      oscillator.stop(startedAt + duration + 0.03);
    }

    async function startMusic(forceRetry) {
      // 打开时先排队；若浏览器暂停 AudioContext，首次合法手势会再次请求恢复。
      const audio = ensureContext();
      if (!audio || !music || typeof music.base64 !== 'string') return false;
      if (musicOn) return true;
      if (musicStartPromise) {
        const openingResult = await musicStartPromise;
        if (openingResult || !forceRetry) return openingResult;
      }
      const generation = musicGeneration;
      const pending = (async () => {
        try {
          const buffer = await loadMusicBuffer(audio);
          if (generation !== musicGeneration) return false;
          const source = audio.createBufferSource();
          source.buffer = buffer;
          source.loop = true;
          source.connect(ensureMusicGain(audio));
          source.start(0);
          musicSource = source;
          musicOn = true;
          return true;
        } catch (error) {
          musicOn = false;
          return false;
        }
      })();
      musicStartPromise = pending;
      try {
        return await pending;
      } finally {
        if (musicStartPromise === pending) musicStartPromise = null;
      }
    }

    async function toggleMusic() {
      if (!musicOn) return startMusic();
      stopMusicSource();
      return false;
    }

    function playCrystalTap(index) {
      const step = Math.max(0, Number(index) || 0) % PENTATONIC.length;
      const rootFrequency = PENTATONIC[(step + 2) % PENTATONIC.length] * 2;
      tone(rootFrequency, 0.72, 0.085, 'sine', 0);
      tone(rootFrequency * 1.498, 0.52, 0.034, 'triangle', 0.006);
      tone(rootFrequency * 2.01, 0.34, 0.016, 'sine', 0.012);
    }

    function prepare() {
      return Boolean(ensureContext());
    }

    function stop() {
      stopMusicSource();
    }

    return {
      isMusicOn() { return musicOn; },
      playCrystalTap,
      prepare,
      startMusic,
      stop,
      toggleMusic,
    };
  }

  return { PENTATONIC, createSoundController };
}));
