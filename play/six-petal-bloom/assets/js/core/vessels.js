// 四款可选器物：均为宋式器形取意的原创建模，不是任何一件文物的复刻。
(function attachVessels(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LCN = root.LCN || {};
  Object.assign(root.LCN, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function createVesselApi() {
  'use strict';

  // profile 点位为 [半径, 高度]，单位以口沿半径 1.0 为基准。
  // inner 自器心向口沿，outer 自圈足底心向口沿（含足圈起伏）。
  const VESSELS = Object.freeze([
    Object.freeze({
      id: 'huakou',
      name: '六瓣花口洗',
      formalName: '青白釉六瓣花口洗',
      era: '取意 宋代景德镇青白釉 · 官窑葵花式洗',
      glaze: 'qingbai',
      note: '浅腹阔口，六瓣花式器口与六出雪晶同构。',
      rimBand: null,
      lobes: Object.freeze({ count: 6, amp: 0.070, wave: 0.016, start: 0.58 }),
      proportion: 0.44,
      inner: Object.freeze([[0, 0.075], [0.34, 0.090], [0.60, 0.135], [0.80, 0.225], [0.92, 0.345], [1.0, 0.50]]),
      outer: Object.freeze([[0, 0.046], [0.30, 0.039], [0.42, 0.028], [0.465, 0.0], [0.50, 0.031], [0.64, 0.088], [0.84, 0.196], [0.96, 0.330], [1.035, 0.50]]),
    }),
    Object.freeze({
      id: 'douli',
      name: '斗笠盏',
      formalName: '甜白釉斗笠盏',
      era: '取意 宋代斗笠盏式 · 明代甜白釉色',
      glaze: 'tianbai',
      note: '斜直壁自小足向外张开，釉水在壁上流成薄厚。',
      rimBand: '#7C5334',
      lobes: Object.freeze({ count: 6, amp: 0.012, wave: 0.004, start: 0.74 }),
      proportion: 0.70,
      inner: Object.freeze([[0, 0.082], [0.22, 0.104], [0.50, 0.246], [0.76, 0.442], [0.92, 0.578], [1.0, 0.66]]),
      outer: Object.freeze([[0, 0.052], [0.16, 0.047], [0.245, 0.031], [0.275, 0.0], [0.305, 0.036], [0.55, 0.222], [0.80, 0.424], [0.95, 0.562], [1.03, 0.66]]),
    }),
    Object.freeze({
      id: 'yuanfu',
      name: '圆腹碗',
      formalName: '月白釉圆腹碗',
      era: '取意 宋代弧腹碗式 · 钧窑月白釉色',
      glaze: 'yuebai',
      note: '弧腹内收，口沿薄处透出胎色，成一线酱口。',
      rimBand: '#8A5B33',
      lobes: Object.freeze({ count: 6, amp: 0.009, wave: 0.004, start: 0.80 }),
      proportion: 0.64,
      inner: Object.freeze([[0, 0.092], [0.34, 0.112], [0.62, 0.202], [0.84, 0.358], [0.95, 0.518], [0.97, 0.62]]),
      outer: Object.freeze([[0, 0.056], [0.26, 0.051], [0.36, 0.036], [0.40, 0.0], [0.44, 0.041], [0.68, 0.158], [0.90, 0.332], [1.0, 0.508], [1.005, 0.62]]),
    }),
    Object.freeze({
      id: 'zhifu',
      name: '直腹盏',
      formalName: '卵白釉直腹盏',
      era: '取意 宋代直壁盏式 · 元代卵白釉色',
      glaze: 'luanbai',
      note: '直壁平底，釉面开片最密，结晶多聚于盏心。',
      rimBand: '#7E5231',
      lobes: Object.freeze({ count: 6, amp: 0.007, wave: 0.003, start: 0.82 }),
      proportion: 0.62,
      inner: Object.freeze([[0, 0.082], [0.40, 0.094], [0.68, 0.134], [0.84, 0.262], [0.88, 0.442], [0.90, 0.60]]),
      outer: Object.freeze([[0, 0.052], [0.30, 0.046], [0.42, 0.031], [0.462, 0.0], [0.50, 0.036], [0.74, 0.102], [0.92, 0.252], [0.955, 0.442], [0.96, 0.60]]),
    }),
  ]);

  const DEFAULT_VESSEL_ID = VESSELS[0].id;

  function getVessel(vesselId) {
    return VESSELS.find((item) => item.id === vesselId) || VESSELS[0];
  }

  function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

  // 将控制点重采样为等分的平滑曲线，并附带按弧长归一化的 s（0 器心 → 1 口沿）。
  function samplePath(points, steps) {
    const source = points.map((point) => ({ r: point[0], y: point[1] }));
    const padded = [source[0], ...source, source[source.length - 1]];
    const total = Math.max(2, steps || 48);
    const sampled = [];
    for (let index = 0; index < total; index += 1) {
      const u = (index / (total - 1)) * (source.length - 1);
      const segment = Math.min(source.length - 2, Math.floor(u));
      const local = u - segment;
      sampled.push({
        r: catmullRom(padded[segment].r, padded[segment + 1].r, padded[segment + 2].r, padded[segment + 3].r, local),
        y: catmullRom(padded[segment].y, padded[segment + 1].y, padded[segment + 2].y, padded[segment + 3].y, local),
      });
    }
    let length = 0;
    sampled[0].s = 0;
    for (let index = 1; index < sampled.length; index += 1) {
      length += Math.hypot(sampled[index].r - sampled[index - 1].r, sampled[index].y - sampled[index - 1].y);
      sampled[index].s = length;
    }
    sampled.forEach((point) => { point.s = length > 0 ? point.s / length : 0; });
    return sampled;
  }

  // 器口的六瓣起伏：越接近口沿越明显，器心保持平整以便映射纹样。
  function lobeFactor(vessel, s) {
    const start = vessel.lobes.start;
    if (s <= start) return 0;
    const t = (s - start) / (1 - start);
    return t * t * (3 - 2 * t);
  }

  return { DEFAULT_VESSEL_ID, VESSELS, getVessel, lobeFactor, samplePath };
}));
