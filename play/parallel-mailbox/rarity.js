(function initParallelMailboxRarity(root, factory) {
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  if (root) root.ParallelMailboxRarity = value;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createParallelMailboxRarity() {
  'use strict';

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
    return value;
  }

  /**
   * 稀有度只决定「信封 / 信纸 / 邮戳 / 粒子」的呈现，绝不决定回信内容。
   *
   * 两级结构：
   * - **档位（tier）** 承担概率与共性：权重、双重盖章、封蜡微光、粒子、封蜡纹章，
   *   以及信纸的结构性特效（纹饰、边缘辉光、毛边）。档位回答「有多稀有」。
   * - **款式（variant）** 承担配色与暗纹：信封纸色、封蜡色、内衬、信纸暗纹母题。
   *   款式回答「长什么样」。
   *
   * 共 17 款：常见 4 + 一般 4 + 稀有 4 + 传说 4 + 鎏金 1。
   * 先按档位权重抽档，再在档内等概率抽款式，故单款概率 = 档位权重 ÷ 该档款式数。
   * 鎏金只有一款，1% 使它成为**单款最稀有**的信封（传说单款 1.3%）。
   *
   * 信纸仍一律白底、黑白灰文字：款式差异体现在暗纹母题及其取色（--tier-accent），
   * 不去染纸色，否则正文可读性会随款式漂移。
   *
   * 每个款式都被**摊平**成一个完整样式对象（含从档位继承的字段），
   * 渲染层拿到即可直接用，不必在 UI 里做两级查找。
   */

  const tiers = [
    {
      id: 'common',
      name: '常见',
      englishName: 'COMMON',
      weight: 55,
      lore: '一次顺利的投递。信在寻常的宇宙间穿过，纸角只沾了一点尘。',
      emblem: 'postal',
      blend: 'multiply',
      sealMark: 'rgba(255,255,255,.55)',
      doublePostmark: false,
      sealGlow: false,
      sheen: 0,
      letter: { ornament: 'none', edgeGlow: 'none', deckle: true, shimmer: 'none', sparkle: false },
      particles: {
        colors: ['#e8e6e0', '#c9c7c1'],
        burst: 16, spread: 1.5, gravity: 0.04,
        size: [0.8, 1.8], life: [50, 80], ambient: 0, glow: false, star: false,
      },
      variants: [
        {
          id: 'kraft', name: '牛皮',
          paper: 'linear-gradient(155deg,#d5b684,#c9a876 55%,#ab8b5e)',
          flap: '#b8946a', ink: '#2c2620', lining: '#b0895c',
          seal: '#8a2f2a', accent: '#b9946a', edge: 'rgba(30, 28, 24, 0.14)',
          halo: 'rgba(150, 140, 120, 0.07)', watermark: 'fibre',
        },
        {
          id: 'rice', name: '米白',
          paper: 'linear-gradient(155deg,#f2ece0,#e6ddcd 55%,#d0c5af)',
          flap: '#ded4c1', ink: '#4a4238', lining: '#cbbfa7',
          seal: '#9b6a3f', accent: '#c2ab85', edge: 'rgba(60, 52, 38, 0.13)',
          halo: 'rgba(190, 175, 145, 0.07)', watermark: 'dots',
        },
        {
          id: 'linen', name: '麻灰',
          paper: 'linear-gradient(155deg,#d2cdc2,#bfbaad 55%,#a19b8d)',
          flap: '#c4bfb1', ink: '#3a3a3e', lining: '#a8a294',
          seal: '#4a4a4e', accent: '#a8a294', edge: 'rgba(36, 36, 32, 0.15)',
          halo: 'rgba(150, 150, 145, 0.07)', watermark: 'weave',
        },
        {
          id: 'terracotta', name: '陶土',
          paper: 'linear-gradient(155deg,#ddb6a1,#cc9f87 55%,#ac8069)',
          flap: '#ca9e86', ink: '#4a2a1e', lining: '#a97a62',
          seal: '#6d3f2c', accent: '#c08e73', edge: 'rgba(60, 32, 22, 0.15)',
          halo: 'rgba(180, 130, 105, 0.08)', watermark: 'grain',
        },
      ],
    },
    {
      id: 'uncommon',
      name: '一般',
      englishName: 'UNCOMMON',
      weight: 27,
      lore: '信在一条安静的支线上多停了一会儿，别处的水汽渗进了纸里。',
      emblem: 'sprout',
      blend: 'multiply',
      sealMark: 'rgba(255,255,255,.55)',
      doublePostmark: false,
      sealGlow: false,
      sheen: 0,
      letter: { ornament: 'rule', edgeGlow: 'none', deckle: true, shimmer: 'none', sparkle: false },
      particles: {
        colors: ['#cfd8d2', '#aab9b1'],
        burst: 26, spread: 1.8, gravity: 0.03,
        size: [0.9, 2], life: [60, 95], ambient: 0.12, glow: false, star: false,
      },
      variants: [
        {
          id: 'moss', name: '苔青',
          paper: 'linear-gradient(155deg,#c6cfbc,#b3bfa9 55%,#96a48c)',
          flap: '#a6b39c', ink: '#22332e', lining: '#93a189',
          seal: '#2f6b63', accent: '#8fa693', edge: 'rgba(38, 58, 50, 0.20)',
          halo: 'rgba(120, 160, 145, 0.08)', watermark: 'grid',
        },
        {
          id: 'mist', name: '雾蓝',
          paper: 'linear-gradient(155deg,#c4cfd8,#afbcc8 55%,#909eab)',
          flap: '#b7c3ce', ink: '#25333d', lining: '#8e9ba7',
          seal: '#35566e', accent: '#93a6b6', edge: 'rgba(34, 50, 62, 0.20)',
          halo: 'rgba(120, 150, 175, 0.08)', watermark: 'ripple',
        },
        {
          id: 'lilac', name: '藕荷',
          paper: 'linear-gradient(155deg,#d2c9d5,#c0b5c5 55%,#9f94a7)',
          flap: '#c7bccb', ink: '#332b3a', lining: '#9d92a5',
          seal: '#5c4667', accent: '#a99cb3', edge: 'rgba(48, 38, 58, 0.20)',
          halo: 'rgba(150, 130, 165, 0.08)', watermark: 'lattice',
        },
        {
          id: 'sand', name: '沙金',
          paper: 'linear-gradient(155deg,#e0d3b4,#d0c09d 55%,#b1a17d)',
          flap: '#d6c7a8', ink: '#3c3a22', lining: '#ab9b78',
          seal: '#5e6b35', accent: '#b8a884', edge: 'rgba(56, 52, 30, 0.19)',
          halo: 'rgba(180, 168, 120, 0.08)', watermark: 'chevron',
        },
      ],
    },
    {
      id: 'rare',
      name: '稀有',
      englishName: 'RARE',
      weight: 12,
      lore: '这封信穿过了一层更深的夜。抵达时，封蜡还是温的。',
      emblem: 'star',
      // 深色纸必须换亮墨 + screen 混色，否则邮戳会糊成一团
      blend: 'screen',
      sealMark: 'rgba(0,0,0,.45)',
      doublePostmark: true,
      sealGlow: true,
      sheen: 0,
      letter: { ornament: 'corner', edgeGlow: 'cool', deckle: false, shimmer: 'cool', sparkle: true },
      particles: {
        colors: ['#c3d2e8', '#93a9cc', '#e8eef8'],
        burst: 46, spread: 2.4, gravity: -0.012,
        size: [1, 2.6], life: [80, 130], ambient: 0.35, glow: true, star: false,
      },
      variants: [
        {
          id: 'indigo', name: '靛蓝',
          paper: 'linear-gradient(155deg,#3a4870,#2e3a58 55%,#212a44)',
          flap: '#26304c', ink: '#cddaf0', lining: '#1b2338',
          seal: '#c9973f', accent: '#93a9cc', edge: 'rgba(38, 54, 84, 0.24)',
          halo: 'rgba(90, 130, 200, 0.11)', watermark: 'stars',
        },
        {
          id: 'pine', name: '墨绿',
          paper: 'linear-gradient(155deg,#315046,#264039 55%,#1a2b26)',
          flap: '#28453c', ink: '#c8e0d4', lining: '#16241f',
          seal: '#b98a4b', accent: '#8fbaa6', edge: 'rgba(28, 58, 48, 0.26)',
          halo: 'rgba(80, 160, 130, 0.10)', watermark: 'rings',
        },
        {
          id: 'wine', name: '酒红',
          paper: 'linear-gradient(155deg,#502e36,#3f232b 55%,#2b171d)',
          flap: '#432630', ink: '#f0d2d8', lining: '#241318',
          seal: '#d1a07a', accent: '#c193a0', edge: 'rgba(62, 30, 38, 0.27)',
          halo: 'rgba(170, 90, 110, 0.10)', watermark: 'diamond',
        },
        {
          id: 'graphite', name: '石墨',
          paper: 'linear-gradient(155deg,#3d3f47,#31333a 55%,#22242a)',
          flap: '#34363d', ink: '#dce0e6', lining: '#1d1f24',
          seal: '#b9c0c9', accent: '#a4abb5', edge: 'rgba(34, 36, 42, 0.28)',
          halo: 'rgba(130, 140, 155, 0.10)', watermark: 'mesh',
        },
      ],
    },
    {
      id: 'legend',
      name: '传说',
      englishName: 'LEGENDARY',
      weight: 5,
      lore: '很少有信能从这么远的地方寄回来。它在路上被别的宇宙盖了第二枚戳。',
      emblem: 'constellation',
      blend: 'screen',
      sealMark: 'rgba(0,0,0,.45)',
      doublePostmark: true,
      sealGlow: true,
      sheen: 0,
      letter: { ornament: 'corner', edgeGlow: 'warm', deckle: false, shimmer: 'warm', sparkle: true },
      particles: {
        colors: ['#d8c9e4', '#b09cc4', '#f0e8f6'],
        burst: 70, spread: 3, gravity: -0.02,
        size: [1.2, 3], life: [100, 170], ambient: 0.6, glow: true, star: true,
      },
      variants: [
        {
          id: 'amethyst', name: '绯紫',
          paper: 'linear-gradient(155deg,#523566,#40274f 55%,#2d1a39)',
          flap: '#341f42', ink: '#f2dcf2', lining: '#241332',
          seal: '#e2b0da', accent: '#b09cc4', edge: 'rgba(66, 48, 88, 0.28)',
          halo: 'rgba(150, 110, 190, 0.13)', watermark: 'constellation',
        },
        {
          id: 'abyss', name: '深海',
          paper: 'linear-gradient(155deg,#26445f,#1b324b 55%,#122334)',
          flap: '#1f3850', ink: '#d4ecfa', lining: '#0e1c2a',
          seal: '#a8d4ec', accent: '#8fbcd6', edge: 'rgba(24, 50, 76, 0.30)',
          halo: 'rgba(80, 150, 200, 0.13)', watermark: 'waves',
        },
        {
          id: 'obsidian', name: '玄墨',
          paper: 'linear-gradient(155deg,#2e2e38,#212129 55%,#15151a)',
          flap: '#26262f', ink: '#eceaf4', lining: '#121217',
          seal: '#e8e6f0', accent: '#b8b6c6', edge: 'rgba(26, 26, 34, 0.32)',
          halo: 'rgba(150, 148, 175, 0.12)', watermark: 'rays',
        },
        {
          id: 'emberdark', name: '赤金夜',
          paper: 'linear-gradient(155deg,#4e2d2b,#3a2020 55%,#261414)',
          flap: '#402523', ink: '#fbdcc4', lining: '#1f1010',
          seal: '#f0a868', accent: '#cf9a72', edge: 'rgba(60, 32, 28, 0.30)',
          halo: 'rgba(200, 120, 70, 0.13)', watermark: 'ember',
        },
      ],
    },
    {
      id: 'gilded',
      name: '鎏金',
      englishName: 'GILDED',
      weight: 1,
      lore: '信封上没有署名，邮戳的年份也没能撑过这趟旅程。只知道有人替你把灯留着。',
      emblem: 'compass',
      blend: 'multiply',
      sealMark: 'rgba(0,0,0,.45)',
      doublePostmark: true,
      sealGlow: true,
      sheen: 0.5,
      letter: { ornament: 'frame', edgeGlow: 'gold', deckle: false, shimmer: 'gold', sparkle: true },
      particles: {
        colors: ['#ffe9a8', '#f0c840', '#c9a227', '#fff8e0'],
        burst: 130, spread: 3.4, gravity: 0.028,
        size: [1.2, 3.4], life: [130, 220], ambient: 1, glow: true, star: true,
      },
      variants: [
        {
          id: 'aurum', name: '流光金',
          paper: 'linear-gradient(150deg,#8a6a24,#d9b13f 30%,#f5e3a0 48%,#c9a227 62%,#7a5a1c)',
          flap: '#a3801f', ink: '#3a2a08', lining: '#6b4f16',
          seal: '#fff3cc', accent: '#e8c766', edge: 'rgba(150, 112, 20, 0.40)',
          halo: 'rgba(230, 190, 80, 0.16)', watermark: 'seal',
        },
      ],
    },
  ];

  const totalWeight = tiers.reduce((sum, tier) => sum + tier.weight, 0);

  /** 把档位共性与款式配色摊平成渲染层可直接使用的样式对象。 */
  const styles = tiers.flatMap((tier) => tier.variants.map((variant) => ({
    id: `${tier.id}-${variant.id}`,
    variantId: variant.id,
    variantName: variant.name,
    tierId: tier.id,
    name: tier.name,
    englishName: tier.englishName,
    lore: tier.lore,
    weight: tier.weight / tier.variants.length,
    tierWeight: tier.weight,
    envelope: {
      paper: variant.paper,
      flap: variant.flap,
      ink: variant.ink,
      blend: tier.blend,
      sealMark: tier.sealMark,
      lining: variant.lining,
      emblem: tier.emblem,
    },
    seal: variant.seal,
    accent: variant.accent,
    edge: variant.edge,
    halo: variant.halo,
    sheen: tier.sheen,
    doublePostmark: tier.doublePostmark,
    sealGlow: tier.sealGlow,
    letter: { ...tier.letter, watermark: variant.watermark },
    particles: tier.particles,
  })));

  const styleById = new Map(styles.map((style) => [style.id, style]));
  const tierById = new Map(tiers.map((tier) => [tier.id, tier]));
  const firstStyleOfTier = new Map(
    tiers.map((tier) => [tier.id, styles.find((style) => style.tierId === tier.id)]),
  );

  const round = (value) => Number(value.toFixed(1));

  /** 单款概率 = 档位权重 ÷ 该档款式数。鎏金只有一款，因此 1% 是单款最低。 */
  const percentLabel = (style) => `${round((style.weight / totalWeight) * 100)}%`;
  const tierPercentLabel = (tier) => `${round((tier.weight / totalWeight) * 100)}%`;

  /** 先按档位权重抽档，再在档内等概率抽款式。random 可注入，便于测试与保底策略。 */
  function draw(random) {
    const roll = (typeof random === 'function' ? random() : Math.random()) * totalWeight;
    let cursor = 0;
    for (const tier of tiers) {
      cursor += tier.weight;
      if (roll < cursor) {
        const pool = styles.filter((style) => style.tierId === tier.id);
        const pick = (typeof random === 'function' ? random() : Math.random()) * pool.length;
        return pool[Math.min(pool.length - 1, Math.floor(pick))];
      }
    }
    return styles[0];
  }

  /** 接受款式 id（`common-kraft`）或档位 id（`common`，取该档第一款），供调试参数与回填使用。 */
  function get(id) {
    return styleById.get(id) || firstStyleOfTier.get(id) || styles[0];
  }

  function getTier(tierId) {
    return tierById.get(tierId) || tiers[0];
  }

  return deepFreeze({
    schemeVersion: 'rarity-v3',
    tiers,
    styles,
    totalWeight,
    draw,
    get,
    getTier,
    percentLabel,
    tierPercentLabel,
  });
});
