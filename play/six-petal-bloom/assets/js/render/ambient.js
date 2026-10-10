// 落雪：雪片自顶部斜斜飘落，大小分层出景深，最大的几片是缓缓旋转的六角雪花。
// 首页不启用；择器与凝花是「在雪中制瓷」的氛围，成章页雪势更足。
(function attachAmbient(root, factory) {
  const api = factory(root.LCN || {});
  root.LCN = root.LCN || {};
  Object.assign(root.LCN, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function createAmbientApi(core) {
  'use strict';

  const TWO_PI = Math.PI * 2;
  const DEFAULT_COUNT = 34;
  // 成章页雪势更足：密度约 1.85 倍、亮度 1.5 倍（契约区间 1.7–2.2 / 1.45–2.1）。
  const RESULT_COUNT = 63;
  const RESULT_ALPHA_SCALE = 1.5;

  function createAmbientDrift(canvas, options) {
    const settings = options || {};
    const seed = settings.seed || 'ambient';
    const random = core.mulberry32(core.seedFromParts(seed, 'drift'));
    const context = canvas.getContext('2d');
    const spriteCache = new Map();
    const canvasDocument = canvas.ownerDocument || (typeof document !== 'undefined' ? document : null);

    function spriteFor(color, shape) {
      if (!canvasDocument) return null;
      const key = `${shape}:${color}`;
      if (spriteCache.has(key)) return spriteCache.get(key);
      const sprite = canvasDocument.createElement('canvas');
      sprite.width = 48;
      sprite.height = 48;
      const spriteContext = sprite.getContext('2d');
      if (shape === 'hex') {
        // 六角雪片：实心六边形薄片 + 一圈柔光，呼应「六出」。
        const halo = spriteContext.createRadialGradient(24, 24, 4, 24, 24, 24);
        halo.addColorStop(0, core.rgba(color, 0.55));
        halo.addColorStop(1, core.rgba(color, 0));
        spriteContext.fillStyle = halo;
        spriteContext.fillRect(0, 0, 48, 48);
        spriteContext.beginPath();
        for (let side = 0; side < 6; side += 1) {
          const angle = (side / 6) * TWO_PI;
          const x = 24 + Math.cos(angle) * 13;
          const y = 24 + Math.sin(angle) * 13;
          if (side === 0) spriteContext.moveTo(x, y);
          else spriteContext.lineTo(x, y);
        }
        spriteContext.closePath();
        spriteContext.fillStyle = core.rgba(color, 0.9);
        spriteContext.fill();
      } else {
        // 柔光雪点：核实心、缘化开，比纯光斑更像雪。
        const glow = spriteContext.createRadialGradient(24, 24, 0, 24, 24, 24);
        glow.addColorStop(0, core.rgba(color, 1));
        glow.addColorStop(0.35, core.rgba(color, 0.9));
        glow.addColorStop(1, core.rgba(color, 0));
        spriteContext.fillStyle = glow;
        spriteContext.fillRect(0, 0, 48, 48);
      }
      spriteCache.set(key, sprite);
      return sprite;
    }

    function makeMote(sourceRandom) {
      // 两成是近景大片：画成六角雪花、更大更快、缓缓自转。
      const isFlake = sourceRandom() < 0.2;
      return {
        x: sourceRandom(),
        y: sourceRandom(),
        // 下落速度（每秒占屏高的比例）：近景快、远景慢，落差即景深。
        fall: isFlake ? 0.034 + sourceRandom() * 0.024 : 0.018 + sourceRandom() * 0.020,
        // 风：整体向右侧斜落。
        wind: 0.004 + sourceRandom() * 0.008,
        swayAmp: 0.006 + sourceRandom() * 0.014,
        swaySpeed: 0.14 + sourceRandom() * 0.30,
        swayPhase: sourceRandom() * TWO_PI,
        pulseSpeed: 0.18 + sourceRandom() * 0.35,
        pulsePhase: sourceRandom() * TWO_PI,
        shape: isFlake ? 'hex' : 'glow',
        spin: (sourceRandom() - 0.5) * 0.9,
        rotation: sourceRandom() * TWO_PI,
        radius: isFlake ? 2.4 + sourceRandom() * 1.5 : 1.0 + sourceRandom() * 1.6,
        color: sourceRandom() < 0.6 ? '#F4FFFC' : '#B9DCE8',
        baseAlpha: isFlake ? 0.26 + sourceRandom() * 0.22 : 0.14 + sourceRandom() * 0.16,
      };
    }

    // 常规 18 枚保持原种子序列；结果页额外粒子走独立种子，不扰动原粒子的运动。
    const motes = [];
    for (let index = 0; index < DEFAULT_COUNT; index += 1) {
      motes.push(makeMote(random));
    }
    const resultRandom = core.mulberry32(core.seedFromParts(seed, 'result-drift'));
    for (let index = DEFAULT_COUNT; index < RESULT_COUNT; index += 1) {
      motes.push(makeMote(resultRandom));
    }

    let running = false;
    let frame = 0;
    let lastTime = 0;
    let lastPaintAt = 0;
    let pixelRatio = 1;
    let profile = 'default';

    function resize() {
      // 模糊光点无需与器物同等像素密度；1.5× 可显著降低全屏清画成本。
      const ratio = Math.min(1.5, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      pixelRatio = ratio;
      return ratio;
    }

    function tick(now) {
      if (!running) return;
      if (lastPaintAt && now - lastPaintAt < 32) {
        frame = window.requestAnimationFrame(tick);
        return;
      }
      const delta = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0;
      lastTime = now;
      lastPaintAt = now;
      const seconds = now / 1000;

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.globalCompositeOperation = 'source-over';
      const visibleCount = profile === 'result' ? RESULT_COUNT : DEFAULT_COUNT;
      const alphaScale = profile === 'result' ? RESULT_ALPHA_SCALE : 1;
      for (let index = 0; index < visibleCount; index += 1) {
        const mote = motes[index];
        mote.y += mote.fall * delta;
        mote.x += mote.wind * delta;
        mote.rotation += mote.spin * delta;
        if (mote.y > 1.05) {
          mote.y = -0.05 - random() * 0.08;
          mote.x = random();
        }
        if (mote.x > 1.06) mote.x = -0.06;
        const x = (mote.x + Math.sin(seconds * mote.swaySpeed * TWO_PI + mote.swayPhase) * mote.swayAmp)
          * canvas.width;
        const y = mote.y * canvas.height;
        const pulse = 0.5 + 0.5 * Math.sin(seconds * mote.pulseSpeed * TWO_PI + mote.pulsePhase);
        const alpha = Math.min(1, mote.baseAlpha * (0.66 + 0.34 * pulse) * alphaScale);
        const radius = mote.radius * pixelRatio * (0.90 + 0.20 * pulse);
        const sprite = spriteFor(mote.color, mote.shape);
        const span = mote.shape === 'hex' ? radius * 4 : radius * 6;
        if (sprite && typeof context.drawImage === 'function') {
          context.globalAlpha = alpha;
          if (mote.shape === 'hex') {
            // 六角片带自转：像真雪片在风里翻转。
            context.save();
            context.translate(x, y);
            context.rotate(mote.rotation);
            context.drawImage(sprite, -span / 2, -span / 2, span, span);
            context.restore();
          } else {
            context.drawImage(sprite, x - span / 2, y - span / 2, span, span);
          }
        } else {
          const glow = context.createRadialGradient(x, y, 0, x, y, radius * 3);
          glow.addColorStop(0, core.rgba(mote.color, alpha));
          glow.addColorStop(1, core.rgba(mote.color, 0));
          context.fillStyle = glow;
          context.fillRect(x - radius * 3, y - radius * 3, radius * 6, radius * 6);
        }
      }
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
      frame = window.requestAnimationFrame(tick);
    }

    return {
      setProfile(nextProfile) {
        profile = nextProfile === 'result' ? 'result' : 'default';
      },
      resize,
      start() {
        if (running) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        resize();
        running = true;
        lastTime = 0;
        lastPaintAt = 0;
        frame = window.requestAnimationFrame(tick);
      },
      pause() {
        running = false;
        window.cancelAnimationFrame(frame);
      },
      stop() {
        running = false;
        window.cancelAnimationFrame(frame);
        context.clearRect(0, 0, canvas.width, canvas.height);
      },
    };
  }

  return { createAmbientDrift };
}));
