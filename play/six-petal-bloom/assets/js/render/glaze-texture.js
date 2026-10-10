// 釉面贴图：白瓷底 + 冰裂片 + 结晶，以极坐标圆盘布局，供 3D 器物与海报共用。
// 圆盘中心 = 器心，圆盘边缘 = 口沿；纹样坐标与器面 (s, θ) 一一对应。
// 颜色规则：结晶自器心发色，向杯壁渐白；冰裂片承接每一击的冷色调与细微晶面折光。
(function attachGlazeTexture(root, factory) {
  const api = factory(root.LCN || {});
  root.LCN = root.LCN || {};
  Object.assign(root.LCN, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function createGlazeTextureApi(core) {
  'use strict';

  const TWO_PI = Math.PI * 2;
  const MAX_GROWTH_CHIPS_PER_FRAME = 3;
  const ease = (value) => core.ease(value);
  const localProgress = (progress, birth, span) => core.localProgress(progress, birth, span);

  function makeCanvas(size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas;
  }

  // 白瓷底：器心釉厚略沉，近口沿透白；只有极轻的釉水浓淡，不与纹路争。
  function paintBase(ctx, size, vessel, seed) {
    const glaze = core.GLAZE_COLORS[vessel.glaze] || core.GLAZE_COLORS.qingbai;
    const random = core.mulberry32(core.seedFromParts(seed, 'glaze-base'));
    const center = size / 2;

    ctx.clearRect(0, 0, size, size);
    const wash = ctx.createRadialGradient(center, center, size * 0.03, center, center, center);
    wash.addColorStop(0, core.mixHex(glaze.base, glaze.deep, 0.52));
    wash.addColorStop(0.42, core.mixHex(glaze.base, glaze.deep, 0.22));
    wash.addColorStop(0.80, glaze.base);
    wash.addColorStop(1, core.mixHex(glaze.base, glaze.light, 0.7));
    ctx.fillStyle = wash;
    ctx.beginPath();
    ctx.arc(center, center, center, 0, TWO_PI);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, center, 0, TWO_PI);
    ctx.clip();
    for (let index = 0; index < 60; index += 1) {
      const angle = random() * TWO_PI;
      const distance = Math.sqrt(random()) * center;
      const radius = size * (0.04 + random() * 0.10);
      const x = center + Math.cos(angle) * distance;
      const y = center + Math.sin(angle) * distance;
      const blob = ctx.createRadialGradient(x, y, 0, x, y, radius);
      const tone = random() > 0.5 ? glaze.light : glaze.deep;
      blob.addColorStop(0, core.rgba(tone, 0.030 + random() * 0.028));
      blob.addColorStop(1, core.rgba(tone, 0));
      ctx.fillStyle = blob;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    ctx.restore();
  }

  // 单片绘制：片身明度 + 暗缝 + 亮缘折光；reveal 为 0..1 的显现程度。
  // tint 为该片的色渐变叠加（器心浓、近口沿白），由揭示它的那一击的颜色携带。
  function paintChip(ctx, size, glaze, chip, reveal, tintColor, tintStrength) {
    const center = size / 2;
    const a = Math.max(0, Math.min(1, reveal));
    if (a <= 0.002) return;
    ctx.beginPath();
    chip.polygon.forEach((point, index) => {
      const x = center + point.x * center;
      const y = center + point.y * center;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    // 片身。
    ctx.fillStyle = chip.tone >= 0
      ? core.rgba('#FFFFFF', chip.tone * 1.7 * a)
      : core.rgba(glaze.deep, -chip.tone * 1.6 * a);
    ctx.fill();
    // 色渐变：离器心越近，这一片带越浓的本色。
    if (tintColor) {
      const tint = typeof tintColor === 'string'
        ? { core: tintColor, tip: tintColor, accent: tintColor }
        : tintColor;
      const centerCloseness = 1 - Math.min(1, Math.hypot(chip.centroid.x, chip.centroid.y));
      const tintMix = Number.isFinite(chip.tintMix) ? chip.tintMix : 0.5;
      const chipTint = core.blendHex(tint.tip, tint.accent || tint.core || tint.tip, tintMix);
      const tintWeight = Number.isFinite(chip.tintWeight) ? chip.tintWeight : 1;
      const recipeTint = Number.isFinite(tintStrength) ? Math.max(0, Math.min(1, tintStrength)) : 1;
      const tintAlpha = Math.min(
        0.48,
        (0.04 + 0.31 * Math.pow(centerCloseness, 1.18)) * tintWeight * recipeTint * a,
      );
      ctx.fillStyle = core.rgba(chipTint, tintAlpha);
      ctx.fill();

      const prism = Number.isFinite(chip.prism) ? chip.prism : 0;
      if (prism > 0.08) {
        const px = center + chip.centroid.x * center;
        const py = center + chip.centroid.y * center;
        const angle = Number.isFinite(chip.grainAngle) ? chip.grainAngle : 0;
        const span = size * (chip.layer === 'fine' ? 0.055 : 0.11);
        const dx = Math.cos(angle) * span;
        const dy = Math.sin(angle) * span;
        const facet = ctx.createLinearGradient(px - dx, py - dy, px + dx, py + dy);
        facet.addColorStop(0, core.rgba(chipTint, 0));
        facet.addColorStop(0.45, core.rgba(tint.core || '#FFFFFF', 0.09 * prism * centerCloseness * recipeTint * a));
        facet.addColorStop(0.56, core.rgba('#FFFFFF', 0.055 * prism * centerCloseness * recipeTint * a));
        facet.addColorStop(1, core.rgba(chipTint, 0));
        ctx.fillStyle = facet;
        ctx.fill();
      }
    }
    // 暗缝。
    ctx.strokeStyle = core.rgba(glaze.deep, (chip.layer === 'fine' ? 0.16 : 0.10) * a);
    ctx.lineWidth = chip.layer === 'fine' ? 1.6 : 2.2;
    ctx.stroke();
    // 亮缘折光；正在显现的片边缘更亮，蔓延的波前因此有一线波光。
    ctx.save();
    ctx.translate(-0.5, -0.5);
    ctx.strokeStyle = core.rgba('#FFFFFF', Math.min(0.9, chip.edge * 2.6 * a + (1 - a) * a * 2.0));
    ctx.lineWidth = chip.layer === 'fine' ? 1.1 : 1.6;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * 一击的揭示动画：recipe.chipIds 里的片按 chipBirths 波前逐片显现，
   * 自点击处向四周蔓延，每片带位置渐变的本色。
   */
  function paintChips(ctx, size, vessel, field, recipe, progress) {
    const glaze = core.GLAZE_COLORS[vessel.glaze] || core.GLAZE_COLORS.qingbai;
    const p = Math.max(0, Math.min(1, progress));
    const center = size / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, center - 1, 0, TWO_PI);
    ctx.clip();
    ctx.lineJoin = 'round';
    for (let index = 0; index < recipe.chipIds.length; index += 1) {
      const chip = field.chips[recipe.chipIds[index]];
      if (!chip) continue;
      const reveal = localProgress(p, recipe.chipBirths[index], 0.36);
      const tintStrength = recipe.chipTintWeights ? recipe.chipTintWeights[index] : 1;
      paintChip(ctx, size, glaze, chip, reveal, recipe.color || null, tintStrength);
    }
    ctx.restore();
  }

  function paintChipsMask(ctx, size, field, recipe, progress) {
    const p = Math.max(0, Math.min(1, progress));
    const center = size / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, center - 1, 0, TWO_PI);
    ctx.clip();
    for (let index = 0; index < recipe.chipIds.length; index += 1) {
      const chip = field.chips[recipe.chipIds[index]];
      if (!chip) continue;
      const reveal = localProgress(p, recipe.chipBirths[index], 0.36);
      paintChipMask(ctx, size, chip, reveal);
    }
    ctx.restore();
  }

  function paintChipMask(ctx, size, chip, reveal) {
    if (reveal <= 0.02) return;
    const center = size / 2;
    ctx.beginPath();
    chip.polygon.forEach((point, pointIndex) => {
      const x = center + point.x * center;
      const y = center + point.y * center;
      if (pointIndex === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = core.rgba('#FFFFFF', 0.45 * reveal);
    ctx.fill();
  }

  // 冰裂片：先粗后细两层 Voronoi 片，各片独立明度 + 折光边，成参考器物的碎冰质感。
  function paintIce(ctx, size, vessel, field) {
    const glaze = core.GLAZE_COLORS[vessel.glaze] || core.GLAZE_COLORS.qingbai;
    const center = size / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, center - 1, 0, TWO_PI);
    ctx.clip();
    ctx.lineJoin = 'round';

    field.chips.forEach((chip) => {
      ctx.beginPath();
      chip.polygon.forEach((point, index) => {
        const x = center + point.x * center;
        const y = center + point.y * center;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      // 片身：亮片压白、暗片压深，两者都极薄，让底釉的径向渐变仍连续。
      ctx.fillStyle = chip.tone >= 0
        ? core.rgba('#FFFFFF', chip.tone * 1.7)
        : core.rgba(glaze.deep, -chip.tone * 1.6);
      ctx.fill();
      // 暗缝：片与片之间的深色间隙，先画在亮缘之下。
      ctx.strokeStyle = core.rgba(glaze.deep, chip.layer === 'fine' ? 0.16 : 0.10);
      ctx.lineWidth = chip.layer === 'fine' ? 1.6 : 2.2;
      ctx.stroke();
      // 片缘折光：一圈亮白细线，是冰裂读得出来的关键。
      ctx.save();
      ctx.translate(-0.5, -0.5);
      ctx.strokeStyle = core.rgba('#FFFFFF', chip.edge * 2.6);
      ctx.lineWidth = chip.layer === 'fine' ? 1.1 : 1.6;
      ctx.stroke();
      ctx.restore();
    });
    ctx.restore();
  }

  /**
   * 单枚裂纹晶体。progress 推进时：
   * 裂纹线自落点向外奔走（按 point.d 揭示），晶面随其后浮现，中心辉光最后定住。
   * 颜色由 recipe.color 携带（器心浓、近口沿淡），面与线共用本色。
   */
  function paintCrystal(ctx, size, recipe, progress) {
    const center = size / 2;
    const radius = recipe.radius * center;
    const p = Math.max(0, Math.min(1, progress));
    if (p <= 0 || radius <= 0.5) return;
    const coreColor = recipe.color.core;
    const tipColor = recipe.color.tip;
    const centerT = Math.pow(1 - Math.min(1, Math.hypot(recipe.cx, recipe.cy) / 0.9), 1.3);
    // 裂纹揭示进度：前 72% 的时间里裂纹跑完全程，晶面随后补满。
    const reveal = ease(Math.min(1, p / 0.72)) * (recipe.maxReach || 1);

    ctx.save();
    ctx.translate(center + recipe.cx * center, center + recipe.cy * center);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 底晕：一层柔和的本色，把晶体按进釉里；抽枝无晶面，底晕减半以免糊。
    const haloScale = recipe.kind === 'branch' ? 0.5 : 1;
    const halo = ctx.createRadialGradient(0, 0, radius * 0.06, 0, 0, radius * 1.12 * (0.5 + p * 0.5));
    halo.addColorStop(0, core.rgba(tipColor, (0.16 + 0.22 * centerT) * p * haloScale));
    halo.addColorStop(0.6, core.rgba(tipColor, 0.08 * p * haloScale));
    halo.addColorStop(1, core.rgba(tipColor, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.15, 0, TWO_PI);
    ctx.fill();

    // 晶面：相邻主裂纹夹出的扇面，本色渐变 + 面内丝理。
    recipe.faces.forEach((face) => {
      const grow = localProgress(p, face.birth, 0.55);
      if (grow <= 0.02) return;
      const gradient = ctx.createRadialGradient(0, 0, radius * 0.02, 0, 0, radius);
      gradient.addColorStop(0, core.rgba(tipColor, 0.52 * face.tone * recipe.opacity * grow));
      gradient.addColorStop(0.5, core.rgba(tipColor, 0.30 * face.tone * recipe.opacity * grow));
      gradient.addColorStop(0.86, core.rgba(coreColor, 0.14 * face.tone * recipe.opacity * grow));
      gradient.addColorStop(1, core.rgba(coreColor, 0));
      const facePath = () => {
        ctx.beginPath();
        face.polygon.forEach((point, index) => {
          const x = point.x * radius;
          const y = point.y * radius;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
      };
      ctx.fillStyle = gradient;
      facePath();
      ctx.fill();
      // 平色调制：亮面压白、暗面压色，相邻晶面因此有参考器物里的明暗块面。
      facePath();
      ctx.fillStyle = face.tone > 0.76
        ? core.rgba('#FFFFFF', (face.tone - 0.76) * 1.1 * grow)
        : core.rgba(tipColor, (0.76 - face.tone) * 0.55 * grow * recipe.opacity);
      ctx.fill();

      // 面内放射丝理。
      face.striations.forEach((line) => {
        const lineGrow = localProgress(p, face.birth + 0.08, 0.5);
        if (lineGrow <= 0.02) return;
        const cos = Math.cos(line.angle);
        const sin = Math.sin(line.angle);
        const toRadius = line.to * lineGrow * radius;
        const gradientLine = ctx.createLinearGradient(
          cos * line.from * radius, sin * line.from * radius, cos * toRadius, sin * toRadius,
        );
        gradientLine.addColorStop(0, core.rgba('#FFFFFF', 0.34 * line.alpha * recipe.opacity));
        gradientLine.addColorStop(0.6, core.rgba(tipColor, 0.26 * line.alpha * recipe.opacity));
        gradientLine.addColorStop(1, core.rgba(tipColor, 0));
        ctx.strokeStyle = gradientLine;
        ctx.lineWidth = Math.max(0.5, line.width * radius);
        ctx.beginPath();
        ctx.moveTo(cos * line.from * radius, sin * line.from * radius);
        ctx.lineTo(cos * toRadius, sin * toRadius);
        ctx.stroke();
      });
    });

    // 器心辉光：只有靠近器心的晶体才有，参考器物里那汪由器心涌出的色。
    if (centerT > 0.08) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(0, 0, radius * 0.03, 0, 0, radius * 0.84 * p);
      glow.addColorStop(0, core.rgba(tipColor, 0.55 * centerT * p));
      glow.addColorStop(0.5, core.rgba(tipColor, 0.22 * centerT * p));
      glow.addColorStop(1, core.rgba(tipColor, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.88, 0, TWO_PI);
      ctx.fill();
      ctx.restore();
    }

    // 裂纹线：亮棱在前奔走，色晕紧随——蔓延的主角。
    recipe.cracks.forEach((crack) => {
      const visible = crack.points.filter((point) => point.d <= reveal);
      if (visible.length < 2) return;
      const trace = () => {
        ctx.beginPath();
        visible.forEach((point, index) => {
          const x = point.x * radius;
          const y = point.y * radius;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
      };
      const weight = Math.max(0.7, crack.weight * radius * 1.15);
      // 色晕垫底。
      trace();
      ctx.strokeStyle = core.rgba(tipColor, (crack.level === 0 ? 0.62 : 0.44) * recipe.opacity);
      ctx.lineWidth = weight * 2.6;
      ctx.stroke();
      // 深色衬线：紧贴亮棱的一线暗边，让白棱在浅釉上也立得住。
      ctx.save();
      ctx.translate(0.6, 0.6);
      trace();
      ctx.strokeStyle = core.rgba(tipColor, (crack.level === 0 ? 0.55 : 0.36) * recipe.opacity);
      ctx.lineWidth = weight * 0.95;
      ctx.stroke();
      ctx.restore();
      // 亮棱压顶：裂纹的折光。
      trace();
      ctx.strokeStyle = core.rgba('#FFFFFF', (crack.level === 0 ? 1.0 : 0.72) * recipe.opacity);
      ctx.lineWidth = weight;
      ctx.stroke();
      // 裂纹前端的小亮点：正在奔走的感觉。
      if (reveal < (recipe.maxReach || 1) * 0.98) {
        const tip = visible[visible.length - 1];
        const spark = ctx.createRadialGradient(tip.x * radius, tip.y * radius, 0, tip.x * radius, tip.y * radius, weight * 4);
        spark.addColorStop(0, core.rgba('#FFFFFF', 0.55));
        spark.addColorStop(1, core.rgba('#FFFFFF', 0));
        ctx.fillStyle = spark;
        ctx.fillRect(tip.x * radius - weight * 4, tip.y * radius - weight * 4, weight * 8, weight * 8);
      }
    });

    // 晶心：一粒小六边薄片。
    const coreRadius = recipe.coreRadius * radius * Math.min(1, p * 3.2);
    if (coreRadius > 0.4) {
      ctx.beginPath();
      for (let index = 0; index < 6; index += 1) {
        const angle = recipe.rotation + (index / 6) * TWO_PI;
        const x = Math.cos(angle) * coreRadius;
        const y = Math.sin(angle) * coreRadius;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = core.rgba('#FFFFFF', 0.30);
      ctx.fill();
      ctx.strokeStyle = core.rgba(tipColor, 0.34);
      ctx.lineWidth = Math.max(0.5, radius * 0.010);
      ctx.stroke();
    }

    ctx.restore();
  }

  function crystalBounds(size, recipe) {
    const center = size / 2;
    // reveal 配方的 radius 是波前最远距离；片本身另有尺寸，多留一点边。
    const radius = recipe.radius * center * 1.12 + size * 0.09;
    const x = center + recipe.cx * center;
    const y = center + recipe.cy * center;
    const left = Math.max(0, Math.floor(x - radius));
    const top = Math.max(0, Math.floor(y - radius));
    const right = Math.min(size, Math.ceil(x + radius));
    const bottom = Math.min(size, Math.ceil(y + radius));
    return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
  }

  function chipBounds(size, chip) {
    const center = size / 2;
    const margin = 4;
    let minX = size;
    let minY = size;
    let maxX = 0;
    let maxY = 0;
    chip.polygon.forEach((point) => {
      const x = center + point.x * center;
      const y = center + point.y * center;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
    const left = Math.max(0, Math.floor(minX - margin));
    const top = Math.max(0, Math.floor(minY - margin));
    const right = Math.min(size, Math.ceil(maxX + margin));
    const bottom = Math.min(size, Math.ceil(maxY + margin));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function mergeBounds(a, b) {
    if (!a) return b;
    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const right = Math.max(a.x + a.width, b.x + b.width);
    const bottom = Math.max(a.y + a.height, b.y + b.height);
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  // 遮罩用纯白重绘同一枚结晶：只关心「哪里有结晶」，不带釉色与色相。
  const WHITE = Object.freeze({ core: '#FFFFFF', tip: '#FFFFFF' });

  function paintCrystalMask(ctx, size, recipe, progress) {
    paintCrystal(ctx, size, { ...recipe, color: WHITE, opacity: 1 }, progress);
  }

  /**
   * 创建一张可增量更新的釉面贴图。
   * 「静态层」保存釉底、冰裂片与已完成的结晶；「工作层」在其上绘制正在生长的一枚。
   * maskCanvas 是同布局的结晶遮罩，供 3D 着色器区分晶体与釉面。
   */
  function createGlazeTexture(options) {
    const settings = options || {};
    const size = settings.size || 1024;
    const seed = settings.seed || 'glaze';
    let vessel = settings.vessel;
    let field = settings.field || core.iceFieldFor(seed, vessel);
    const staticCanvas = makeCanvas(size);
    const staticCtx = staticCanvas.getContext('2d');
    const canvas = makeCanvas(size);
    const ctx = canvas.getContext('2d');
    const maskStaticCanvas = makeCanvas(size);
    const maskStaticCtx = maskStaticCanvas.getContext('2d');
    const maskCanvas = makeCanvas(size);
    const maskCtx = maskCanvas.getContext('2d');
    let growthState = null;
    function repaintStatic(recipes) {
      // 起点是一只完全空白的素碗：只有釉底，冰片由点击逐批揭示。
      paintBase(staticCtx, size, vessel, core.seedFromParts(seed, vessel.id));
      maskStaticCtx.globalCompositeOperation = 'source-over';
      maskStaticCtx.fillStyle = '#000000';
      maskStaticCtx.fillRect(0, 0, size, size);
      (recipes || []).forEach((recipe) => {
        paintChips(staticCtx, size, vessel, field, recipe, 1);
        paintChipsMask(maskStaticCtx, size, field, recipe, 1);
      });
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(staticCanvas, 0, 0);
      maskCtx.clearRect(0, 0, size, size);
      maskCtx.drawImage(maskStaticCanvas, 0, 0);
      growthState = null;
    }

    repaintStatic([]);

    return {
      canvas,
      maskCanvas,
      size,
      get vessel() { return vessel; },
      get field() { return field; },
      /** 更换器物：接收 session 重算后的片场与揭示配方。 */
      setVessel(nextVessel, recipes, nextField) {
        vessel = nextVessel;
        if (nextField) field = nextField;
        repaintStatic(recipes);
      },
      /** 重画静态层（釉底、冰裂与全部已完成结晶）。 */
      reset(recipes) {
        repaintStatic(recipes);
      },
      /** 生长中的一枚：每片只绘制一次，返回本帧新增片的脏矩形。 */
      drawGrowing(recipe, progress) {
        if (!growthState || growthState.recipe !== recipe) {
          growthState = { recipe, nextChip: 0 };
        }
        const p = Math.max(0, Math.min(1, progress));
        let dirty = null;
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 1, 0, TWO_PI);
        ctx.clip();
        ctx.lineJoin = 'round';
        maskCtx.save();
        maskCtx.beginPath();
        maskCtx.arc(size / 2, size / 2, size / 2 - 1, 0, TWO_PI);
        maskCtx.clip();
        let paintedThisFrame = 0;
        while (growthState.nextChip < recipe.chipIds.length && paintedThisFrame < MAX_GROWTH_CHIPS_PER_FRAME) {
          const index = growthState.nextChip;
          if (localProgress(p, recipe.chipBirths[index], 0.36) <= 0.02) break;
          const chip = field.chips[recipe.chipIds[index]];
          growthState.nextChip += 1;
          if (!chip) continue;
          paintedThisFrame += 1;
          const tintStrength = recipe.chipTintWeights ? recipe.chipTintWeights[index] : 1;
          paintChip(ctx, size, core.GLAZE_COLORS[vessel.glaze] || core.GLAZE_COLORS.qingbai, chip, 1, recipe.color || null, tintStrength);
          paintChipMask(maskCtx, size, chip, 1);
          dirty = mergeBounds(dirty, chipBounds(size, chip));
        }
        ctx.restore();
        maskCtx.restore();
        return {
          rect: dirty,
          complete: growthState.nextChip >= recipe.chipIds.length,
        };
      },
      /** 把一击揭示完的冰片烘焙进静态层。 */
      commit(recipe) {
        if (!growthState || growthState.recipe !== recipe || growthState.nextChip < recipe.chipIds.length) return false;
        // 工作层本身就是累计成品；下一枚继续在它上面增量绘制。
        // 静态层只在撤回、重置或换器时重建，完成一枚时无需整图复制。
        growthState = null;
        return true;
      },
    };
  }

  return { createGlazeTexture, crystalBounds, paintBase, paintChip, paintChips, paintChipsMask, paintCrystal, paintCrystalMask, paintIce };
}));
