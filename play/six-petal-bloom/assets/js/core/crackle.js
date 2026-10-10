// 冰裂片生成：以 Voronoi 剖分把釉面切成大小相间的「冰片」，
// 每片带独立的明度与折光边，叠出参考器物上那种细碎冰裂的片状层次。
// 冰裂是器物自身的材质，恒定静止，不参与结晶生长动画。
(function attachCrackle(root, factory) {
  const dependencies = typeof module === 'object' && module.exports ? require('./prng.js') : root.LCN;
  const api = factory(dependencies);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LCN = root.LCN || {};
  Object.assign(root.LCN, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function createCrackleApi(prngApi) {
  'use strict';

  const { mulberry32, seedFromParts } = prngApi;
  const TWO_PI = Math.PI * 2;

  const ICE_FIELD_STYLES = Object.freeze([
    Object.freeze({ id: 'drift', fine: [0.86, 1.08], coarse: [0.90, 1.16], radial: [0.47, 0.58], stretch: [1.02, 1.16], twist: [-0.18, 0.18], lobes: 2, lobeWarp: [0.01, 0.06], cluster: [0.02, 0.09], prism: [0.18, 0.42] }),
    Object.freeze({ id: 'current', fine: [0.82, 1.08], coarse: [0.82, 1.10], radial: [0.44, 0.58], stretch: [1.36, 1.68], twist: [0.22, 0.62], lobes: 2, lobeWarp: [0.03, 0.09], cluster: [0.04, 0.12], prism: [0.35, 0.65] }),
    Object.freeze({ id: 'bloom', fine: [1.05, 1.30], coarse: [0.98, 1.22], radial: [0.64, 0.82], stretch: [1.00, 1.14], twist: [0.55, 1.05], lobes: 6, lobeWarp: [0.09, 0.17], cluster: [0.08, 0.18], prism: [0.28, 0.55] }),
    Object.freeze({ id: 'plates', fine: [0.64, 0.84], coarse: [1.18, 1.48], radial: [0.40, 0.52], stretch: [1.08, 1.34], twist: [-0.25, 0.25], lobes: 3, lobeWarp: [0.03, 0.10], cluster: [0.00, 0.08], prism: [0.42, 0.78] }),
    Object.freeze({ id: 'rift', fine: [0.76, 1.00], coarse: [0.90, 1.20], radial: [0.50, 0.66], stretch: [1.48, 1.85], twist: [-0.40, 0.40], lobes: 1, lobeWarp: [0.00, 0.04], cluster: [0.15, 0.28], prism: [0.55, 0.85] }),
  ]);

  function between(random, range) {
    return range[0] + (range[1] - range[0]) * random();
  }

  function fieldStyleFor(seed) {
    const random = mulberry32(seedFromParts(seed, 'field-style'));
    const preset = ICE_FIELD_STYLES[Math.floor(random() * ICE_FIELD_STYLES.length)];
    return {
      id: preset.id,
      fineScale: between(random, preset.fine),
      coarseScale: between(random, preset.coarse),
      radialPower: between(random, preset.radial),
      stretch: between(random, preset.stretch),
      orientation: random() * TWO_PI,
      twist: between(random, preset.twist),
      lobeCount: preset.lobes,
      lobePhase: random() * TWO_PI,
      lobeWarp: between(random, preset.lobeWarp),
      clusterChance: between(random, preset.cluster),
      clusterStrength: 0.18 + random() * 0.22,
      focusAngle: random() * TWO_PI,
      focusRadius: 0.16 + random() * 0.42,
      prismScale: between(random, preset.prism),
      toneScale: 0.88 + random() * 0.18,
      edgeScale: 0.88 + random() * 0.24,
    };
  }

  // 圆内近似均匀撒点（sqrt 半径分布 + 少量抖动），作为 Voronoi 种子。
  function scatterSites(random, count, radius, style, layer) {
    const sites = [];
    const cosOrientation = Math.cos(style.orientation);
    const sinOrientation = Math.sin(style.orientation);
    const stretch = Math.sqrt(style.stretch);
    const layerDrift = layer === 'fine' ? 1 : 0.88;
    for (let index = 0; index < count; index += 1) {
      let angle = random() * TWO_PI;
      let r = Math.pow(random(), style.radialPower) * radius * 0.995;
      const unitRadius = r / radius;
      r *= 1 + Math.sin(angle * style.lobeCount + style.lobePhase) * style.lobeWarp * layerDrift * (0.35 + unitRadius * 0.65);
      angle += style.twist * Math.pow(unitRadius, 1.4);
      let x = Math.cos(angle) * r;
      let y = Math.sin(angle) * r;

      const along = (x * cosOrientation + y * sinOrientation) * stretch;
      const across = (-x * sinOrientation + y * cosOrientation) / stretch;
      x = along * cosOrientation - across * sinOrientation;
      y = along * sinOrientation + across * cosOrientation;

      if (random() < style.clusterChance) {
        const opposite = random() < 0.5 ? 0 : Math.PI;
        const focusAngle = style.focusAngle + opposite;
        const focusX = Math.cos(focusAngle) * style.focusRadius * radius;
        const focusY = Math.sin(focusAngle) * style.focusRadius * radius;
        const amount = style.clusterStrength * (0.55 + random() * 0.45);
        x = x * (1 - amount) + focusX * amount + (random() - 0.5) * radius * 0.05;
        y = y * (1 - amount) + focusY * amount + (random() - 0.5) * radius * 0.05;
      }

      const distance = Math.hypot(x, y);
      if (distance > radius * 0.995) {
        x *= (radius * 0.995) / distance;
        y *= (radius * 0.995) / distance;
      }
      sites.push({ x, y });
    }
    return sites;
  }
  // 以半平面裁剪求一个 site 的 Voronoi 胞：初始为外接方形，
  // 依次用「到邻居的中垂线」裁掉靠近邻居的一侧。
  function clipHalfPlane(polygon, midX, midY, normalX, normalY) {
    const output = [];
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index];
      const b = polygon[(index + 1) % polygon.length];
      const da = (a.x - midX) * normalX + (a.y - midY) * normalY;
      const db = (b.x - midX) * normalX + (b.y - midY) * normalY;
      if (da <= 0) output.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t = da / (da - db);
        output.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    return output;
  }

  // 网格加速的近邻查找：每个 site 只需与最近的二十来个邻居裁剪。
  function neighborFinder(sites, radius) {
    const gridSize = Math.max(1, Math.ceil(Math.sqrt(sites.length)));
    const cell = (radius * 2.4) / gridSize;
    const buckets = new Map();
    const keyOf = (x, y) => `${Math.floor((x + radius * 1.2) / cell)}|${Math.floor((y + radius * 1.2) / cell)}`;
    sites.forEach((site, index) => {
      const key = keyOf(site.x, site.y);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(index);
    });
    return function nearest(index, limit) {
      const site = sites[index];
      const cx = Math.floor((site.x + radius * 1.2) / cell);
      const cy = Math.floor((site.y + radius * 1.2) / cell);
      const found = [];
      for (let ring = 1; found.length < limit + 4 && ring <= gridSize; ring += 1) {
        found.length = 0;
        for (let gx = cx - ring; gx <= cx + ring; gx += 1) {
          for (let gy = cy - ring; gy <= cy + ring; gy += 1) {
            const bucket = buckets.get(`${gx}|${gy}`);
            if (!bucket) continue;
            for (let item = 0; item < bucket.length; item += 1) {
              if (bucket[item] !== index) found.push(bucket[item]);
            }
          }
        }
      }
      return found
        .map((other) => ({ other, distance: Math.hypot(sites[other].x - site.x, sites[other].y - site.y) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit)
        .map((item) => sites[item.other]);
    };
  }

  function buildCells(sites, radius, random, layer, style) {
    const nearest = neighborFinder(sites, radius);
    const bound = radius * 1.25;
    const cells = [];
    for (let index = 0; index < sites.length; index += 1) {
      const site = sites[index];
      let polygon = [
        { x: -bound, y: -bound }, { x: bound, y: -bound },
        { x: bound, y: bound }, { x: -bound, y: bound },
      ];
      const neighbors = nearest(index, 20);
      for (let item = 0; item < neighbors.length && polygon.length >= 3; item += 1) {
        const other = neighbors[item];
        polygon = clipHalfPlane(
          polygon,
          (site.x + other.x) / 2,
          (site.y + other.y) / 2,
          other.x - site.x,
          other.y - site.y,
        );
      }
      if (polygon.length < 3) continue;
      const toneLimit = layer === 'fine' ? 0.11 : 0.07;
      const rawTone = (random() - 0.48) * toneLimit * style.toneScale;
      cells.push({
        layer,
        polygon,
        centroid: { x: site.x, y: site.y },
        tone: Math.max(-0.12, Math.min(0.12, rawTone)),
        edge: (layer === 'fine' ? 0.10 + random() * 0.16 : 0.05 + random() * 0.08) * style.edgeScale,
        tintWeight: 0.66 + random() * 0.78,
        tintMix: random(),
        prism: Math.min(1, 0.06 + random() * 0.72 + style.prismScale * 0.20),
        grainAngle: style.orientation + (random() - 0.5) * Math.PI * 1.4,
      });
    }
    return cells;
  }
  /**
   * 生成一张冰裂片场。
   * options: { seed, radius, fineCount, coarseCount }
   * 返回 { chips, radius, seed }；chips 按先粗后细排序，直接依序绘制即可。
   */
  function createIceField(options) {
    const settings = options || {};
    const radius = settings.radius || 1;
    const seed = String(settings.seed || 'ice');
    const style = settings.style || fieldStyleFor(seed);
    const random = mulberry32(seedFromParts(seed, 'field', style.id));
    const coarseCount = Math.max(28, Math.round(Math.max(24, settings.coarseCount || 80) * style.coarseScale));
    const fineCount = Math.max(220, Math.round(Math.max(120, settings.fineCount || 560) * style.fineScale));
    const coarse = buildCells(scatterSites(random, coarseCount, radius, style, 'coarse'), radius, random, 'coarse', style);
    const fine = buildCells(scatterSites(random, fineCount, radius, style, 'fine'), radius, random, 'fine', style);
    return { chips: coarse.concat(fine), radius, seed, style };
  }
  /** session 与渲染层共用的片场构造：同种子同器物必得同一张片场。 */
  function iceFieldFor(sessionSeed, vessel) {
    return createIceField({
      seed: seedFromParts(sessionSeed, vessel.id, 'ice'),
      fineCount: 300 + Math.round((vessel.proportion || 0.5) * 160),
      coarseCount: 70 + Math.round((vessel.proportion || 0.5) * 40),
    });
  }

  return { ICE_FIELD_STYLES, createIceField, fieldStyleFor, iceFieldFor };
}));
