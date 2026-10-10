(function initParallelMailboxFx(root, factory) {
  const value = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = value;
  if (root) root.ParallelMailboxFx = value;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createParallelMailboxFx(root) {
  'use strict';

  /**
   * 纯 Canvas 2D 粒子与星场引擎。
   * 不使用 Worker / WASM / 外部资源，符合小工具容器能力清单。
   */
  function createField(canvas, options = {}) {
    const context = canvas.getContext('2d');
    const reduceMotion = Boolean(options.reduceMotion);
    let particles = [];
    let stars = [];
    let warp = 0;
    let warpTarget = 0;
    let ambientConfig = null;
    let ambientAccumulator = 0;
    let running = false;
    let frameHandle = 0;
    let ratio = 1;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      ratio = Math.min(root.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    const width = () => canvas.width / ratio;
    const height = () => canvas.height / ratio;
    const random = (min, max) => min + Math.random() * (max - min);

    function seedStars(count) {
      stars = Array.from({ length: count }, () => ({
        angle: random(0, Math.PI * 2),
        radius: random(8, Math.max(width(), height()) * 0.7),
        speed: random(0.4, 1.8),
        size: random(0.5, 1.6),
        alpha: random(0.25, 0.9),
      }));
    }

    function spawn(x, y, config, count, kind) {
      for (let index = 0; index < count; index += 1) {
        const angle = kind === 'burst' ? random(0, Math.PI * 2) : random(-Math.PI, 0);
        const speed = kind === 'burst' ? random(0.4, 1) * config.spread : random(0.08, 0.35);
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - (kind === 'burst' ? random(0, 0.5) : random(0.1, 0.5)),
          gravity: config.gravity,
          radius: random(config.size[0], config.size[1]),
          life: random(config.life[0], config.life[1]),
          age: 0,
          color: config.colors[(Math.random() * config.colors.length) | 0],
          glow: config.glow,
          star: config.star && Math.random() < 0.3,
          spin: random(-0.08, 0.08),
          rotation: random(0, Math.PI),
        });
      }
    }

    function drawStar(x, y, radius, rotation) {
      context.beginPath();
      for (let index = 0; index < 8; index += 1) {
        const angle = rotation + (index * Math.PI) / 4;
        const reach = index % 2 === 0 ? radius : radius * 0.34;
        const pointX = x + Math.cos(angle) * reach;
        const pointY = y + Math.sin(angle) * reach;
        if (index === 0) context.moveTo(pointX, pointY);
        else context.lineTo(pointX, pointY);
      }
      context.closePath();
      context.fill();
    }

    function drawStarfield() {
      if (!stars.length) return;
      const centerX = width() / 2;
      const centerY = height() / 2;
      warp += (warpTarget - warp) * 0.045;
      const maxRadius = Math.max(width(), height()) * 0.75;

      for (const star of stars) {
        star.radius += star.speed * (0.35 + warp * 6);
        if (star.radius > maxRadius) {
          star.radius = random(6, 40);
          star.angle = random(0, Math.PI * 2);
        }
        const x = centerX + Math.cos(star.angle) * star.radius;
        const y = centerY + Math.sin(star.angle) * star.radius;
        const trail = 1 + warp * 26;
        const tailX = centerX + Math.cos(star.angle) * Math.max(0, star.radius - trail);
        const tailY = centerY + Math.sin(star.angle) * Math.max(0, star.radius - trail);

        context.globalAlpha = star.alpha * (0.35 + Math.min(1, star.radius / maxRadius));
        context.strokeStyle = options.starColor || 'rgba(200,220,255,0.9)';
        context.lineWidth = star.size;
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(tailX, tailY);
        context.lineTo(x, y);
        context.stroke();
      }
      context.globalAlpha = 1;
    }

    function tick() {
      if (!running) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      drawStarfield();

      if (ambientConfig && ambientConfig.ambient > 0 && !reduceMotion) {
        ambientAccumulator += ambientConfig.ambient;
        while (ambientAccumulator >= 1) {
          ambientAccumulator -= 1;
          spawn(random(width() * 0.12, width() * 0.88), height() * random(0.55, 0.95), ambientConfig, 1, 'ambient');
        }
      }

      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.age += 1;
        if (particle.age > particle.life) {
          particles.splice(index, 1);
          continue;
        }
        particle.vy += particle.gravity;
        particle.vx *= 0.992;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.rotation += particle.spin;

        const progress = particle.age / particle.life;
        const alpha = progress < 0.12 ? progress / 0.12 : 1 - (progress - 0.12) / 0.88;

        context.globalAlpha = Math.max(0, alpha) * 0.9;
        context.fillStyle = particle.color;
        context.shadowBlur = particle.glow ? particle.radius * 4 : 0;
        context.shadowColor = particle.glow ? particle.color : 'transparent';

        if (particle.star) drawStar(particle.x, particle.y, particle.radius * 1.9, particle.rotation);
        else {
          context.beginPath();
          context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
          context.fill();
        }
      }

      context.globalAlpha = 1;
      context.shadowBlur = 0;
      frameHandle = root.requestAnimationFrame(tick);
    }

    return {
      resize,
      start() {
        if (running) return;
        running = true;
        resize();
        frameHandle = root.requestAnimationFrame(tick);
      },
      stop() {
        running = false;
        if (frameHandle) root.cancelAnimationFrame(frameHandle);
        frameHandle = 0;
      },
      clear() {
        particles = [];
        ambientAccumulator = 0;
      },
      setAmbient(config) {
        ambientConfig = config || null;
      },
      burst(x, y, config, scale = 1) {
        if (reduceMotion) return;
        spawn(x, y, config, Math.max(1, Math.round(config.burst * scale)), 'burst');
      },
      rain(config, scale = 1) {
        if (reduceMotion) return;
        const count = Math.max(1, Math.round(config.burst * scale));
        for (let index = 0; index < count; index += 1) {
          spawn(random(width() * 0.1, width() * 0.9), random(-20, height() * 0.2), config, 1, 'burst');
        }
      },
      enableStarfield(count) {
        seedStars(count);
      },
      setWarp(value) {
        warpTarget = reduceMotion ? 0 : value;
      },
      size: () => ({ width: width(), height: height() }),
    };
  }

  return Object.freeze({ createField });
});
