// 结晶纹样 v4：裂纹传播模型。
// 每次点击自落点放出六条主裂纹（六出），以带偏航噪声的随机行走向四周奔走、
// 中途分叉出次裂纹；相邻主裂纹之间围成扇形晶面，面内有放射条纹。
// birth 值记录裂纹行进的里程，绘制时按进度揭示，即成「从一点向四周蔓延」的动画。
// 结构为冰裂与结晶釉观察的程序转译，不宣称物理模拟。
(function attachCrystal(root, factory) {
  const dependencies = typeof module === 'object' && module.exports
    ? { ...require('./prng.js'), ...require('./palette.js') }
    : root.LCN;
  const api = factory(dependencies);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LCN = root.LCN || {};
  Object.assign(root.LCN, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function createCrystalApi(core) {
  'use strict';

  const { mulberry32, seedFromParts, pickSnowColor } = core;
  const TWO_PI = Math.PI * 2;
  const ARM_COUNT = 6;

  /**
   * 裂纹行走者：自 origin 沿 angle 出发，每步带持续偏航（curl）与随机抖动，
   * 直至能量耗尽。d 为累计里程（晶体半径 = 1）。
   */
  function walkCrack(random, origin, angle, energy, curl, startDistance) {
    const points = [{ x: origin.x, y: origin.y, d: startDistance }];
    let direction = angle;
    let x = origin.x;
    let y = origin.y;
    let travelled = 0;
    while (travelled < energy && points.length < 64) {
      const step = 0.032 + random() * 0.028;
      direction += curl + (random() - 0.5) * 0.30;
      x += Math.cos(direction) * step;
      y += Math.sin(direction) * step;
      travelled += step;
      points.push({ x, y, d: startDistance + travelled, direction });
    }
    return points;
  }

  /**
   * 生成一枚裂纹晶体配方。
   * options: { seed, clickIndex, total, center:{x,y}, radius, rotation, color }
   * 坐标为器面单位圆内的归一化值，radius 相对器面半径；
   * cracks/faces 内部坐标以本晶体半径为 1。
   */
  function createCrystalRecipe(options) {
    const settings = options || {};
    const clickIndex = settings.clickIndex || 0;
    const seed = seedFromParts(settings.seed || 'crystal', 'crystal', clickIndex, settings.center || {});
    const random = mulberry32(seed);
    const color = settings.color || pickSnowColor(settings.seed || 'crystal', clickIndex, settings.total || 6);
    const rotation = settings.rotation === undefined ? random() * TWO_PI : settings.rotation;

    // 六条主裂纹：方向均匀分布加抖动，长短参差。
    const primaries = [];
    for (let index = 0; index < ARM_COUNT; index += 1) {
      const angle = rotation + (index / ARM_COUNT) * TWO_PI + (random() - 0.5) * 0.42;
      const energy = 0.80 + random() * 0.24;
      const curl = (random() - 0.5) * 0.11;
      primaries.push({
        level: 0,
        weight: 0.0044 + random() * 0.0018,
        points: walkCrack(random, { x: 0, y: 0 }, angle, energy, curl, 0),
      });
    }

    // 次裂纹：从主裂纹中段分叉，能量随剩余里程衰减。
    const cracks = primaries.slice();
    primaries.forEach((primary) => {
      let branches = 3 + (random() < 0.5 ? 1 : 0);
      for (let node = 3; node < primary.points.length - 2 && branches > 0; node += 1) {
        const point = primary.points[node];
        if (point.d < 0.18 || random() > 0.30) continue;
        branches -= 1;
        const side = random() > 0.5 ? 1 : -1;
        cracks.push({
          level: 1,
          weight: 0.0026 + random() * 0.0012,
          points: walkCrack(
            random,
            { x: point.x, y: point.y },
            (point.direction || 0) + side * (0.42 + random() * 0.5),
            (1 - point.d) * (0.42 + random() * 0.3),
            (random() - 0.5) * 0.16,
            point.d,
          ),
        });
      }
    });

    // 晶面：相邻两条主裂纹的路径夹出一个扇面，外缘以两梢间的圆弧封口。
    const faces = [];
    for (let index = 0; index < primaries.length; index += 1) {
      const left = primaries[index].points;
      const right = primaries[(index + 1) % primaries.length].points;
      const leftTip = left[left.length - 1];
      const rightTip = right[right.length - 1];
      const arc = [];
      const angleFrom = Math.atan2(leftTip.y, leftTip.x);
      let angleTo = Math.atan2(rightTip.y, rightTip.x);
      while (angleTo <= angleFrom) angleTo += TWO_PI;
      if (angleTo - angleFrom < Math.PI * 1.2) {
        const radiusFrom = Math.hypot(leftTip.x, leftTip.y);
        const radiusTo = Math.hypot(rightTip.x, rightTip.y);
        for (let stepIndex = 1; stepIndex <= 4; stepIndex += 1) {
          const t = stepIndex / 5;
          const angle = angleFrom + (angleTo - angleFrom) * t;
          const arcRadius = radiusFrom + (radiusTo - radiusFrom) * t;
          arc.push({ x: Math.cos(angle) * arcRadius, y: Math.sin(angle) * arcRadius });
        }
      }
      const polygon = left.map((point) => ({ x: point.x, y: point.y }))
        .concat(arc)
        .concat(right.map((point) => ({ x: point.x, y: point.y })).reverse());

      // 面内放射条纹：自面心方向的淡细线，成参考器物里晶面的丝理。
      const midAngle = angleFrom + (angleTo - angleFrom) / 2;
      const reach = Math.min(Math.hypot(leftTip.x, leftTip.y), Math.hypot(rightTip.x, rightTip.y));
      const striations = [];
      const striationCount = 7 + Math.floor(random() * 7);
      for (let stepIndex = 0; stepIndex < striationCount; stepIndex += 1) {
        striations.push({
          angle: midAngle + (random() - 0.5) * (angleTo - angleFrom) * 0.82,
          from: 0.05 + random() * 0.12,
          to: reach * (0.45 + random() * 0.5),
          alpha: 0.25 + random() * 0.75,
          width: 0.004 + random() * 0.006,
        });
      }
      faces.push({
        polygon,
        striations,
        tone: 0.55 + random() * 0.45,
        birth: 0.16 + random() * 0.18,
      });
    }

    return {
      algorithmVersion: 4,
      kind: 'seed',
      seed,
      clickIndex,
      cx: settings.center ? settings.center.x : 0,
      cy: settings.center ? settings.center.y : 0,
      radius: settings.radius || 0.24,
      rotation,
      color,
      colorId: color.id,
      colorName: color.name,
      armCount: ARM_COUNT,
      // 裂纹揭示的总里程：绘制时 point.d / maxReach 对齐进度。
      maxReach: cracks.reduce((most, crack) => {
        const tip = crack.points[crack.points.length - 1];
        return Math.max(most, tip.d);
      }, 0.5),
      cracks,
      faces,
      coreRadius: 0.040 + random() * 0.030,
      opacity: 0.82 + random() * 0.16,
    };
  }

  /**
   * 采集既有裂纹网络的顶点（器面单位圆的世界坐标），供后续点击抽枝。
   * 每条裂纹隔点取样并必取梢点，附带该点的行进方向。
   */
  function collectCrackVertices(recipes) {
    const vertices = [];
    (recipes || []).forEach((recipe) => {
      (recipe.cracks || []).forEach((crack) => {
        crack.points.forEach((point, index) => {
          const last = index === crack.points.length - 1;
          if (index === 0 || (!last && index % 2 !== 0)) return;
          vertices.push({
            x: recipe.cx + point.x * recipe.radius,
            y: recipe.cy + point.y * recipe.radius,
            direction: point.direction || 0,
            tip: last,
          });
        });
      });
    });
    return vertices;
  }

  /**
   * 抽枝配方 v2「干 + 簇」：从网络最近顶点伸一条干，逐步朝点击处收敛、必达；
   * 到达后在点击处向四周炸开一簇细裂纹。分裂的视觉焦点因此始终在手指所点之处，
   * 而整个作品仍是一棵单心裂纹树。
   * options: { seed, clickIndex, total, center, radius, color, vertices }
   */
  function createBranchRecipe(options) {
    const settings = options || {};
    const clickIndex = settings.clickIndex || 0;
    const seed = seedFromParts(settings.seed || 'crystal', 'branch', clickIndex, settings.center || {});
    const random = mulberry32(seed);
    const color = settings.color || pickSnowColor(settings.seed || 'crystal', clickIndex, settings.total || 6);
    const place = settings.center || { x: 0, y: 0 };
    const scale = settings.radius || 0.3;
    const toLocal = (x, y) => ({ x: (x - place.x) / scale, y: (y - place.y) / scale });

    const ranked = (settings.vertices || [])
      .map((vertex) => ({
        vertex,
        score: Math.hypot(vertex.x - place.x, vertex.y - place.y) - (vertex.tip ? 0.05 : 0),
      }))
      .sort((a, b) => a.score - b.score);

    const cracks = [];
    let arrival = { x: place.x, y: place.y };
    let arrivalDistance = 0;

    // 干：每步都重新朝向点击处再加抖动——婉转但必达。
    if (ranked.length) {
      const origin = ranked[0].vertex;
      const points = [];
      let x = origin.x;
      let y = origin.y;
      let direction = Math.atan2(place.y - y, place.x - x);
      let travelled = 0;
      const localStart = toLocal(x, y);
      points.push({ x: localStart.x, y: localStart.y, d: 0, direction });
      let guard = 0;
      while (Math.hypot(x - place.x, y - place.y) > scale * 0.08 && guard < 96) {
        const step = scale * (0.030 + random() * 0.022);
        direction = Math.atan2(place.y - y, place.x - x) + (random() - 0.5) * 0.34;
        x += Math.cos(direction) * step;
        y += Math.sin(direction) * step;
        travelled += step / scale;
        const local = toLocal(x, y);
        points.push({ x: local.x, y: local.y, d: travelled, direction });
        guard += 1;
      }
      if (points.length >= 2) {
        cracks.push({ level: 0, role: 'trunk', weight: 0.0040 + random() * 0.0014, points });
        arrival = { x, y };
        arrivalDistance = travelled;
        // 干上的小侧枝。
        for (let node = 3; node < points.length - 3; node += 1) {
          if (random() > 0.14) continue;
          const point = points[node];
          const side = random() > 0.5 ? 1 : -1;
          cracks.push({
            level: 1,
            role: 'twig',
            weight: 0.0024 + random() * 0.0010,
            points: walkCrack(
              random,
              { x: point.x, y: point.y },
              (point.direction || 0) + side * (0.5 + random() * 0.5),
              0.16 + random() * 0.20,
              (random() - 0.5) * 0.18,
              point.d,
            ),
          });
        }
      }
    }

    // 簇：在点击处向四周炸开的一圈细裂纹，是这一击的视觉主角。
    const burstOrigin = toLocal(arrival.x, arrival.y);
    const burstCount = 5 + Math.floor(random() * 3);
    for (let index = 0; index < burstCount; index += 1) {
      const angle = (index / burstCount) * TWO_PI + (random() - 0.5) * 0.5;
      const burst = walkCrack(
        random,
        { x: burstOrigin.x, y: burstOrigin.y },
        angle,
        0.34 + random() * 0.36,
        (random() - 0.5) * 0.14,
        arrivalDistance,
      );
      if (burst.length < 3) continue;
      cracks.push({ level: 0, role: 'burst', weight: 0.0038 + random() * 0.0014, points: burst });
      // 簇枝上的再分叉。
      if (random() < 0.6) {
        const node = burst[2 + Math.floor(random() * Math.max(1, burst.length - 4))];
        const side = random() > 0.5 ? 1 : -1;
        cracks.push({
          level: 1,
          role: 'twig',
          weight: 0.0022 + random() * 0.0010,
          points: walkCrack(
            random,
            { x: node.x, y: node.y },
            (node.direction || 0) + side * (0.45 + random() * 0.5),
            0.14 + random() * 0.18,
            (random() - 0.5) * 0.18,
            node.d,
          ),
        });
      }
    }

    return {
      algorithmVersion: 4,
      kind: 'branch',
      seed,
      clickIndex,
      cx: place.x,
      cy: place.y,
      radius: scale,
      rotation: 0,
      color,
      colorId: color.id,
      colorName: color.name,
      armCount: ARM_COUNT,
      maxReach: cracks.reduce((most, crack) => {
        const tip = crack.points[crack.points.length - 1];
        return Math.max(most, tip.d);
      }, 0.4),
      cracks,
      faces: [],
      coreRadius: 0,
      opacity: 0.80 + random() * 0.16,
    };
  }

  function ease(progress) {
    const t = Math.max(0, Math.min(1, progress));
    return 1 - Math.pow(1 - t, 2.6);
  }

  // 元件在整体进度中的局部进度，用于逐层生长。
  function localProgress(progress, birth, span) {
    const duration = span === undefined ? 1 - birth : span;
    if (duration <= 0) return progress >= birth ? 1 : 0;
    return ease((progress - birth) / duration);
  }

  return { ARM_COUNT, collectCrackVertices, createBranchRecipe, createCrystalRecipe, ease, localProgress, walkCrack };
}));
