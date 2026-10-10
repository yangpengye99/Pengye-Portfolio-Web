// 无 WebGL 时的降级渲染：以椭圆投影呈现器面，交互与坐标映射保持一致。
(function attachVessel2d(root, factory) {
  const api = factory(root.LCN || {});
  root.LCN = root.LCN || {};
  Object.assign(root.LCN, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function createVessel2dApi(core) {
  'use strict';

  const TWO_PI = Math.PI * 2;

  function createFallbackRenderer(canvas, options) {
    const settings = options || {};
    const ctx = canvas.getContext('2d');
    const view = { yaw: 0, pitch: 1.50, zoom: 1, targetY: 0, panX: 0, panY: 0 };
    const limits = { minPitch: 0.42, maxPitch: 1.54, minZoom: 0.58, maxZoom: 1.85 };
    let vessel = null;
    let textureCanvas = null;
    let reflectionStrength = settings.reflectionStrength === undefined
      ? 0.82
      : Math.max(0, Math.min(1.25, Number(settings.reflectionStrength) || 0));

    function resize() {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    }

    function geometry() {
      const width = canvas.width;
      const height = canvas.height;
      const radius = Math.min(width, height) * 0.44 / view.zoom;
      return {
        cx: width / 2 + view.panX,
        cy: height * 0.52 + view.panY,
        rx: radius,
        ry: radius * Math.max(0.30, Math.sin(view.pitch)),
      };
    }

    return {
      supported: false,
      get view() { return view; },
      get limits() { return limits; },
      get vessel() { return vessel; },
      resize,
      setShimmer() {},
      setReflectionStrength(value) {
        reflectionStrength = Math.max(0, Math.min(1.25, Number(value) || 0));
      },
      setVessel(nextVessel) { vessel = nextVessel; },
      setTexture(source) { textureCanvas = source; },
      updateTextureRegion(source) { textureCanvas = source; },
      // 降级渲染不做遮罩高光，第二个参数在这里无用但保持签名一致。
      orbit(deltaYaw, deltaPitch) {
        view.yaw += deltaYaw;
        view.pitch = Math.max(limits.minPitch, Math.min(limits.maxPitch, view.pitch + deltaPitch));
      },
      zoom(factor) {
        view.zoom = Math.max(limits.minZoom, Math.min(limits.maxZoom, view.zoom * factor));
      },
      pan(deltaXPx, deltaYPx) {
        const ratio = canvas.width / Math.max(1, canvas.clientWidth || canvas.width);
        view.panX += deltaXPx * ratio;
        view.panY += deltaYPx * ratio;
      },
      setOrientation(next) {
        view.panX = 0;
        view.panY = 0;
        if (next.pitch !== undefined) view.pitch = Math.max(limits.minPitch, Math.min(limits.maxPitch, next.pitch));
        if (next.zoom !== undefined) {
          view.zoom = Math.max(limits.minZoom, Math.min(limits.maxZoom, next.zoom));
        }
        if (next.yaw !== undefined) view.yaw = next.yaw;
      },
      render() {
        if (!textureCanvas) return;
        resize();
        const { cx, cy, rx, ry } = geometry();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 器壁：同一釉面纹理以低透明度包到外壁，再由阴影压低对比。
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, cy + ry * 0.30, rx * 1.02, ry * 1.02, 0, 0, TWO_PI);
        ctx.clip();
        ctx.fillStyle = 'rgba(24, 36, 36, 0.85)';
        ctx.fill();
        ctx.translate(cx, cy + ry * 0.30);
        ctx.rotate(view.yaw);
        ctx.scale((rx * 1.02) / (textureCanvas.width / 2), (ry * 1.02) / (textureCanvas.width / 2));
        const outerPatternAlpha = 0.44;
        ctx.globalAlpha = outerPatternAlpha;
        ctx.drawImage(textureCanvas, -textureCanvas.width / 2, -textureCanvas.height / 2);
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, TWO_PI);
        ctx.clip();
        ctx.translate(cx, cy);
        ctx.rotate(view.yaw);
        ctx.scale(rx / (textureCanvas.width / 2), ry / (textureCanvas.width / 2));
        ctx.drawImage(textureCanvas, -textureCanvas.width / 2, -textureCanvas.height / 2);
        ctx.restore();

        // 无 WebGL 时以两层克制的窗光模拟清釉反射；仍裁在器面内，随取景旋转轻微游走。
        if (reflectionStrength > 0.002) {
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, TWO_PI);
          ctx.clip();
          ctx.translate(cx, cy);
          ctx.rotate(-0.34 + view.yaw * 0.42);
          ctx.globalCompositeOperation = 'screen';

          const panel = ctx.createLinearGradient(-rx * 0.72, -ry * 0.52, rx * 0.38, ry * 0.34);
          panel.addColorStop(0, 'rgba(224, 246, 250, 0)');
          panel.addColorStop(0.34, `rgba(232, 250, 252, ${0.20 * reflectionStrength})`);
          panel.addColorStop(0.58, `rgba(255, 255, 255, ${0.08 * reflectionStrength})`);
          panel.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = panel;
          ctx.beginPath();
          ctx.ellipse(-rx * 0.18, -ry * 0.12, rx * 0.68, ry * 0.44, 0, 0, TWO_PI);
          ctx.fill();

          const streak = ctx.createLinearGradient(rx * 0.02, -ry * 0.76, rx * 0.34, ry * 0.72);
          streak.addColorStop(0, 'rgba(255, 255, 255, 0)');
          streak.addColorStop(0.46, `rgba(255, 255, 255, ${0.17 * reflectionStrength})`);
          streak.addColorStop(0.58, `rgba(235, 250, 252, ${0.08 * reflectionStrength})`);
          streak.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = streak;
          ctx.beginPath();
          ctx.ellipse(rx * 0.18, -ry * 0.02, rx * 0.13, ry * 0.72, 0, 0, TWO_PI);
          ctx.fill();
          ctx.restore();
        }

        const rim = ctx.createLinearGradient(cx - rx, cy - ry * 0.4, cx + rx, cy + ry * 0.25);
        rim.addColorStop(0, 'rgba(164, 196, 200, 0.34)');
        rim.addColorStop(0.30, 'rgba(242, 253, 255, 0.78)');
        rim.addColorStop(0.48, 'rgba(192, 222, 224, 0.42)');
        rim.addColorStop(0.76, 'rgba(255, 255, 255, 0.70)');
        rim.addColorStop(1, 'rgba(151, 184, 188, 0.30)');
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, TWO_PI);
        ctx.strokeStyle = rim;
        ctx.lineWidth = Math.max(1.2, rx * 0.010);
        ctx.stroke();
      },
      pick(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const ratio = canvas.width / Math.max(1, rect.width);
        const { cx, cy, rx, ry } = geometry();
        const x = ((clientX - rect.left) * ratio - cx) / rx;
        const y = ((clientY - rect.top) * ratio - cy) / ry;
        const angle = Math.atan2(y, x) - view.yaw;
        const distance = Math.hypot(x, y);
        if (distance > 1) return null;
        return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
      },
      snapshot() {
        return canvas.toDataURL('image/png');
      },
    };
  }

  return { createFallbackRenderer };
}));
