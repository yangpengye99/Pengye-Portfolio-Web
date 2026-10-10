// 首屏结晶场：黑底之上，冰片自随机源点按波前浮现、停留、再依来时的顺序渐隐。
// 与凝花环节同一套冰片语言（Voronoi 片 + 波前揭示），只是循环往复、自生自灭。
(function attachEntryField(root, factory) {
  const api = factory(root.LCN || {});
  root.LCN = root.LCN || {};
  Object.assign(root.LCN, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function createEntryFieldApi(core) {
  'use strict';

  const TWO_PI = Math.PI * 2;
  const WAVE_LIFE_MS = 7200;   // 一波从浮现到隐尽的寿命
  const WAVE_EVERY_MS = 2600;  // 起新波的间隔
  const INITIAL_WAVE_AGE_MS = 3000; // 首屏直接从已展开的波段起步，避免长时间空场
  const MAX_WAVES = 3;

  function createEntryField(canvas, options) {
    const settings = options || {};
    const seed = settings.seed || 'entry-field';
    const random = core.mulberry32(core.seedFromParts(seed, 'field'));
    const context = canvas.getContext('2d');
    // 片场只生成一次：中央单位圆，片径与凝花环节相仿。
    const field = core.createIceField({
      seed: core.seedFromParts(seed, 'ice'),
      fineCount: 250,
      coarseCount: 56,
    });
    let running = false;
    let frame = 0;
    let startedAt = 0;
    let lastWaveAt = -WAVE_EVERY_MS;
    let waveIndex = 0;
    let waves = [];
    let reduced = false;

    function resize() {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
    }

    // 起一波：随机源点，取离它最近的一批片，birth 按距离归一。
    function spawnWave(now, initialAge) {
      const angle = random() * TWO_PI;
      const distance = Math.sqrt(random()) * 0.80;
      // 波源整体压向画面中下部，题字所在的左上留给黑场。
      const source = { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance * 0.66 + 0.20 };
      const color = core.pickSnowColor(seed, waveIndex % 6, 6);
      const ranked = field.chips
        .map((chip, index) => ({
          index,
          distance: Math.hypot(chip.centroid.x - source.x, chip.centroid.y - source.y),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 44 + Math.floor(random() * 26));
      const minDistance = ranked[0].distance;
      const maxDistance = Math.max(minDistance + 0.05, ranked[ranked.length - 1].distance);
      waves.push({
        bornAt: now - (initialAge || 0),
        color,
        source,
        chips: ranked.map((item) => ({
          index: item.index,
          birth: (item.distance - minDistance) / (maxDistance - minDistance),
        })),
      });
      waveIndex += 1;
      if (waves.length > MAX_WAVES) waves.shift();
    }

    // 黑底上的单片：片身沿「离波源的方向」渐变——近源一侧亮、远源一侧隐，
    // 每块因此各有明暗走向，而不是一块平色。
    function paintEntryChip(chip, tipColor, strength, size, offsetX, offsetY, source) {
      if (strength <= 0.004) return;
      const half = size / 2;
      context.beginPath();
      chip.polygon.forEach((point, index) => {
        const x = offsetX + half + point.x * half;
        const y = offsetY + half + point.y * half;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();

      const base = (0.13 + Math.max(0, chip.tone) * 1.1) * strength;
      const dirX = chip.centroid.x - source.x;
      const dirY = chip.centroid.y - source.y;
      const length = Math.hypot(dirX, dirY) || 1;
      const unitX = dirX / length;
      const unitY = dirY / length;
      // 片在该方向上的跨度，决定渐变的两端。
      let near = Infinity;
      let far = -Infinity;
      for (let index = 0; index < chip.polygon.length; index += 1) {
        const projection = chip.polygon[index].x * unitX + chip.polygon[index].y * unitY;
        if (projection < near) near = projection;
        if (projection > far) far = projection;
      }
      const gradient = context.createLinearGradient(
        offsetX + half + unitX * near * half, offsetY + half + unitY * near * half,
        offsetX + half + unitX * far * half, offsetY + half + unitY * far * half,
      );
      gradient.addColorStop(0, core.rgba(tipColor, base * 1.45));
      gradient.addColorStop(0.5, core.rgba(tipColor, base * 0.80));
      gradient.addColorStop(1, core.rgba(tipColor, base * 0.18));
      context.fillStyle = gradient;
      context.fill();
      context.fillStyle = core.rgba('#FFFFFF', 0.028 * strength);
      context.fill();
      context.strokeStyle = core.rgba('#FFFFFF', Math.min(0.55, chip.edge * 1.7) * strength);
      context.lineWidth = chip.layer === 'fine' ? 1 : 1.5;
      context.stroke();
    }

    // 一片在一波中的显现包络：按 birth 波前浮现，停留，再按同序渐隐。
    function envelope(progress, birth) {
      const appearAt = 0.02 + birth * 0.30;
      const fadeAt = 0.58 + birth * 0.26;
      const rise = core.localProgress(progress, appearAt, 0.16);
      const fall = core.localProgress(progress, fadeAt, 0.16);
      // 波缘淡化：外缘片的峰值只有中心片的三成，团块边缘自然融进黑底。
      const rim = 1 - 0.7 * birth * birth;
      return rise * (1 - fall) * rim;
    }

    function tick(now) {
      if (!running) return;
      resize();
      if (!reduced && now - lastWaveAt > WAVE_EVERY_MS) {
        lastWaveAt = now;
        spawnWave(now, waveIndex === 0 ? INITIAL_WAVE_AGE_MS : 0);
      }

      // 片场铺满全屏：直径盖过屏幕对角线，波可以在任何角落生灭。
      const size = Math.hypot(canvas.width, canvas.height) * 1.02;
      const offsetX = (canvas.width - size) / 2;
      const offsetY = (canvas.height - size) / 2;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.lineJoin = 'round';

      waves = waves.filter((wave) => now - wave.bornAt < WAVE_LIFE_MS);
      waves.forEach((wave) => {
        const progress = (now - wave.bornAt) / WAVE_LIFE_MS;
        // 波源的一汪色光：随波起落，垫在片下，让黑场里有冰蓝的光感。
        const glowIn = core.localProgress(progress, 0.02, 0.22);
        const glowOut = core.localProgress(progress, 0.62, 0.30);
        const glowA = glowIn * (1 - glowOut);
        if (glowA > 0.01 && wave.chips.length) {
          const first = field.chips[wave.chips[0].index];
          const gx = offsetX + size / 2 + first.centroid.x * size / 2;
          const gy = offsetY + size / 2 + first.centroid.y * size / 2;
          const glow = context.createRadialGradient(gx, gy, 0, gx, gy, size * 0.30);
          glow.addColorStop(0, core.rgba(wave.color.tip, 0.10 * glowA));
          glow.addColorStop(1, core.rgba(wave.color.tip, 0));
          context.fillStyle = glow;
          context.fillRect(gx - size * 0.30, gy - size * 0.30, size * 0.60, size * 0.60);
        }
        for (let item = 0; item < wave.chips.length; item += 1) {
          const entry = wave.chips[item];
          const chip = field.chips[entry.index];
          if (!chip) continue;
          paintEntryChip(chip, wave.color.tip, envelope(progress, entry.birth), size, offsetX, offsetY, wave.source);
        }
      });

      frame = window.requestAnimationFrame(tick);
    }

    return {
      start() {
        if (running) return;
        running = true;
        reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        resize();
        startedAt = performance.now();
        lastWaveAt = -WAVE_EVERY_MS;
        if (reduced) {
          // 减弱动效时呈现一波的静态终态，不做逐帧循环。
          spawnWave(performance.now());
          const size = Math.hypot(canvas.width, canvas.height) * 1.02;
          const offsetX = (canvas.width - size) / 2;
          const offsetY = (canvas.height - size) / 2;
          context.clearRect(0, 0, canvas.width, canvas.height);
          const wave = waves[waves.length - 1];
          wave.chips.forEach((entry) => {
            const chip = field.chips[entry.index];
            if (chip) paintEntryChip(chip, wave.color.tip, 1 - 0.7 * entry.birth * entry.birth, size, offsetX, offsetY, wave.source);
          });
          return;
        }
        // 首帧同步落下，避免冷启动时浏览器延迟首次 rAF，造成短暂空场。
        tick(performance.now());
      },
      stop() {
        running = false;
        window.cancelAnimationFrame(frame);
      },
      reset() {
        waves = [];
        waveIndex = 0;
        lastWaveAt = -WAVE_EVERY_MS;
      },
    };
  }

  return { createEntryField };
}));
