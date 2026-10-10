// 邻近色结晶色谱：每件作品从完整色轮取一个主色，再只在其附近渐进延展。
(function attachPalette(root, factory) {
  const dependencies = typeof module === 'object' && module.exports ? require('./prng.js') : root.LCN;
  const api = factory(dependencies);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LCN = root.LCN || {};
  Object.assign(root.LCN, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function createPaletteApi(prngApi) {
  'use strict';

  const { mulberry32, seedFromParts } = prngApi;

  // 十二个命名锚点覆盖完整色轮；core 为淡色晶心，tip 为主色枝梢。
  const SNOW_COLORS = Object.freeze([
    Object.freeze({ id: 'dan', name: '丹色', hue: 0, core: '#F9E9E8', tip: '#C84C52' }),
    Object.freeze({ id: 'zhushi', name: '朱柿', hue: 20, core: '#FAECE4', tip: '#D96F47' }),
    Object.freeze({ id: 'xinghuang', name: '杏黄', hue: 42, core: '#FAF0D9', tip: '#D7A33D' }),
    Object.freeze({ id: 'songhua', name: '松花', hue: 64, core: '#F5F2D9', tip: '#B7AD3F' }),
    Object.freeze({ id: 'liulv', name: '柳绿', hue: 92, core: '#EEF4DF', tip: '#8EAC45' }),
    Object.freeze({ id: 'zhuqing', name: '竹青', hue: 138, core: '#E3F3E7', tip: '#49A56A' }),
    Object.freeze({ id: 'qingbi', name: '青碧', hue: 170, core: '#DDF4EF', tip: '#3BAE9B' }),
    Object.freeze({ id: 'tianqing', name: '天青', hue: 194, core: '#DFF3F6', tip: '#4BA7C2' }),
    Object.freeze({ id: 'dianqing', name: '靛青', hue: 224, core: '#E3EAF7', tip: '#526FB5' }),
    Object.freeze({ id: 'qunqing', name: '群青', hue: 250, core: '#E7E5F8', tip: '#685FC2' }),
    Object.freeze({ id: 'tengluo', name: '藤萝', hue: 282, core: '#F0E5F5', tip: '#9B62B5' }),
    Object.freeze({ id: 'yanzhi', name: '胭脂', hue: 332, core: '#F8E5EF', tip: '#C34F82' }),
  ]);

  const COLOR_MOODS = Object.freeze(SNOW_COLORS.map((color) => Object.freeze({
    id: color.id,
    name: color.name,
    hue: color.hue,
    pale: color.core,
    accent: color.tip,
  })));
  // 器物釉色：四路白釉，让结晶的色彩渐变成为唯一的颜色主角。
  const GLAZE_COLORS = Object.freeze({
    qingbai: Object.freeze({ name: '青白釉', base: '#DFEEE9', deep: '#9CC6BA', light: '#F2FAF7' }),
    tianbai: Object.freeze({ name: '甜白釉', base: '#F0EDE4', deep: '#C6BFAE', light: '#FBF9F3' }),
    yuebai: Object.freeze({ name: '月白釉', base: '#E6EDF0', deep: '#ADC1C9', light: '#F6FAFB' }),
    luanbai: Object.freeze({ name: '卵白釉', base: '#EAEBE1', deep: '#B9BCA6', light: '#F8F8F1' }),
  });

  function clampIndex(index) {
    return Math.max(0, Math.min(SNOW_COLORS.length - 1, Math.round(index)));
  }

  function normalizeHue(value) {
    return ((value % 360) + 360) % 360;
  }

  function hslToHex(hue, saturation, lightness) {
    const h = normalizeHue(hue) / 360;
    const s = Math.max(0, Math.min(100, saturation)) / 100;
    const l = Math.max(0, Math.min(100, lightness)) / 100;
    if (s === 0) {
      const channel = Math.round(l * 255).toString(16).padStart(2, '0');
      return `#${channel}${channel}${channel}`;
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channelAt = (offset) => {
      let t = h + offset;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      let value;
      if (t < 1 / 6) value = p + (q - p) * 6 * t;
      else if (t < 1 / 2) value = q;
      else if (t < 2 / 3) value = p + (q - p) * (2 / 3 - t) * 6;
      else value = p;
      return Math.round(value * 255).toString(16).padStart(2, '0');
    };
    return `#${channelAt(1 / 3)}${channelAt(0)}${channelAt(-1 / 3)}`;
  }

  function moodNearest(hue) {
    return COLOR_MOODS.reduce((best, mood) => {
      const distance = Math.min(
        Math.abs(mood.hue - hue),
        360 - Math.abs(mood.hue - hue),
      );
      return !best || distance < best.distance ? { mood, distance } : best;
    }, null).mood;
  }

  function colorMoodFor(seed) {
    const random = mulberry32(seedFromParts(seed, 'color-mood'));
    const primaryIndex = Math.floor(random() * COLOR_MOODS.length);
    const secondaryIndex = (primaryIndex + 1 + Math.floor(random() * (COLOR_MOODS.length - 1))) % COLOR_MOODS.length;
    return {
      primary: COLOR_MOODS[primaryIndex],
      secondary: COLOR_MOODS[secondaryIndex],
      phase: random(),
      strength: 0.28 + random() * 0.24,
    };
  }

  // 首击可落在完整色轮任意位置；随后沿同一方向小步移动，形成类似色渐变。
  // 总色相跨度控制在约 18–28°，避免同一件作品出现红配蓝等跨域跳色。
  function colorChordFor(seed) {
    const random = mulberry32(seedFromParts(seed, 'color-chord'));
    const startHue = random() * 360;
    const direction = random() < 0.5 ? -1 : 1;
    const arc = 18 + random() * 10;
    const wavePhase = random() * Math.PI * 2;
    const saturationStart = 58 + random() * 14;
    const saturationEnd = 54 + random() * 16;
    const lightnessStart = 51 + random() * 7;
    const lightnessEnd = 57 + random() * 7;
    return Array.from({ length: 6 }, (_, index) => {
      const progress = index / 5;
      const nearbyWobble = index === 0
        ? 0
        : Math.sin(wavePhase + index * 1.31) * 1.6 * Math.sin(Math.PI * progress);
      const hue = normalizeHue(startHue + direction * arc * progress + nearbyWobble);
      const saturation = saturationStart
        + (saturationEnd - saturationStart) * progress
        + (random() - 0.5) * 4;
      const tipLightness = lightnessStart
        + (lightnessEnd - lightnessStart) * progress
        + (random() - 0.5) * 3;
      return {
        hue,
        mood: moodNearest(hue),
        saturation,
        tipLightness,
        accentHue: normalizeHue(hue + direction * 6),
      };
    });
  }

  // 单击内部由淡晶心过渡到邻近色枝梢；外层略提亮，保留白瓷上的通透感。
  function pickSnowColor(seed, clickIndex, total) {
    const steps = Math.max(1, (total || 6) - 1);
    const chord = colorChordFor(seed);
    const note = chord[Math.max(0, Math.trunc(clickIndex)) % chord.length];
    const lane = Math.min(1, Math.max(0, clickIndex / steps));
    const saturation = note.saturation * (0.98 - lane * 0.08);
    const tipLightness = note.tipLightness + lane * 7;
    const core = hslToHex(note.hue, saturation * 0.38, 91 + lane * 3);
    const tip = hslToHex(note.hue, saturation, tipLightness);
    const accent = hslToHex(note.accentHue, Math.min(88, saturation + 8), Math.max(44, tipLightness - 7));
    return {
      id: note.mood.id,
      name: note.mood.name,
      core,
      tip,
      accent,
      moodId: `analogous-${note.mood.id}`,
      moodName: note.mood.name,
    };
  }

  function colorByIndex(index) {
    return SNOW_COLORS[clampIndex(index)];
  }

  function colorIndexOf(colorId) {
    return SNOW_COLORS.findIndex((item) => item.id === colorId);
  }

  function hexToRgb(hex) {
    const value = String(hex).replace('#', '');
    const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
    const number = parseInt(full, 16);
    return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
  }

  function mixHex(fromHex, toHex, ratio) {
    const t = Math.max(0, Math.min(1, ratio));
    const from = hexToRgb(fromHex);
    const to = hexToRgb(toHex);
    const channel = (a, b) => Math.round(a + (b - a) * t);
    return `rgb(${channel(from.r, to.r)}, ${channel(from.g, to.g)}, ${channel(from.b, to.b)})`;
  }

  /** 双色混合，返回 hex，便于再交给 rgba() 调透明度。 */
  function blendHex(fromHex, toHex, ratio) {
    const t = Math.max(0, Math.min(1, ratio));
    const from = hexToRgb(fromHex);
    const to = hexToRgb(toHex);
    const channel = (a, b) => Math.round(a + (b - a) * t).toString(16).padStart(2, '0');
    return `#${channel(from.r, to.r)}${channel(from.g, to.g)}${channel(from.b, to.b)}`;
  }

  function rgba(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
  }

  return {
    COLOR_MOODS,
    GLAZE_COLORS,
    SNOW_COLORS,
    blendHex,
    colorByIndex,
    colorIndexOf,
    colorMoodFor,
    hexToRgb,
    hslToHex,
    mixHex,
    pickSnowColor,
    rgba,
  };
}));
