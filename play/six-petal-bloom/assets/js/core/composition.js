// 构图：六次点击对应六层由器心向外扩张的结晶带。
// 点击决定方向与色，系统守住半径分层、疏密与最小间距，保证成品仍留得住气眼。
(function attachComposition(root, factory) {
  const dependencies = typeof module === 'object' && module.exports ? require('./prng.js') : root.LCN;
  const api = factory(dependencies);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LCN = root.LCN || {};
  Object.assign(root.LCN, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function createCompositionApi(prngApi) {
  'use strict';

  const { mulberry32, seedFromParts } = prngApi;
  const MAX_CRYSTALS = 6;

  // 每一次点击的合法半径带与晶体尺寸；第一枚必落器心，其后逐层向四周蔓延。
  const BANDS = Object.freeze([
    Object.freeze({ minRadius: 0.00, maxRadius: 0.06, size: 0.62, label: '器心' }),
    Object.freeze({ minRadius: 0.22, maxRadius: 0.40, size: 0.50, label: '内圈' }),
    Object.freeze({ minRadius: 0.32, maxRadius: 0.54, size: 0.44, label: '内圈' }),
    Object.freeze({ minRadius: 0.42, maxRadius: 0.66, size: 0.38, label: '中圈' }),
    Object.freeze({ minRadius: 0.54, maxRadius: 0.78, size: 0.33, label: '外圈' }),
    Object.freeze({ minRadius: 0.64, maxRadius: 0.90, size: 0.28, label: '近口沿' }),
  ]);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createComposition(seed) {
    return { seed: String(seed), placements: [] };
  }

  function bandFor(index) {
    return BANDS[Math.min(BANDS.length - 1, Math.max(0, index))];
  }

  /**
   * 把一次点击映射为落点。落点即点击处（只夹在器面内），
   * 六层带只决定这一击的尺寸与色偏，不再挪动位置。
   */
  function mapTap(state, rawTap) {
    if (!state || !Array.isArray(state.placements)) throw new Error('invalid-composition');
    const index = state.placements.length;
    if (index >= MAX_CRYSTALS) throw new Error('composition-full');
    const band = bandFor(index);
    let tapX = Number(rawTap.x) || 0;
    let tapY = Number(rawTap.y) || 0;
    const tapRadius = Math.hypot(tapX, tapY);
    // 器缘外的点击拉回到器面内，方向不变。
    if (tapRadius > 0.92) {
      tapX = (tapX / tapRadius) * 0.92;
      tapY = (tapY / tapRadius) * 0.92;
    }
    const random = mulberry32(seedFromParts(state.seed, index, Math.round(tapX * 2048), Math.round(tapY * 2048)));
    const angle = (tapRadius > 0.04 ? Math.atan2(tapY, tapX) : random() * Math.PI * 2);

    const placement = {
      index,
      x: tapX,
      y: tapY,
      size: band.size * (0.90 + random() * 0.20),
      band: band.label,
      rotation: angle + (random() - 0.5) * 1.1,
      tap: { x: tapX, y: tapY },
      colorBias: clamp(Math.min(1, tapRadius), 0, 1),
    };
    return { state: { ...state, placements: state.placements.concat(placement) }, placement };
  }

  function isInsideBasin(point) {
    return Math.hypot(Number(point.x) || 0, Number(point.y) || 0) <= 1;
  }

  return { BANDS, MAX_CRYSTALS, bandFor, createComposition, isInsideBasin, mapTap };
}));
