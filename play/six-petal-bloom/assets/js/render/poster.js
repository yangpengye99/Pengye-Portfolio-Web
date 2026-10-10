// 成章海报：1080×1440，暖黑底、器物为唯一主视觉、右侧竖排题款。
// 无分栏线、无装饰框；文字只记录本次创作的事实，不虚构收藏或年款。
(function attachPoster(root, factory) {
  const api = factory(root.LCN || {});
  root.LCN = root.LCN || {};
  Object.assign(root.LCN, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function createPosterApi(core) {
  'use strict';

  const WIDTH = 1080;
  const HEIGHT = 1440;
  const BRUSH_FONT = '"STKaiti", "KaiTi", "Kaiti SC", "TW-Kai", "BiauKai", "Noto Serif SC", "Songti SC", "SimSun", serif';
  // 参考馆藏海报的暖米白题款色。
  const INK_TITLE = '#EDE4CF';
  const INK_BODY = '#CDC2A6';
  const INK_FAINT = '#8D8471';
  const SEAL_COLOR = '#8C3B32';

  const LATIN = /[0-9A-Za-z./:·]/;

  function verticalText(ctx, text, x, y, style) {
    const size = style.size;
    const gap = style.gap === undefined ? size * 0.24 : style.gap;
    ctx.save();
    ctx.font = `${style.weight || 400} ${size}px ${style.font || BRUSH_FONT}`;
    ctx.fillStyle = style.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let cursor = y;
    Array.from(String(text)).forEach((character) => {
      if (character === ' ') {
        cursor += size * 0.5;
        return;
      }
      if (LATIN.test(character)) {
        ctx.save();
        ctx.translate(x, cursor + size * 0.32);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(character, 0, 0);
        ctx.restore();
        cursor += size * 0.68 + gap * 0.4;
        return;
      }
      ctx.fillText(character, x, cursor + size * 0.5);
      cursor += size + gap;
    });
    ctx.restore();
    return cursor;
  }

  // 暖黑底：近黑而不死黑，右上略亮供题款，四角微收。
  function paintBackground(ctx, seed) {
    const random = core.mulberry32(core.seedFromParts(seed, 'poster-bg'));
    const wash = ctx.createLinearGradient(0, 0, WIDTH * 0.3, HEIGHT);
    wash.addColorStop(0, '#100D0A');
    wash.addColorStop(0.5, '#0A0807');
    wash.addColorStop(1, '#060505');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // 细颗粒，避免大面积暗部在屏幕上出现色带。
    ctx.save();
    ctx.globalAlpha = 0.045;
    for (let index = 0; index < 2400; index += 1) {
      const x = random() * WIDTH;
      const y = random() * HEIGHT;
      ctx.fillStyle = random() > 0.5 ? '#FFFFFF' : '#000000';
      ctx.fillRect(x, y, 1.4, 1.4);
    }
    ctx.restore();

    const vignette = ctx.createRadialGradient(WIDTH * 0.42, HEIGHT * 0.56, HEIGHT * 0.14, WIDTH * 0.42, HEIGHT * 0.56, HEIGHT * 0.85);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.66)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // 器物大图：用户取景的快照放大铺入画面下部，边缘以径向遮罩融进暗底。
  function paintVessel(ctx, source, region) {
    if (!source || !source.width) return;
    const scale = Math.max(region.width / source.width, region.height / source.height) * 1.22;
    const drawWidth = source.width * scale;
    const drawHeight = source.height * scale;
    const offscreen = document.createElement('canvas');
    offscreen.width = Math.round(region.width);
    offscreen.height = Math.round(region.height);
    const offscreenCtx = offscreen.getContext('2d');
    offscreenCtx.drawImage(
      source,
      (region.width - drawWidth) / 2,
      (region.height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
    const mask = offscreenCtx.createRadialGradient(
      region.width / 2, region.height / 2, Math.min(region.width, region.height) * 0.34,
      region.width / 2, region.height / 2, Math.min(region.width, region.height) * 0.74,
    );
    mask.addColorStop(0, 'rgba(0, 0, 0, 1)');
    mask.addColorStop(1, 'rgba(0, 0, 0, 0)');
    offscreenCtx.globalCompositeOperation = 'destination-in';
    offscreenCtx.fillStyle = mask;
    offscreenCtx.fillRect(0, 0, region.width, region.height);
    ctx.drawImage(offscreen, region.x, region.y);
  }

  function paintSeal(ctx, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = SEAL_COLOR;
    ctx.globalAlpha = 0.88;
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255, 232, 226, 0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(3.5, 3.5, size - 7, size - 7);
    ctx.fillStyle = '#F6E6E1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `500 ${size * 0.40}px ${BRUSH_FONT}`;
    // 四字印读序：右上 → 右下 → 左上 → 左下。
    ctx.fillText('六', size * 0.70, size * 0.30);
    ctx.fillText('出', size * 0.70, size * 0.70);
    ctx.fillText('凝', size * 0.30, size * 0.30);
    ctx.fillText('华', size * 0.30, size * 0.70);
    ctx.restore();
  }

  function drawLayer(ctx, source, rect) {
    if (!source || !source.width || !rect || rect.width <= 0 || rect.height <= 0) return;
    ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);
  }

  function paintMeasuredText(ctx, block) {
    if (!block || !block.text || !block.rect) return;
    const style = block.style || {};
    const size = Math.max(1, Number(style.size) || 14);
    const letterSpacing = Number(style.letterSpacing) || 0;
    ctx.save();
    ctx.globalAlpha = style.opacity === undefined ? 1 : Number(style.opacity);
    if (String(style.writingMode || 'vertical-rl').startsWith('vertical')) {
      verticalText(
        ctx,
        block.text,
        block.rect.x + block.rect.width / 2,
        block.rect.y,
        {
          size,
          gap: letterSpacing,
          color: style.color || INK_BODY,
          weight: style.weight || 400,
          font: style.font || BRUSH_FONT,
        },
      );
    } else {
      ctx.font = `${style.weight || 400} ${size}px ${style.font || BRUSH_FONT}`;
      ctx.fillStyle = style.color || INK_BODY;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(block.text, block.rect.x + block.rect.width / 2, block.rect.y);
    }
    ctx.restore();
  }

  /**
   * 按当前手机视口逐层复刻成章画面。
   * options: { canvas, viewport, ambientSource/Rect, crackleSource/Rect, vesselSource/Rect,
   *            watermarkSource/Rect, textBlocks, sealRect, title, colorNames }
   */
  function renderScreenCapture(options) {
    const canvas = options.canvas;
    const viewport = options.viewport || {};
    const cssWidth = Math.max(1, Math.round(Number(viewport.width) || 1));
    const cssHeight = Math.max(1, Math.round(Number(viewport.height) || 1));
    const pixelRatio = Math.max(1, Number(viewport.pixelRatio) || 1);
    canvas.width = Math.max(1, Math.round(cssWidth * pixelRatio));
    canvas.height = Math.max(1, Math.round(cssHeight * pixelRatio));
    const ctx = canvas.getContext('2d');

    ctx.save();
    ctx.scale(pixelRatio, pixelRatio);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    drawLayer(ctx, options.ambientSource, options.ambientRect);
    drawLayer(ctx, options.crackleSource, options.crackleRect);
    drawLayer(ctx, options.vesselSource, options.vesselRect);

    if (options.watermarkSource && options.watermarkRect) {
      ctx.save();
      ctx.globalAlpha = options.watermarkOpacity === undefined ? 1 : options.watermarkOpacity;
      ctx.filter = 'brightness(0) invert(1)';
      drawLayer(ctx, options.watermarkSource, options.watermarkRect);
      ctx.restore();
    }

    (options.textBlocks || []).forEach((block) => paintMeasuredText(ctx, block));
    if (options.sealRect && options.sealRect.width > 0 && options.sealRect.height > 0) {
      paintSeal(
        ctx,
        options.sealRect.x,
        options.sealRect.y,
        Math.min(options.sealRect.width, options.sealRect.height),
      );
    }
    ctx.restore();

    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
      title: options.title && (options.title.full || options.title.display) || '',
      colorNames: options.colorNames || [],
    };
  }

  /**
   * 绘制成品海报。
   * options: { canvas, session, vessel, vesselSource, moment, title }
   */
  function renderPoster(options) {
    const canvas = options.canvas;
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    const session = options.session;
    const vessel = options.vessel;
    const colorNames = session.recipes.map((recipe) => recipe.colorName);
    const uniqueColors = colorNames.filter((name, index) => colorNames.indexOf(name) === index);
    const title = options.title;
    const moment = options.moment;

    paintBackground(ctx, session.sessionSeed);

    // 器物：占画面下部约三分之二，是唯一的主视觉。
    paintVessel(ctx, options.vesselSource, { x: -130, y: 430, width: 880, height: 1010 });

    // 右上两列竖排小字：器与色、时与谱。自右向左读。
    verticalText(
      ctx,
      `${vessel.formalName} · 结晶釉六重`,
      1006, 128,
      { size: 26, color: INK_BODY, gap: 9 },
    );
    verticalText(
      ctx,
      `色历${uniqueColors.slice(0, 3).join('、')}`,
      952, 128,
      { size: 22, color: INK_BODY, gap: 8 },
    );
    verticalText(
      ctx,
      `${moment.full} ${moment.hour} 凝 · ${session.resultId}`,
      902, 128,
      { size: 22, color: INK_BODY, gap: 8 },
    );

    // 中右：作品名书法落款 + 印，如馆藏海报的署名位。
    const signatureEnd = verticalText(ctx, title.display, 856, 560, {
      size: 48, color: INK_TITLE, weight: 500, gap: 14,
    });
    paintSeal(ctx, 826, signatureEnd + 34, 60);

    // 底部一行小字：定位与边界，横排、极淡。
    ctx.save();
    ctx.font = `400 20px ${BRUSH_FONT}`;
    ctx.fillStyle = INK_FAINT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`六出凝华 · ${vessel.era} · 当代程序生成，非文物复刻`, 64, 1392);
    ctx.restore();

    return {
      dataUrl: canvas.toDataURL('image/png'),
      title: title.full,
      colorNames: uniqueColors,
    };
  }

  return { BRUSH_FONT, HEIGHT, WIDTH, renderPoster, renderScreenCapture, verticalText };
}));
