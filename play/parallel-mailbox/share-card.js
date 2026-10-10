(function initParallelMailboxShareCard(root, factory) {
  const value = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = value;
  if (root) root.ParallelMailboxShareCard = value;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createParallelMailboxShareCard(root) {
  'use strict';

  /**
   * 把结果页光栅化成一张可存相册的图片。
   *
   * 小红书容器禁止外部脚本，html2canvas / dom-to-image 这类库都用不了，
   * 因此这里用 Canvas 2D 手绘整张卡片。好处是完全可控、零依赖、不会被 CSP 拦；
   * 代价是排版要自己算，中文换行按字符逐个测宽。
   */

  const WIDTH = 1080;
  const HEIGHT = 1620;
  const PAD = 76;
  const CONTENT = WIDTH - PAD * 2;

  const FONT_SERIF = '"Songti SC", "STSong", "SimSun", Georgia, serif';
  const FONT_SANS = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif';
  const FONT_MONO = '"Courier New", Courier, monospace';

  const INK = '#2a2a2c';
  const INK_SOFT = '#6f6f74';

  /** 从 CSS 渐变字符串里取出色标，用于在 canvas 上还原同一套配色。 */
  function paintFromGradient(context, cssGradient, x, y, width, height) {
    const stops = String(cssGradient).match(/#[0-9a-f]{3,8}/gi) || ['#c9a876'];
    const gradient = context.createLinearGradient(x, y, x + width * 0.45, y + height);
    stops.forEach((color, index) => {
      gradient.addColorStop(stops.length === 1 ? 0 : index / (stops.length - 1), color);
    });
    return gradient;
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  /** 中文没有词边界，逐字符累加测宽即可正确断行。 */
  function wrapText(context, text, maxWidth) {
    const lines = [];
    let line = '';
    for (const character of String(text)) {
      if (character === '\n') {
        lines.push(line);
        line = '';
        continue;
      }
      const candidate = line + character;
      if (context.measureText(candidate).width > maxWidth && line) {
        lines.push(line);
        line = character;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawParagraph(context, text, x, y, maxWidth, lineHeight) {
    const lines = wrapText(context, text, maxWidth);
    lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
    return y + lines.length * lineHeight;
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`share card image failed: ${source}`));
      image.src = source;
    });
  }

  /** 信封缩略图：纸面 + 三折缝 + 翻盖 + 封蜡，与页面上的 CSS 信封同构。 */
  function drawEnvelope(context, tier, x, y, width) {
    const height = width * (2 / 3);
    context.save();

    context.shadowColor = 'rgba(0,0,0,0.34)';
    context.shadowBlur = 26;
    context.shadowOffsetY = 12;
    roundedRect(context, x, y, width, height, 8);
    context.fillStyle = paintFromGradient(context, tier.envelope.paper, x, y, width, height);
    context.fill();
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;

    context.save();
    roundedRect(context, x, y, width, height, 8);
    context.clip();

    const cx = x + width / 2;
    const cy = y + height / 2;
    const tri = (points, fill) => {
      context.beginPath();
      context.moveTo(points[0], points[1]);
      context.lineTo(points[2], points[3]);
      context.lineTo(points[4], points[5]);
      context.closePath();
      context.fillStyle = fill;
      context.fill();
    };
    tri([x, y, cx, cy, x, y + height], 'rgba(0,0,0,0.085)');
    tri([x + width, y, x + width, y + height, cx, cy], 'rgba(255,255,255,0.09)');
    tri([x, y + height, cx, cy, x + width, y + height], 'rgba(0,0,0,0.10)');

    // 翻盖
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + width, y);
    context.lineTo(cx, y + height * 0.58);
    context.closePath();
    context.fillStyle = tier.envelope.flap;
    context.fill();
    context.strokeStyle = 'rgba(255,255,255,0.22)';
    context.lineWidth = 2;
    context.stroke();

    context.restore();

    // 封蜡
    const sealRadius = width * 0.082;
    const sealY = y + height * 0.46;
    const wax = context.createRadialGradient(cx - sealRadius * 0.3, sealY - sealRadius * 0.35, 1, cx, sealY, sealRadius);
    wax.addColorStop(0, '#ffffff55');
    wax.addColorStop(0.35, tier.seal);
    wax.addColorStop(1, 'rgba(0,0,0,0.35)');
    context.beginPath();
    context.arc(cx, sealY, sealRadius, 0, Math.PI * 2);
    context.fillStyle = wax;
    context.fill();
    context.strokeStyle = 'rgba(0,0,0,0.22)';
    context.lineWidth = 2;
    context.stroke();

    context.restore();
    return height;
  }

  function drawPostmark(context, tier, voice, x, y, radius) {
    context.save();
    context.translate(x, y);
    context.rotate(-0.14);
    context.strokeStyle = INK_SOFT;
    context.fillStyle = INK_SOFT;
    context.globalAlpha = 0.42;
    context.lineWidth = 2.4;

    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.arc(0, 0, radius * 0.8, 0, Math.PI * 2);
    context.stroke();

    context.textAlign = 'center';
    context.font = `600 ${Math.round(radius * 0.72)}px ${FONT_MONO}`;
    context.fillText(voice.postmarkYear === null ? '∞' : String(voice.postmarkYear), 0, radius * 0.16);
    context.font = `${Math.round(radius * 0.2)}px ${FONT_MONO}`;
    context.fillText(voice.postmarkYear === null ? '年份不可考' : '年后寄达', 0, radius * 0.52);
    context.restore();
  }

  /**
   * 渲染整张分享卡。
   * 传入的 photo 是 2×2 图集，按 cell 做 cover 裁切，保持正方形单元格不变形。
   */
  async function render(payload) {
    const {
      tier, scene, voice, message, recipient, sceneNumber, questionCount, percentLabel, photoSrc,
    } = payload;

    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');

    // 底：白信纸
    const paper = context.createLinearGradient(0, 0, WIDTH * 0.4, HEIGHT);
    paper.addColorStop(0, '#fbfaf8');
    paper.addColorStop(0.55, '#f1eee9');
    paper.addColorStop(1, '#e4e0d9');
    context.fillStyle = paper;
    context.fillRect(0, 0, WIDTH, HEIGHT);

    // 稀有度描边：与页面上的 --tier-edge 对应
    context.strokeStyle = tier.edge;
    context.lineWidth = 6;
    context.strokeRect(3, 3, WIDTH - 6, HEIGHT - 6);
    if (tier.letter.ornament === 'frame') {
      context.strokeStyle = tier.accent;
      context.lineWidth = 2;
      context.strokeRect(26, 26, WIDTH - 52, HEIGHT - 52);
    }

    let y = PAD + 26;

    // 头部：稀有度 + 出处
    context.textAlign = 'left';
    context.font = `500 26px ${FONT_MONO}`;
    context.fillStyle = INK_SOFT;
    context.fillText(`${tier.name} · ${tier.variantName} · ${percentLabel}`, PAD, y);
    context.textAlign = 'right';
    context.fillText(`平行信箱 · ${voice.universeLabel}`, WIDTH - PAD, y);
    context.textAlign = 'left';

    y += 44;

    // 来信照片：1:1 单元格按 cover 裁进 16:10，只裁不拉
    const photoHeight = Math.round(CONTENT / (message.tip ? 1.85 : 1.6));
    try {
      const image = await loadImage(photoSrc);
      const cell = image.naturalWidth / 2;
      const sourceHeight = cell / (CONTENT / photoHeight);
      const sx = scene.asset.column * cell;
      const sy = scene.asset.row * cell + (cell - sourceHeight) / 2;
      context.save();
      roundedRect(context, PAD, y, CONTENT, photoHeight, 6);
      context.clip();
      context.drawImage(image, sx, sy, cell, sourceHeight, PAD, y, CONTENT, photoHeight);
      context.restore();
    } catch (error) {
      context.fillStyle = '#d9d5cd';
      roundedRect(context, PAD, y, CONTENT, photoHeight, 6);
      context.fill();
    }

    // 信封缩略图压在照片右下角：截图里一眼看到这次开出的是哪一档
    const envelopeWidth = 240;
    const envelopeX = WIDTH - PAD - envelopeWidth - 18;
    const envelopeY = y + photoHeight - 128;
    drawEnvelope(context, tier, envelopeX, envelopeY, envelopeWidth);

    y += photoHeight + 78;

    // 邮戳
    drawPostmark(context, tier, voice, WIDTH - PAD - 62, y + 6, 62);

    // 正文
    context.fillStyle = INK;
    context.font = `600 52px ${FONT_SERIF}`;
    y = drawParagraph(context, message.lead, PAD, y + 22, CONTENT - 170, 74);

    context.fillStyle = INK_SOFT;
    context.font = `30px ${FONT_SANS}`;
    y = drawParagraph(context, message.subtitle, PAD, y + 34, CONTENT - 170, 46);

    y += 30;
    context.strokeStyle = 'rgba(30,28,24,0.14)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(PAD, y);
    context.lineTo(WIDTH - PAD, y);
    context.stroke();
    y += 54;

    context.fillStyle = INK;
    context.font = `600 34px ${FONT_SERIF}`;
    y = drawParagraph(context, `${recipient}：`, PAD, y, CONTENT, 52);

    context.fillStyle = INK_SOFT;
    context.font = `30px ${FONT_SERIF}`;
    y = drawParagraph(context, voice.intro, PAD, y + 22, CONTENT, 50);

    context.fillStyle = INK;
    context.font = `34px ${FONT_SERIF}`;
    y = drawParagraph(context, message.body, PAD, y + 30, CONTENT, 58);

    if (message.tip) {
      context.fillStyle = tier.accent;
      context.font = `700 30px ${FONT_SERIF}`;
      y = drawParagraph(context, message.tip, PAD, y + 26, CONTENT, 46);
    }

    // 落款
    context.textAlign = 'right';
    context.fillStyle = INK;
    context.font = `600 30px ${FONT_SERIF}`;
    context.fillText(voice.signoff, WIDTH - PAD, y + 52);
    context.textAlign = 'left';

    // 页脚
    context.strokeStyle = 'rgba(30,28,24,0.14)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(PAD, HEIGHT - PAD - 62);
    context.lineTo(WIDTH - PAD, HEIGHT - PAD - 62);
    context.stroke();

    context.fillStyle = INK_SOFT;
    context.font = `24px ${FONT_SANS}`;
    context.fillText(`第 ${sceneNumber} / 16 封 · 由今晚 ${questionCount} 次图片选择生成`, PAD, HEIGHT - PAD - 20);
    context.textAlign = 'right';
    context.fillText('平行故事，不预测真实未来', WIDTH - PAD, HEIGHT - PAD - 20);

    return canvas;
  }

  /**
   * 存相册。必须由用户主动操作触发。
   * 普通浏览器里没有 window.xhs.miniTool，此时返回 unsupported，由调用方提示改用系统截图。
   */
  async function saveToAlbum(canvas) {
    const bridge = root.xhs && root.xhs.miniTool;
    if (!bridge || typeof bridge.writeTempFile !== 'function' || typeof bridge.saveImageToPhotosAlbum !== 'function') {
      return { status: 'unsupported' };
    }
    try {
      // 用 JPEG 而不是 PNG：同一张卡 PNG 约 2.4MB、JPEG 约 0.4MB，
      // 而这串 base64 要整个穿过 JSBridge，体积小很多更稳。
      // writeTempFile 只接受完整 data:uri，toDataURL 的返回值原样传，不要截取逗号后的部分。
      const written = await bridge.writeTempFile({ data: canvas.toDataURL('image/jpeg', 0.92) });
      const filePath = written && written.filePath;
      if (!filePath) return { status: 'failed', message: '临时文件写入失败' };
      await bridge.saveImageToPhotosAlbum({ filePath });
      return { status: 'saved' };
    } catch (error) {
      const message = String((error && error.errMsg) || (error && error.message) || error || '');
      if (/cancel|deny|denied|auth/i.test(message)) return { status: 'cancelled', message };
      return { status: 'failed', message };
    }
  }

  return Object.freeze({ render, saveToAlbum, WIDTH, HEIGHT });
});
