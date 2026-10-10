(function initParallelMailboxAppV2(root) {
  'use strict';

  const data = root.MemoryEnvelopeData;
  const engine = root.MemoryEnvelopeEngine;
  const flow = root.ParallelMailboxFlow;
  const rarity = root.ParallelMailboxRarity;
  const fx = root.ParallelMailboxFx;
  const shareCard = root.ParallelMailboxShareCard || null;
  const assets = root.MemoryEnvelopeAssets || { load: () => Promise.resolve(true) };
  const audio = root.MemoryEnvelopeAudio || null;
  const mount = document.getElementById('app');
  if (!data || !engine || !flow || !rarity || !fx || !mount) {
    throw new Error('Parallel Mailbox v2 runtime failed to initialize');
  }

  const params = new URLSearchParams(root.location.search);
  const testMode = params.get('test') === '1';
  const forcedTierId = testMode ? params.get('tier') : null;
  // ?slow=1 把入场 / 装信动画放慢 3 倍，方便逐帧确认动效
  const slowMotion = params.get('slow') === '1';
  const reduceMotion = root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const questionCount = data.questions.length;
  const commonEnvelopeStyles = rarity.styles.filter((style) => style.tierId === 'common');

  // 用户领取的是常见款空信封：一局只抽一次，题目切换时保持同一只；
  // 最终寄回的信封仍由独立的稀有度抽取决定，两者互不影响。
  const drawCommonEnvelopeStyle = () => {
    if (!commonEnvelopeStyles.length) return rarity.get('common');
    const index = Math.min(
      commonEnvelopeStyles.length - 1,
      Math.floor(Math.random() * commonEnvelopeStyles.length),
    );
    return commonEnvelopeStyles[index];
  };

  let state = flow.createInitialState();
  let introStep = 'landing';
  let recipientName = '';
  let outboundEnvelopeStyle = drawCommonEnvelopeStyle();
  let resetConfirmOpen = false;
  let artworkZoomOpen = false;
  let artworkZoomOrigin = null;
  let transferInFlight = false;
  let openingReply = false;
  let announcement = '';
  let timerGeneration = 0;
  let field = null;
  let postmarkSequence = 0;
  let saveState = 'idle';   // idle | working | saved | unsupported | cancelled | failed
  let saveMessage = '';
  const pendingTimers = new Set();

  /* ---------------------------------------------------------------- utils */

  const escapeHtml = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const pad = (value) => String(value).padStart(2, '0');

  // release-v2 与 release-v1 同级，资源仍复用 v1 目录。
  const assetUrl = (path) => String(path);

  const CONTROL_RANGES = [
    [0x0000, 0x001f], [0x007f, 0x007f], [0x200b, 0x200d],
    [0x202a, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff],
  ];
  const isControlCodePoint = (codePoint) => CONTROL_RANGES
    .some(([start, end]) => codePoint >= start && codePoint <= end);

  const normalizeRecipientName = (value) => Array.from(String(value || '').normalize('NFC'))
    .filter((character) => !isControlCodePoint(character.codePointAt(0)))
    .join('')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 12);

  const recipientLabel = () => recipientName || '我的好朋友';
  const recipientGreeting = () => (recipientName ? `我亲爱的${recipientLabel()}` : '我亲爱的好朋友');

  const findScene = (sceneId) => data.scenes.find(({ id }) => id === sceneId);
  const findUniverse = (universeId) => data.universes.find(({ id }) => id === universeId);
  const findCarrier = (carrierId) => data.carriers.find(({ id }) => id === carrierId);
  const findDirection = (directionId) => data.directions.find(({ id }) => id === directionId);
  const findOption = (optionId) => {
    for (const question of data.questions) {
      const option = question.options.find(({ id }) => id === optionId);
      if (option) return { question, option };
    }
    return null;
  };

  // 返回的是「款式」（17 款之一）：既带档位共性，也带该款配色。
  const currentTier = () => (state.result
    ? rarity.get(state.result.rarity.styleId || state.result.rarity.tierId)
    : rarity.get('common'));

  const GILDED_LETTER_MESSAGE = Object.freeze({
    lead: '今天，好消息已经在路上了。',
    subtitle: '它们正穿过不同的时间线，排着队向你靠近。',
    body: '你认真做过的事、没有放弃的时刻，都正在变成新的机会、恰好的相遇和终于被看见的瞬间。先把今天过好，不用催促；属于你的那一份，会按自己的次序抵达。',
    tip: '宇宙提示：这封信抵达时，你的好事已经开始排队了。',
  });

  /**
   * 底层确定性结果始终保留；只有鎏金档在可见信件上覆盖一封完整彩蛋文案。
   * 其余 16 款继续逐字使用引擎给出的 edition.message。
   */
  const visibleLetterMessage = (tier, fallback) => (
    tier.tierId === 'gilded' ? GILDED_LETTER_MESSAGE : fallback
  );

  /**
   * 鎏金档的设定是「年份没能撑过这趟旅程」，邮戳盖的是 ∞。
   * 因此这一档的自述与落款也要与专属正文保持同一口径。
   */
  function letterVoice(tier, future, universe) {
    if (tier.tierId !== 'gilded') {
      return {
        universeLabel: universe.name,
        intro: future.futureSelfIntro,
        signoff: future.signoff,
        postmarkYear: future.futureYears,
      };
    }
    return {
      universeLabel: '未署名宇宙',
      intro: '我是另一个你。信走得太远，年份已经模糊，但这一条好消息被完整地保留下来。',
      signoff: '神秘',
      postmarkYear: null,
    };
  }

  function clearTimers() {
    timerGeneration += 1;
    pendingTimers.forEach((timer) => root.clearTimeout(timer));
    pendingTimers.clear();
  }

  function scheduleTask(callback, delay) {
    if (testMode || resetConfirmOpen) return;
    const generation = timerGeneration;
    const timer = root.setTimeout(() => {
      pendingTimers.delete(timer);
      if (generation === timerGeneration && !resetConfirmOpen) callback();
    }, delay);
    pendingTimers.add(timer);
  }

  function play(method) {
    if (audio && typeof audio[method] === 'function') {
      try { audio[method](); } catch (error) { /* 音频不可用时静默降级 */ }
    }
  }

  /* ------------------------------------------------------- shared markup */

  /** 模糊星球背景层。 */
  const cosmosMarkup = () => '<div class="cosmos" aria-hidden="true"><i></i><i></i><i></i><i></i></div>';

  /** 图集单元格是 1:1 正方形，实际裁切几何在渲染后按容器尺寸计算。 */
  function photoMarkup(asset, extra = '') {
    return `<span class="photo" role="img" aria-label="${escapeHtml(asset.alt)}" ${extra}>
      <img class="photo__img" src="${escapeHtml(assetUrl(asset.path))}" alt="" aria-hidden="true" draggable="false"
        data-col="${asset.column}" data-row="${asset.row}"
        data-asset-path="${escapeHtml(assetUrl(asset.path))}" data-asset-status="loading">
    </span>`;
  }

  /**
   * 封蜡上的浮雕纹章，随稀有度递增而更精致。
   * 用 stroke 而非 fill，蜡面凹刻的观感靠 .seal-mark 的双层阴影做出来。
   */
  const SEAL_EMBLEMS = {
    postal: '<circle cx="12" cy="12" r="7.2"/><path d="M4.4 12h15.2"/>',
    sprout: '<path d="M12 19V9.4"/><path d="M12 12.6C8.9 12.6 7.6 10.5 7.6 7.7c2.9 0 4.4 1.6 4.4 4.9z"/><path d="M12 13.8c3.1 0 4.4-2.1 4.4-4.9-2.9 0-4.4 1.6-4.4 4.9z"/>',
    star: '<path d="M12 3.6l1.9 6.5 6.5 1.9-6.5 1.9-1.9 6.5-1.9-6.5L3.6 12l6.5-1.9z"/>',
    constellation: '<circle cx="6.6" cy="8.4" r="1.5"/><circle cx="16.8" cy="6.6" r="1.2"/><circle cx="13.2" cy="16.8" r="1.6"/><path d="M7.8 9.3l4.6 6.2M8 7.8l7.6-1M16.4 8l-2.6 7.3"/>',
    compass: '<path d="M12 2.8l1.7 7.5 7.5 1.7-7.5 1.7-1.7 7.5-1.7-7.5L2.8 12l7.5-1.7z"/><path d="M17.6 6.4l-2.4 5 5-2.4M6.4 17.6l2.4-5-5 2.4"/><circle cx="12" cy="12" r="1.5"/>',
  };

  function sealEmblemMarkup(tier) {
    const glyph = SEAL_EMBLEMS[tier.envelope.emblem] || SEAL_EMBLEMS.postal;
    return `<span class="seal-mark"><svg viewBox="0 0 24 24" fill="none" stroke="var(--tier-seal-mark)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg></span>`;
  }

  function postmarkMarkup(tier, options = {}) {
    postmarkSequence += 1;
    const id = `pm${postmarkSequence}`;
    const year = options.year === null ? '∞' : String(options.year ?? '?');
    const suffix = options.year === null ? '年份不可考' : '年后寄达';
    const universe = options.universe || 'PARALLEL MAILBOX';
    const ghost = tier.doublePostmark && !options.single
      ? `<span class="postmark postmark--ghost" aria-hidden="true"><svg viewBox="0 0 140 140">
          <circle class="pm-ring" cx="70" cy="70" r="52"></circle>
          <circle class="pm-ring" cx="70" cy="70" r="41"></circle>
          <text class="pm-year" x="70" y="82" text-anchor="middle">${escapeHtml(year)}</text>
        </svg></span>`
      : '';
    return `${ghost}<span class="postmark" aria-hidden="true"><svg viewBox="0 0 140 140">
      <circle class="pm-ring" cx="70" cy="70" r="56"></circle>
      <circle class="pm-ring" cx="70" cy="70" r="45"></circle>
      <path id="${id}-top" d="M 14 70 A 56 56 0 0 1 126 70" fill="none"></path>
      <path id="${id}-bottom" d="M 26 96 A 56 56 0 0 0 114 96" fill="none"></path>
      <text class="pm-arc"><textPath href="#${id}-top" startOffset="50%" text-anchor="middle">PARALLEL MAILBOX</textPath></text>
      <text class="pm-arc"><textPath href="#${id}-bottom" startOffset="50%" text-anchor="middle">${escapeHtml(universe)}</textPath></text>
      <text class="pm-year" x="70" y="66" text-anchor="middle">${escapeHtml(year)}</text>
      <text class="pm-suffix" x="70" y="86" text-anchor="middle">${escapeHtml(suffix)}</text>
      <g class="pm-cancel">
        <line x1="0" y1="112" x2="140" y2="118"></line>
        <line x1="0" y1="120" x2="140" y2="126"></line>
        <line x1="0" y1="128" x2="140" y2="134"></line>
      </g>
    </svg></span>`;
  }

  /**
   * 信封：白纸底，形状与邮戳全部由 CSS / SVG 绘制，不使用信封贴图。
   * 稀有度只换封蜡色、纸边深浅、流光强度，纸永远是白的。
   */
  function envelopeMarkup(tier, options = {}) {
    const address = options.address
      ? `<span class="envelope__address"><small>TO</small><b>${escapeHtml(recipientLabel())}</b></span>`
      : '';
    const counter = options.counter
      ? `<span class="envelope__counter" data-envelope-counter aria-hidden="true">${pad(options.count || 0)} / ${pad(questionCount)}</span>`
      : '';
    const postmark = options.postmark ? postmarkMarkup(tier, options.postmark) : '';
    const seal = options.seal === false ? '' : `<span class="envelope__seal" aria-hidden="true">
        <span class="seal-half seal-half--left"></span>
        <span class="seal-half seal-half--right"></span>
        ${sealEmblemMarkup(tier)}
      </span>`;
    const letter = options.letter
      ? '<span class="envelope__letter" aria-hidden="true"><i></i><i></i><i></i><i></i></span>'
      : '';
    return `<div class="envelope${options.modifier ? ` envelope--${options.modifier}` : ''}" data-envelope data-tier="${escapeHtml(tier.tierId)}" data-variant="${escapeHtml(tier.variantId)}" data-style="${escapeHtml(tier.id)}"${options.label ? ` role="img" aria-label="${escapeHtml(options.label)}"` : ' aria-hidden="true"'}>
      ${letter}
      <span class="envelope__body">
        <span class="envelope__folds" aria-hidden="true">
          <i class="envelope__fold envelope__fold--left"></i>
          <i class="envelope__fold envelope__fold--right"></i>
          <i class="envelope__fold envelope__fold--bottom"></i>
        </span>
        <span class="envelope__sheen" aria-hidden="true"></span>
        ${postmark}
        ${address}
        ${counter}
      </span>
      <span class="envelope__mouth" data-envelope-mouth aria-hidden="true"></span>
      <span class="envelope__flap" aria-hidden="true"></span>
      ${seal}
    </div>`;
  }

  function soundToggleMarkup() {
    if (!audio || typeof audio.getState !== 'function') return '';
    const sound = audio.getState();
    return `<button class="icon-action" type="button" data-action="toggle-sound" data-sound-state="${sound.enabled ? 'on' : 'off'}" aria-pressed="${sound.enabled}" aria-label="${sound.enabled ? '关闭声音' : '开启声音'}">
      <img src="${assetUrl(sound.enabled ? './assets/ui/sound-on.svg' : './assets/ui/sound-off.svg')}" alt="" aria-hidden="true" draggable="false">
    </button>`;
  }

  function chromeMarkup(options = {}) {
    if (options.late) {
      const reset = '<button class="text-action" type="button" data-action="request-reset">重新开始</button>';
      return `<header class="chrome chrome--late">${reset}<span class="chrome__status">${escapeHtml(options.status || '')}</span>${soundToggleMarkup()}</header>`;
    }
    const left = options.back
      ? '<button class="text-action" type="button" data-action="back" aria-label="返回上一题">← 返回</button>'
      : '<span class="chrome__mark">平行信箱</span>';
    const right = options.reset
      ? '<button class="text-action" type="button" data-action="request-reset">重新开始</button>'
      : '<span class="chrome__mark">PARALLEL MAILBOX</span>';
    return `<header class="chrome">${left}${soundToggleMarkup()}${right}</header>`;
  }

  /* -------------------------------------------------------------- screens */

  /** 首页：模糊星球背景，文字压在画面下方。 */
  function introScreen() {
    const passage = data.intro;
    const lines = passage.titleLines || [passage.title];
    const blank = rarity.get('common');
    return `<section class="screen screen--intro" data-screen="intro" aria-labelledby="intro-title">
      ${cosmosMarkup()}
      <canvas class="screen__fx" data-fx data-fx-mode="stars" aria-hidden="true"></canvas>
      ${chromeMarkup({})}
      <div class="intro__floating-envelope" data-intro-floating-envelope aria-hidden="true">
        ${envelopeMarkup(blank, { modifier: 'float' })}
      </div>
      <div class="screen__main">
        <p class="eyebrow">${escapeHtml(passage.eyebrow)} · ${escapeHtml(passage.englishEyebrow)}</p>
        <h1 id="intro-title" data-autofocus tabindex="-1">${lines.map((line) => `<span>${escapeHtml(line)}</span>`).join('')}</h1>
        <p class="intro__method">${escapeHtml(passage.method)}</p>
        <p class="intro__hint">${escapeHtml(passage.resultHint)}</p>
        <p class="intro__trust">${escapeHtml(passage.trust)}</p>
      </div>
      <div class="screen__footer">
        <button class="primary-action" type="button" data-action="continue-to-recipient">下一步</button>
      </div>
    </section>`;
  }

  /** 昵称：内容居中。 */
  function recipientScreen() {
    return `<section class="screen screen--recipient screen--centered" data-screen="recipient" aria-labelledby="recipient-title">
      ${cosmosMarkup()}
      <canvas class="screen__fx" data-fx data-fx-mode="stars" aria-hidden="true"></canvas>
      ${chromeMarkup({})}
      <div class="screen__main">
        <p class="eyebrow">ADDRESS THIS LETTER</p>
        <h1 id="recipient-title" data-autofocus tabindex="-1">这封回信，寄给谁？</h1>
        <p class="recipient__intro">写个昵称，几年后的自己会这样称呼你。</p>
        <label class="field" for="recipient-name">
          <input id="recipient-name" name="recipient-name" type="text" maxlength="12" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="昵称（可不填）" value="${escapeHtml(recipientName)}" aria-describedby="recipient-note">
          <small id="recipient-note">留空称呼「我的好朋友」。昵称只在本次使用，刷新即清除。</small>
        </label>
      </div>
      <nav class="screen__footer screen__footer--split" aria-label="昵称步骤">
        <button class="text-action" type="button" data-action="back-to-intro">返回</button>
        <button class="primary-action" type="button" data-action="start">领取信封</button>
      </nav>
    </section>`;
  }

  /** 递交信封：内容居中。 */
  function handoverScreen() {
    const blank = outboundEnvelopeStyle;
    return `<section class="screen screen--handover screen--centered" data-screen="handover" aria-labelledby="handover-title">
      ${cosmosMarkup()}
      <canvas class="screen__fx" data-fx data-fx-mode="stars" aria-hidden="true"></canvas>
      ${chromeMarkup({ reset: true })}
      <div class="screen__main">
        <p class="eyebrow">YOUR ENVELOPE</p>
        <h1 id="handover-title" data-autofocus tabindex="-1">这是今晚的信封</h1>
        <div class="handover__stage">
          ${envelopeMarkup(blank, {
            modifier: 'handover',
            address: true,
            label: `写着「${recipientLabel()}」的空信封`,
            postmark: { year: '?', universe: '待寄出' },
          })}
        </div>
        <p class="handover__copy">接下来的 ${questionCount} 张照片，你选中的那张会直接落进它。装满以后，它会被寄往某一个平行宇宙。</p>
      </div>
      <div class="screen__footer">
        <button class="primary-action" type="button" data-action="accept-envelope">收下信封</button>
      </div>
    </section>`;
  }

  /** 选照片：两张照片上下排列，下方常驻信封，装信动画在同一页完成。 */
  function questionScreen() {
    const index = state.answers.length;
    const question = data.questions[index];
    const blank = outboundEnvelopeStyle;
    return `<section class="screen screen--question" data-screen="question" aria-labelledby="question-title">
      ${cosmosMarkup()}
      <canvas class="screen__fx" data-fx data-fx-mode="stars" aria-hidden="true"></canvas>
      ${chromeMarkup({ back: index > 0, reset: true })}
      <div class="question__head">
        <div class="progress" role="progressbar" aria-label="第 ${index + 1} 题，共 ${questionCount} 题" aria-valuemin="1" aria-valuemax="${questionCount}" aria-valuenow="${index + 1}">
          <i data-progress-fill></i>
        </div>
        <h1 id="question-title" data-autofocus tabindex="-1">${escapeHtml(question.prompt)}</h1>
        ${index === 0 ? '<p class="question__hint">没有正确答案，点更想停一下的那张。</p>' : ''}
      </div>
      <div class="pick-grid" data-pick-grid>
        ${question.options.map((option) => `<button class="pick-card" type="button" data-option-id="${escapeHtml(option.id)}" aria-label="选择并放入信封：${escapeHtml(option.title)}">
          ${photoMarkup(option.asset)}
          <span class="pick-card__copy">
            <strong>${escapeHtml(option.title)}</strong>
            <small>${escapeHtml(option.caption)}</small>
          </span>
        </button>`).join('')}
      </div>
      <div class="question__dock">
        ${envelopeMarkup(blank, {
          modifier: 'dock',
          counter: true,
          count: index,
          address: true,
          label: `已装入 ${index} / ${questionCount} 张照片的信封`,
        })}
        <p class="question__dock-copy">信封已收好 <b data-dock-count>${pad(index)} / ${pad(questionCount)}</b></p>
      </div>
    </section>`;
  }

  /** 寄往平行宇宙：星场加速，信封缩进虫洞。 */
  function sendingScreen() {
    const blank = outboundEnvelopeStyle;
    return `<section class="screen screen--sending" data-screen="sending" aria-busy="true" aria-labelledby="sending-title">
      ${cosmosMarkup()}
      <canvas class="screen__fx" data-fx data-fx-mode="warp" aria-hidden="true"></canvas>
      ${chromeMarkup({})}
      <div class="screen__main">
        <h1 id="sending-title" class="sr-only" data-autofocus tabindex="-1">正在把信寄往平行宇宙</h1>
        <div class="sending__stage">
          ${envelopeMarkup(blank, { modifier: 'launch', address: true, counter: true, count: questionCount })}
        </div>
        <p class="sending__stage-copy" data-sending-stage role="status" aria-live="polite">正在盖上今晚的邮戳…</p>
        <p class="sending__destination" data-sending-destination>搜寻可抵达的宇宙…</p>
      </div>
    </section>`;
  }

  /** 回信抵达：稀有度第一次揭晓，等用户亲手拆开。 */
  function deliveryScreen() {
    const tier = currentTier();
    const future = state.result.narrativeFuture;
    const universe = findUniverse(future.universeId);
    const voice = letterVoice(tier, future, universe);
    return `<section class="screen screen--delivery screen--centered" data-screen="delivery" data-tier="${escapeHtml(tier.tierId)}" data-variant="${escapeHtml(tier.variantId)}" aria-labelledby="delivery-title">
      ${cosmosMarkup()}
      <canvas class="screen__fx" data-fx data-fx-mode="ambient" aria-hidden="true"></canvas>
      ${chromeMarkup({ reset: true })}
      <div class="screen__main">
        <p class="eyebrow">A REPLY HAS ARRIVED</p>
        <h1 id="delivery-title" data-autofocus tabindex="-1">有一封信寄回来了</h1>
        <span class="rarity-badge rarity-badge--lg">${escapeHtml(tier.name)} · ${escapeHtml(tier.variantName)} · ${escapeHtml(state.result.rarity.percentLabel)}</span>
        <div class="delivery__stage">
          ${envelopeMarkup(tier, {
            modifier: 'reply',
            letter: true,
            label: `${tier.name}${tier.variantName}信封，来自${voice.universeLabel}`,
            postmark: { year: voice.postmarkYear, universe: voice.universeLabel },
          })}
        </div>
        <p class="delivery__lore">${escapeHtml(tier.lore)}</p>
      </div>
      <div class="screen__footer">
        <button class="primary-action" type="button" data-action="open-reply">拆开这封信</button>
      </div>
    </section>`;
  }

  /** 回信正文：白信纸从信封中心弹出，稀有度只改暗纹与描边。 */
  /** 稀有档起的纸面装饰：一道周期性反光 + 几粒闪点。普通档不渲染这两层。 */
  function letterEffectsMarkup(tier) {
    const shine = tier.letter.shimmer !== 'none' ? '<span class="letter__shine" aria-hidden="true"></span>' : '';
    const sparkles = tier.letter.sparkle
      ? '<span class="letter__sparkles" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>'
      : '';
    return shine + sparkles;
  }

  const universeTipMarkup = (message) => (
    message.tip
      ? `<p class="letter__universe-tip">${escapeHtml(message.tip)}</p>`
      : ''
  );

  function revealScreen() {
    const tier = currentTier();
    const scene = findScene(state.result.sceneId);
    const edition = state.result.edition;
    const future = state.result.narrativeFuture;
    const universe = findUniverse(future.universeId);
    const message = visibleLetterMessage(tier, edition.message);
    const sceneNumber = pad(data.scenes.indexOf(scene) + 1);
    const voice = letterVoice(tier, future, universe);
    return `<section class="screen screen--reveal" data-screen="reveal" data-tier="${escapeHtml(tier.tierId)}" data-variant="${escapeHtml(tier.variantId)}" data-result-scene="${escapeHtml(scene.id)}" data-parallel-universe="${escapeHtml(universe.id)}" data-future-years="${future.futureYears}" aria-labelledby="reveal-title">
      ${cosmosMarkup()}
      <canvas class="screen__fx" data-fx data-fx-mode="ambient" aria-hidden="true"></canvas>
      ${chromeMarkup({ late: true, reset: true, status: data.intro.englishEyebrow })}
      <div class="screen__main">
        <article class="letter" data-letter data-watermark="${escapeHtml(tier.letter.watermark)}" data-ornament="${escapeHtml(tier.letter.ornament)}" data-edge-glow="${escapeHtml(tier.letter.edgeGlow)}" data-shimmer="${escapeHtml(tier.letter.shimmer)}"${tier.letter.deckle ? ' data-deckle="true"' : ''}${tier.letter.sparkle ? ' data-sparkle="true"' : ''}${tier.tierId === 'gilded' ? ' data-special-letter="gilded"' : ''} aria-label="给${escapeHtml(recipientLabel())}的平行回信">
          ${letterEffectsMarkup(tier)}
          <header class="letter__head">
            <span class="rarity-badge">${escapeHtml(tier.name)} · ${escapeHtml(tier.variantName)} · ${escapeHtml(state.result.rarity.percentLabel)}</span>
            <span class="letter__origin">第 ${sceneNumber} / 16 封</span>
          </header>

          <figure class="letter__photo">
            ${photoMarkup(scene.asset)}
          </figure>

          <div class="letter__stamp">
            ${postmarkMarkup(tier, { year: voice.postmarkYear, universe: voice.universeLabel, single: true })}
          </div>

          <h1 id="reveal-title" class="letter__lead" data-autofocus tabindex="-1">${escapeHtml(message.lead)}</h1>
          <p class="letter__subtitle">${escapeHtml(message.subtitle)}</p>

          <div class="letter__body">
            <p class="letter__salutation">${escapeHtml(recipientGreeting())}：</p>
            <p class="letter__intro">${escapeHtml(voice.intro)}</p>
            <p class="letter__text">${escapeHtml(message.body)}</p>
            ${universeTipMarkup(message)}
          </div>

          <p class="letter__signature">${escapeHtml(voice.signoff)}</p>
        </article>
        <p class="letter__boundary">${escapeHtml(data.futureBoundary)}</p>
      </div>

      <nav class="screen__footer screen__footer--split" aria-label="继续查看这封平行回信">
        <button class="primary-action" type="button" data-action="view-evidence">看看怎么来的</button>
        <button class="secondary-action" type="button" data-action="open-card">截图模式</button>
      </nav>
    </section>`;
  }

  function evidenceScreen() {
    const tier = currentTier();
    const scene = findScene(state.result.sceneId);
    const message = visibleLetterMessage(tier, state.result.edition.message);
    const leadMatch = message.lead.match(/^今天[，,]\s*(.*)$/u);
    const leadTail = leadMatch ? leadMatch[1] : message.lead;
    const future = state.result.narrativeFuture;
    const universe = findUniverse(future.universeId);
    const voice = letterVoice(tier, future, universe);
    const evidence = engine.getEvidence(state.answers, state.result).slice(0, 2);
    return `<section class="screen screen--evidence" data-screen="evidence" data-tier="${escapeHtml(tier.tierId)}" data-variant="${escapeHtml(tier.variantId)}" aria-labelledby="evidence-title">
      ${cosmosMarkup()}
      <canvas class="screen__fx" data-fx data-fx-mode="ambient" aria-hidden="true"></canvas>
      ${chromeMarkup({ late: true, reset: true, status: 'WHY THIS LETTER' })}
      <div class="screen__main">
        <h2 class="evidence__origin-title">为什么寄回这张照片？</h2>
        <h1 id="evidence-title" class="evidence-hero__lead" data-autofocus tabindex="-1"><span>今天，</span><span>${escapeHtml(leadTail)}</span></h1>
        <p class="evidence__summary">来自「<b>${escapeHtml(voice.universeLabel)}</b>」的未来自己寄回了「<b>${escapeHtml(scene.title)}</b>」：${escapeHtml(message.subtitle)}</p>
        <div class="evidence__list">
          ${evidence.map((item, index) => `<article class="evidence-item">
            <span class="evidence-item__index" aria-hidden="true">0${index + 1}</span>
            ${photoMarkup(item.asset)}
            <div class="evidence-item__copy"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.reason)}</p></div>
          </article>`).join('')}
        </div>
        <figure class="evidence-result__painting" aria-label="来信附图：${escapeHtml(scene.title)}">
          <button class="artwork-zoom-trigger" type="button" data-action="open-artwork" data-artwork-origin="evidence" aria-label="放大查看来信附图：${escapeHtml(scene.title)}">
            ${photoMarkup(scene.asset)}
          </button>
          <figcaption class="sr-only">${escapeHtml(scene.title)}</figcaption>
        </figure>
        <aside class="evidence__note">仅供创意整理与娱乐参考，不是人格、运势或心理测试。</aside>
      </div>
      <nav class="screen__footer evidence__actions" aria-label="返回完整结果">
        <button class="primary-action evidence-return__button" type="button" data-action="return-to-result"><span class="evidence-return__arrow" aria-hidden="true">←</span><strong>回到我的平行回信</strong></button>
      </nav>
    </section>`;
  }

  function cardScreen() {
    const tier = currentTier();
    const scene = findScene(state.result.sceneId);
    const edition = state.result.edition;
    const future = state.result.narrativeFuture;
    const universe = findUniverse(future.universeId);
    const message = visibleLetterMessage(tier, edition.message);
    const voice = letterVoice(tier, future, universe);
    return `<section class="screen screen--card" data-screen="card" data-tier="${escapeHtml(tier.tierId)}" data-variant="${escapeHtml(tier.variantId)}" aria-labelledby="card-title">
      ${cosmosMarkup()}
      <canvas class="screen__fx" data-fx data-fx-mode="ambient" aria-hidden="true"></canvas>
      ${chromeMarkup({})}
      <div class="screen__main">
        <article class="letter letter--card" data-letter data-watermark="${escapeHtml(tier.letter.watermark)}" data-ornament="${escapeHtml(tier.letter.ornament)}" data-edge-glow="${escapeHtml(tier.letter.edgeGlow)}" data-shimmer="${escapeHtml(tier.letter.shimmer)}"${tier.letter.deckle ? ' data-deckle="true"' : ''}${tier.letter.sparkle ? ' data-sparkle="true"' : ''}${tier.tierId === 'gilded' ? ' data-special-letter="gilded"' : ''} data-autofocus tabindex="-1" aria-label="给${escapeHtml(recipientLabel())}的平行回信">
          ${letterEffectsMarkup(tier)}
          <header class="letter__head">
            <span class="rarity-badge">${escapeHtml(tier.name)} · ${escapeHtml(tier.variantName)} · ${escapeHtml(state.result.rarity.percentLabel)}</span>
            <span class="letter__origin">平行信箱 · ${escapeHtml(voice.universeLabel)}</span>
          </header>
          <div class="letter__keepsake">
            <figure class="letter__photo">${photoMarkup(scene.asset)}</figure>
            <figure class="letter__envelope" aria-label="这次收到的${escapeHtml(tier.name)}${escapeHtml(tier.variantName)}信封">
              ${envelopeMarkup(tier, {
                modifier: 'keepsake',
                seal: true,
                postmark: { year: voice.postmarkYear, universe: voice.universeLabel, single: true },
              })}
              <figcaption>${escapeHtml(tier.name)} · ${escapeHtml(tier.variantName)}</figcaption>
            </figure>
          </div>
          <div class="letter__stamp">
            ${postmarkMarkup(tier, { year: voice.postmarkYear, universe: voice.universeLabel, single: true })}
          </div>
          <h1 id="card-title" class="letter__lead">${escapeHtml(message.lead)}</h1>
          <p class="letter__subtitle">${escapeHtml(message.subtitle)}</p>
          <div class="letter__body">
            <p class="letter__salutation">${escapeHtml(recipientGreeting())}：</p>
            <p class="letter__intro">${escapeHtml(voice.intro)}</p>
            <p class="letter__text">${escapeHtml(message.body)}</p>
            ${universeTipMarkup(message)}
          </div>
          <p class="letter__signature">${escapeHtml(voice.signoff)}</p>
          <footer class="letter__footer"><span>由今晚 ${questionCount} 次图片选择生成</span><small>平行故事，不预测真实未来</small></footer>
        </article>
      </div>
      <nav class="screen__footer" aria-label="保存这封回信">
        <button class="primary-action" type="button" data-action="save-card" data-save-button>保存到相册</button>
        <p class="save-status" data-save-status role="status" aria-live="polite">${escapeHtml(saveStatusCopy())}</p>
        <button class="text-action" type="button" data-action="return-to-result">返回</button>
      </nav>
    </section>`;
  }

  function resetDialog() {
    if (!resetConfirmOpen) return '';
    return `<div class="modal-layer" role="presentation">
      <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <p class="eyebrow">EMPTY THE ENVELOPE?</p>
        <h2 id="reset-title">重新开始吗？</h2>
        <p>今晚这 ${questionCount} 次选择、昵称、信封和当前平行回信都会清空。</p>
        <div class="dialog__actions">
          <button class="danger-action" type="button" data-action="confirm-reset" data-autofocus>重新开始</button>
          <button class="secondary-action" type="button" data-action="cancel-reset">继续看看</button>
        </div>
      </section>
    </div>`;
  }

  function artworkLightbox() {
    if (!artworkZoomOpen || !state.result || state.phase !== 'evidence') return '';
    const scene = findScene(state.result.sceneId);
    if (!scene) return '';
    return `<div class="artwork-lightbox__layer" role="presentation">
      <button class="artwork-lightbox__backdrop" type="button" data-action="close-artwork" tabindex="-1" aria-label="关闭放大的来信附图"></button>
      <section class="artwork-lightbox" data-artwork-lightbox role="dialog" aria-modal="true" aria-labelledby="artwork-lightbox-title" aria-describedby="artwork-lightbox-hint">
        <button class="artwork-lightbox__close" type="button" data-action="close-artwork" data-autofocus aria-label="关闭放大的来信附图">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"></path></svg>
        </button>
        <button class="artwork-lightbox__image" type="button" data-action="close-artwork" data-artwork-zoom-frame aria-label="关闭放大的来信附图">
          ${photoMarkup(scene.asset)}
        </button>
        <p class="artwork-lightbox__kicker">来自平行宇宙的照片</p>
        <h2 id="artwork-lightbox-title">${escapeHtml(scene.title)}</h2>
        <p id="artwork-lightbox-hint" class="artwork-lightbox__hint">轻触画面或空白处关闭</p>
      </section>
    </div>`;
  }

  const SAVE_COPY = {
    idle: '一键保存这封回信到手机相册',
    working: '正在生成图片…',
    saved: '已保存到相册',
    unsupported: '当前环境不支持直接保存，请用手机系统截图',
    cancelled: '已取消保存',
    failed: '保存失败，请改用手机系统截图',
  };

  function saveStatusCopy() {
    return SAVE_COPY[saveState] || SAVE_COPY.idle;
  }

  function setSaveState(next, message) {
    saveState = next;
    saveMessage = message || '';
    const status = mount.querySelector('[data-save-status]');
    const button = mount.querySelector('[data-save-button]');
    if (status) status.textContent = saveStatusCopy();
    if (button) {
      button.disabled = saveState === 'working';
      button.textContent = saveState === 'saved' ? '再存一次' : '保存到相册';
    }
    announcement = saveStatusCopy();
    const live = mount.querySelector('[data-live-region]');
    if (live) live.textContent = announcement;
  }

  /**
   * 保存到相册。必须由用户主动点击触发（容器要求），
   * 且要覆盖进行中 / 成功 / 取消 / 不支持 / 失败五种状态。
   */
  async function saveCardToAlbum() {
    if (!state.result || saveState === 'working') return;
    if (!shareCard) {
      setSaveState('unsupported');
      return;
    }
    setSaveState('working');
    try {
      const tier = currentTier();
      const scene = findScene(state.result.sceneId);
      const future = state.result.narrativeFuture;
      const universe = findUniverse(future.universeId);
      const canvas = await shareCard.render({
        tier,
        scene,
        voice: letterVoice(tier, future, universe),
        message: visibleLetterMessage(tier, state.result.edition.message),
        recipient: recipientGreeting(),
        sceneNumber: pad(data.scenes.indexOf(scene) + 1),
        questionCount,
        percentLabel: state.result.rarity.percentLabel,
        photoSrc: assetUrl(scene.asset.path),
      });
      const outcome = await shareCard.saveToAlbum(canvas);
      setSaveState(outcome.status, outcome.message);
    } catch (error) {
      setSaveState('failed', String((error && error.message) || error));
    }
  }

  function screenMarkup() {
    if (state.phase === 'intro') return introStep === 'recipient' ? recipientScreen() : introScreen();
    if (state.phase === 'handover') return handoverScreen();
    if (state.phase === 'question') return questionScreen();
    if (state.phase === 'sending') return sendingScreen();
    if (state.phase === 'delivery') return deliveryScreen();
    if (state.phase === 'reveal') return revealScreen();
    if (state.phase === 'evidence') return evidenceScreen();
    if (state.phase === 'card') return cardScreen();
    return '<section class="screen"><h1>这封平行回信暂时打不开</h1></section>';
  }

  /* ------------------------------------------------------------ rendering */

  function applyTierVariables(node, tier) {
    const style = node.style;
    style.setProperty('--tier-env-paper', tier.envelope.paper);
    style.setProperty('--tier-env-flap', tier.envelope.flap);
    style.setProperty('--tier-env-ink', tier.envelope.ink);
    style.setProperty('--tier-env-blend', tier.envelope.blend);
    style.setProperty('--tier-seal-mark', tier.envelope.sealMark);
    style.setProperty('--tier-env-lining', tier.envelope.lining);
    style.setProperty('--tier-seal', tier.seal);
    style.setProperty('--tier-accent', tier.accent);
    style.setProperty('--tier-watermark-ink', tier.accent);
    style.setProperty('--tier-edge', tier.edge);
    style.setProperty('--tier-halo', tier.halo);
    style.setProperty('--tier-sheen', String(tier.sheen));
    // 必须显式清除：首页信封会反复换档，只加不删会把上一档的发光粘在元素上
    if (tier.sealGlow) node.dataset.sealGlow = 'true';
    else delete node.dataset.sealGlow;
  }

  function layoutPhotoAtlas(photo) {
    if (!photo || !photo.isConnected) return;
    const image = photo.querySelector('.photo__img');
    if (!image) return;
    // clientWidth/clientHeight describe layout geometry without the letter's
    // entrance transform. getBoundingClientRect() would capture scale(.08)
    // during the first reveal frame and permanently shrink the atlas crop.
    const width = photo.clientWidth;
    const height = photo.clientHeight;
    if (!width || !height) return;

    const cellSize = Math.max(width, height);
    const column = Number(image.dataset.col) || 0;
    const row = Number(image.dataset.row) || 0;
    image.style.setProperty('width', `${cellSize * 2}px`);
    image.style.setProperty('height', `${cellSize * 2}px`);
    image.style.setProperty('left', `${width / 2 - (column + 0.5) * cellSize}px`);
    image.style.setProperty('top', `${height / 2 - (row + 0.5) * cellSize}px`);
  }

  function layoutPhotoAtlases(scope = mount) {
    const photos = [];
    if (scope && typeof scope.matches === 'function' && scope.matches('.photo')) photos.push(scope);
    if (scope && typeof scope.querySelectorAll === 'function') {
      scope.querySelectorAll('.photo').forEach((photo) => photos.push(photo));
    }
    photos.forEach(layoutPhotoAtlas);
  }

  /**
   * 首页信封每 1.4s 换一款，循环展示全部 17 款（一圈约 24 秒）。
   * 节奏要留出「看清这一封」的停顿：换档淡入 420ms，之后约 1 秒静止；
   * 更快会读成闪烁而不是轮播。
   * 用意是在进入流程前就先让人看到「信封是有不同款式的」。
   *
   * 只换 CSS 变量 + 封蜡纹章，不重建 DOM——重建会打断 intro-envelope-drift 的漂浮，
   * 也会让 aria-hidden 的装饰节点反复进出无障碍树。
   * reduce-motion 下完全不启动：每秒两次的换色属于典型的需要被关掉的装饰动效。
   */
  const introEnvelopeCycleMs = 1400;
  let introEnvelopeTimer = 0;

  function stopIntroEnvelopeCycle() {
    if (introEnvelopeTimer) root.clearInterval(introEnvelopeTimer);
    introEnvelopeTimer = 0;
  }

  function paintIntroEnvelope(node, style) {
    applyTierVariables(node, style);
    node.dataset.tier = style.tierId;
    node.dataset.variant = style.variantId;
    node.dataset.style = style.id;
    const emblem = node.querySelector('.seal-mark svg');
    if (emblem) emblem.innerHTML = SEAL_EMBLEMS[style.envelope.emblem] || SEAL_EMBLEMS.postal;
    // 重启淡入动画：背景是渐变，无法用 transition 插值，只能靠一次淡入把硬切藏起来
    node.classList.remove('is-swapping');
    void node.offsetWidth;
    node.classList.add('is-swapping');
  }

  function startIntroEnvelopeCycle() {
    stopIntroEnvelopeCycle();
    if (reduceMotion) return;
    const node = mount.querySelector('[data-intro-floating-envelope] .envelope');
    if (!node) return;
    let index = rarity.styles.findIndex((style) => style.id === node.dataset.style);
    introEnvelopeTimer = root.setInterval(() => {
      if (!node.isConnected) {
        stopIntroEnvelopeCycle();
        return;
      }
      index = (index + 1) % rarity.styles.length;
      paintIntroEnvelope(node, rarity.styles[index]);
    }, introEnvelopeCycleMs);
  }

  function activateAssets() {
    mount.querySelectorAll('img[data-asset-status]').forEach((node) => {
      const settle = (ready) => {
        if (node.isConnected) node.dataset.assetStatus = ready ? 'ready' : 'failed';
      };
      if (node.complete) {
        settle(node.naturalWidth > 0);
        return;
      }
      node.addEventListener('load', () => settle(true), { once: true });
      node.addEventListener('error', () => settle(false), { once: true });
    });
  }

  function activateFx() {
    if (field) {
      field.stop();
      field = null;
    }
    const canvas = mount.querySelector('[data-fx]');
    if (!canvas) return;
    const tier = currentTier();
    field = fx.createField(canvas, {
      reduceMotion,
      starColor: state.phase === 'sending' ? 'rgba(226, 232, 245, 0.9)' : 'rgba(200, 205, 220, 0.4)',
    });
    const mode = canvas.dataset.fxMode;
    if (mode === 'warp') {
      field.enableStarfield(220);
      field.setWarp(0.05);
    } else {
      field.enableStarfield(mode === 'stars' ? 60 : 40);
      field.setWarp(0);
      if (mode === 'ambient') field.setAmbient(tier.particles);
    }
    if (reduceMotion) {
      field.resize();
      return;
    }
    field.start();
  }

  function focusCurrentTask() {
    const target = artworkZoomOpen
      ? mount.querySelector('[data-artwork-lightbox] [data-autofocus]')
      : resetConfirmOpen
        ? mount.querySelector('[role="dialog"] [data-autofocus]')
        : null;
    if (!target) return;
    target.focus({ preventScroll: true });
  }

  /**
   * iPhone 刘海 / 灵动岛安全区与小红书宿主控制带会叠加占高。
   * 用真实解析后的像素值做标记，仅压缩鎏金长信，不让 Android 或普通回信跟着变小。
   */
  function syncSafeAreaLayoutMode() {
    const probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:var(--safe-top);padding-bottom:var(--safe-bottom);';
    document.body.appendChild(probe);
    const computed = root.getComputedStyle(probe);
    const safeTop = Number.parseFloat(computed.paddingTop) || 0;
    const safeBottom = Number.parseFloat(computed.paddingBottom) || 0;
    probe.remove();
    document.documentElement.dataset.condensedSafeArea = String(
      safeTop >= 40 || safeTop + safeBottom >= 64,
    );
  }

  function render(options = {}) {
    syncSafeAreaLayoutMode();
    const inert = resetConfirmOpen || artworkZoomOpen ? ' inert' : '';
    mount.innerHTML = `<div class="app-content" data-app-content${inert}>${screenMarkup()}</div>
      <div class="sr-only" aria-live="polite" aria-atomic="true" data-live-region>${escapeHtml(announcement)}</div>
      ${resetDialog()}
      ${artworkLightbox()}`;
    document.body.classList.toggle('artwork-zoom-active', artworkZoomOpen);

    const screen = mount.querySelector('.screen');
    if (screen) applyTierVariables(screen, currentTier());
    mount.querySelectorAll('[data-envelope]').forEach((node) => {
      applyTierVariables(node, rarity.get(node.dataset.style || node.dataset.tier));
    });

    const fill = mount.querySelector('[data-progress-fill]');
    if (fill) fill.style.setProperty('width', `${(state.answers.length / questionCount) * 100}%`);

    layoutPhotoAtlases();
    activateAssets();
    activateFx();
    if (state.phase === 'intro' && introStep !== 'recipient') startIntroEnvelopeCycle();
    else stopIntroEnvelopeCycle();
    if (options.focus !== false) focusCurrentTask();
  }

  /* ------------------------------------------------------------ sequences */

  /** 选照片 → 照片沿曲线飞进信封 → 换下一题，全部在同一界面完成。 */
  function transferPhotoIntoEnvelope(card, optionId) {
    if (transferInFlight) return;
    const photo = card.querySelector('.photo');
    const mouth = mount.querySelector('[data-envelope-mouth]');
    const envelope = mount.querySelector('.envelope--dock');
    if (!photo || !mouth || !envelope || reduceMotion || testMode || typeof photo.animate !== 'function') {
      dispatch({ type: 'CHOOSE', optionId });
      return;
    }

    transferInFlight = true;
    play('playPhotoPick');
    const flightMs = slowMotion ? 2460 : 820;

    const from = photo.getBoundingClientRect();
    const to = mouth.getBoundingClientRect();
    const clone = photo.cloneNode(true);
    clone.classList.add('flying-photo');
    clone.style.setProperty('left', `${from.left}px`);
    clone.style.setProperty('top', `${from.top}px`);
    clone.style.setProperty('width', `${from.width}px`);
    clone.style.setProperty('height', `${from.height}px`);
    document.body.appendChild(clone);
    layoutPhotoAtlases(clone);

    // 原图立刻藏起来：飞的必须是「这张照片本身」。
    // 否则原图还留在原位，整个动作会读成「复制了一张」，而不是「放进信封了」。
    photo.style.setProperty('visibility', 'hidden');
    card.dataset.picked = 'true';
    const sibling = [...mount.querySelectorAll('.pick-card')].find((node) => node !== card);
    if (sibling) sibling.dataset.dismissed = 'true';

    // 信封先掀盖等着，照片到嘴边再合上——有「张口／吞下」两拍才看得懂。
    envelope.dataset.receiving = 'true';

    const deltaX = (to.left + to.width / 2) - (from.left + from.width / 2);
    const deltaY = (to.top + to.height / 2) - (from.top + from.height / 2);
    const targetScale = Math.max(0.16, Math.min(to.width / from.width, 0.34));

    // 信封通常正对着照片正下方，deltaX 接近 0。纯竖直下落读起来很呆，
    // 所以按点的是上面还是下面那张，给一个横向摆幅和倾角，像被手抛进去。
    const fromTop = card === mount.querySelector('.pick-card');
    const swing = (fromTop ? -1 : 1) * 26;
    const tilt = (fromTop ? -1 : 1) * 10;
    // 弧线走横向摆动，不去削竖直进度：
    // 之前把弧顶从竖直位移里减掉，导致一半时间只走了三成路、剩下的一瞬间窜完，
    // 观感就是「原地缩一下就没了」。现在竖直方向接近匀速，横向鼓出一道弯。
    const animation = clone.animate([
      { transform: 'translate(0px, 0px) scale(1) rotate(0deg)', opacity: 1, offset: 0, easing: 'cubic-bezier(.2,.7,.4,1)' },
      { transform: `translate(${swing * 0.5}px, -14px) scale(1.05) rotate(${tilt * 0.35}deg)`, opacity: 1, offset: 0.12, easing: 'cubic-bezier(.42,0,.58,1)' },
      { transform: `translate(${deltaX * 0.2 + swing}px, ${deltaY * 0.34}px) scale(0.7) rotate(${tilt}deg)`, opacity: 1, offset: 0.45, easing: 'linear' },
      { transform: `translate(${deltaX * 0.6 + swing * 0.45}px, ${deltaY * 0.7}px) scale(0.46) rotate(${tilt * 0.5}deg)`, opacity: 1, offset: 0.72, easing: 'cubic-bezier(.4,0,.7,1)' },
      { transform: `translate(${deltaX}px, ${deltaY}px) scale(${targetScale}) rotate(2deg)`, opacity: 1, offset: 0.9, easing: 'ease-in' },
      { transform: `translate(${deltaX}px, ${deltaY + 18}px) scale(${targetScale * 0.78}) rotate(2deg)`, opacity: 0, offset: 1 },
    ], { duration: flightMs, fill: 'forwards' });

    // 飞行照片到达信封上沿后，交接给信封内部的同图层。
    // 内部图层位于 envelope body 之后：露在上沿的部分仍看得见，
    // 向下移动时则被纸张前片自然遮住，动作才会读成“进入”而不是“碰到后消失”。
    let incomingPhoto = null;
    scheduleTask(() => {
      if (!clone.isConnected || incomingPhoto) return;
      incomingPhoto = photo.cloneNode(true);
      incomingPhoto.classList.add('envelope__incoming-photo');
      incomingPhoto.setAttribute('aria-hidden', 'true');
      incomingPhoto.style.removeProperty('visibility');
      envelope.insertBefore(incomingPhoto, envelope.querySelector('.envelope__body'));
      layoutPhotoAtlases(incomingPhoto);
      clone.style.setProperty('visibility', 'hidden');

      incomingPhoto.animate([
        { transform: 'translate(-50%, -8%) scale(1.04) rotate(2deg)', opacity: 1, offset: 0 },
        { transform: 'translate(-50%, -8%) scale(1) rotate(1deg)', opacity: 1, offset: 0.72 },
        { transform: 'translate(-50%, 34%) scale(0.78) rotate(1deg)', opacity: 1, offset: 0.9 },
        { transform: 'translate(-50%, 58%) scale(0.66) rotate(0deg)', opacity: 0 },
      ], {
        duration: Math.round(flightMs * 0.3),
        easing: 'cubic-bezier(.36,0,.7,1)',
        fill: 'forwards',
      });
    }, Math.round(flightMs * 0.78));

    scheduleTask(() => {
      delete envelope.dataset.receiving;
      envelope.dataset.swallow = 'true';
      const counter = mount.querySelector('[data-envelope-counter]');
      const dockCount = mount.querySelector('[data-dock-count]');
      const next = pad(state.answers.length + 1);
      if (counter) counter.textContent = `${next} / ${pad(questionCount)}`;
      if (dockCount) dockCount.textContent = `${next} / ${pad(questionCount)}`;
      play('playAdvance');
    }, Math.round(flightMs * 0.98));

    // 动画可能被暂停或中断（页面切到后台、系统降级），因此不能只依赖 onfinish：
    // 无论如何都要在兜底时限内推进流程，否则整局会卡在这一题上。
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      clone.remove();
      if (incomingPhoto) incomingPhoto.remove();
      transferInFlight = false;
      dispatch({ type: 'CHOOSE', optionId });
    };
    // 飞行结束后继续留足「合盖 360ms → 贴蜡 180ms」的完整时间，
    // 否则换题重渲染会在合盖中途替换 DOM，造成圆章闪两次。
    animation.onfinish = () => root.setTimeout(settle, 620);
    animation.oncancel = settle;
    root.setTimeout(settle, flightMs + 700);
  }

  /** 寄出序列：星场加速 → 信封缩进虫洞 → 抽稀有度 → 回信抵达。 */
  function runSendingSequence() {
    const future = engine.deriveNarrativeFuture(state.answers);
    const universe = findUniverse(future.universeId);
    const envelope = mount.querySelector('.envelope--launch');
    const stage = mount.querySelector('[data-sending-stage]');
    const destination = mount.querySelector('[data-sending-destination]');
    const stages = ['正在盖上今晚的邮戳…', '信已离开这条生活线…', '正在穿过宇宙之间的夜…'];
    const candidates = data.universes.map(({ name }) => name);

    if (testMode) {
      dispatch({ type: 'SEND_DONE', tier: forcedTierId ? rarity.get(forcedTierId) : undefined });
      return;
    }

    if (field) field.setWarp(0.34);
    if (envelope) envelope.dataset.launch = 'true';

    scheduleTask(() => { if (stage) stage.textContent = stages[1]; }, 900);
    scheduleTask(() => { if (stage) stage.textContent = stages[2]; }, 1900);
    if (field) scheduleTask(() => field.setWarp(0.9), 1200);

    // 依次掠过几个候选宇宙，最后落在由选择决定的那一个。
    candidates.forEach((name, index) => {
      scheduleTask(() => {
        if (destination) destination.textContent = `搜寻中… ${name}`;
      }, 500 + index * 320);
    });
    scheduleTask(() => {
      if (destination) {
        destination.textContent = `已锁定「${universe.name}」`;
        destination.dataset.locked = 'true';
      }
    }, 500 + candidates.length * 320);

    scheduleTask(() => {
      const tier = forcedTierId ? rarity.get(forcedTierId) : rarity.draw();
      dispatch({ type: 'SEND_DONE', tier });
    }, 3400);
  }

  /** 拆信序列：封蜡崩裂 → 粒子迸发 → 掀盖 → 抽出信纸 → 结果从信封中心弹出。 */
  function runOpenSequence() {
    if (openingReply) return;
    const envelope = mount.querySelector('.envelope--reply');
    if (!envelope || reduceMotion || testMode) {
      dispatch({ type: 'OPEN_REPLY' });
      return;
    }

    openingReply = true;
    const tier = currentTier();
    play('playPaperOpen');
    envelope.dataset.open = 'true';

    if (field) {
      const seal = envelope.querySelector('.envelope__seal');
      const canvas = mount.querySelector('[data-fx]');
      if (seal && canvas) {
        const sealRect = seal.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const x = sealRect.left - canvasRect.left + sealRect.width / 2;
        const y = sealRect.top - canvasRect.top + sealRect.height / 2;
        scheduleTask(() => field.burst(x, y, tier.particles, 1), 90);
        scheduleTask(() => field.burst(x, y - 6, tier.particles, 0.5), 280);
        if (tier.tierId === 'gilded' || tier.tierId === 'legend') {
          scheduleTask(() => field.rain(tier.particles, 0.8), 520);
        }
      }
    }

    // 同上：拆信同样用不受 clearTimers 影响的兜底计时，避免停在半开状态。
    root.setTimeout(() => {
      if (state.phase !== 'delivery') return;
      openingReply = false;
      dispatch({ type: 'OPEN_REPLY' });
    }, 1250);
  }

  function schedulePhase() {
    if (state.phase === 'sending') runSendingSequence();
  }

  /* -------------------------------------------------------------- actions */

  function dispatch(action) {
    if (action && action.type === 'RESET') {
      introStep = 'landing';
      recipientName = '';
      outboundEnvelopeStyle = drawCommonEnvelopeStyle();
      artworkZoomOpen = false;
      artworkZoomOrigin = null;
      transferInFlight = false;
      openingReply = false;
    }
    const next = flow.reduce(state, action);
    if (next === state) return state;
    clearTimers();
    state = next;

    if (action.type === 'CHOOSE') {
      const entry = findOption(action.optionId);
      announcement = entry
        ? `已将「${entry.option.title}」放进信封，第 ${state.answers.length} / ${questionCount} 张。`
        : '';
    } else if (state.phase === 'delivery') {
      announcement = `收到一封${state.result.rarity.tierName}信封的回信。`;
    } else if (state.phase === 'reveal') {
      announcement = `来自「${state.result.narrativeFuture.universeName}」里 ${state.result.narrativeFuture.futureYears} 年后的自己。`;
    } else {
      announcement = '';
    }

    render();
    schedulePhase();
    return state;
  }

  function syncSoundControls() {
    if (!audio || typeof audio.getState !== 'function') return;
    const sound = audio.getState();
    mount.querySelectorAll('[data-action="toggle-sound"]').forEach((control) => {
      control.dataset.soundState = sound.enabled ? 'on' : 'off';
      control.setAttribute('aria-pressed', String(sound.enabled));
      control.setAttribute('aria-label', sound.enabled ? '关闭声音' : '开启声音');
      const icon = control.querySelector('img');
      if (icon) icon.setAttribute('src', assetUrl(sound.enabled ? './assets/ui/sound-on.svg' : './assets/ui/sound-off.svg'));
    });
  }

  function openArtwork(trigger) {
    if (!state.result || state.phase !== 'evidence') return;
    play('playPaperOpen');
    artworkZoomOrigin = trigger.dataset.artworkOrigin || state.phase;
    artworkZoomOpen = true;
    render({ focus: true });
  }

  function closeArtwork(restoreFocus) {
    const origin = artworkZoomOrigin;
    artworkZoomOpen = false;
    artworkZoomOrigin = null;
    render({ focus: !restoreFocus });
    if (restoreFocus && origin === state.phase) {
      const trigger = mount.querySelector(`[data-artwork-origin="${CSS.escape(origin)}"]`);
      if (trigger) trigger.focus({ preventScroll: true });
    }
  }

  async function activateControl(control) {
    const action = control.dataset.action;
    const optionId = control.dataset.optionId;

    if (resetConfirmOpen) {
      if (action === 'cancel-reset') {
        resetConfirmOpen = false;
        render();
        schedulePhase();
      }
      if (action === 'confirm-reset') {
        resetConfirmOpen = false;
        dispatch({ type: 'RESET' });
      }
      return;
    }

    if (artworkZoomOpen) {
      if (action === 'close-artwork') closeArtwork(true);
      return;
    }

    if (action === 'open-artwork') {
      openArtwork(control);
      return;
    }

    if (action === 'toggle-sound') {
      if (audio && typeof audio.toggle === 'function') {
        await audio.toggle();
        syncSoundControls();
      }
      return;
    }
    if (action === 'continue-to-recipient') {
      play('playAdvance');
      introStep = 'recipient';
      render();
      return;
    }
    if (action === 'back-to-intro') {
      introStep = 'landing';
      render();
      return;
    }
    if (action === 'start') {
      const input = mount.querySelector('#recipient-name');
      recipientName = normalizeRecipientName(input ? input.value : recipientName);
      play('playAdvance');
      dispatch({ type: 'START' });
      return;
    }
    if (action === 'accept-envelope') {
      play('playAdvance');
      dispatch({ type: 'ACCEPT_ENVELOPE' });
      return;
    }
    if (action === 'save-card') {
      await saveCardToAlbum();
      return;
    }
    if (action === 'open-reply') {
      runOpenSequence();
      return;
    }
    if (action === 'request-reset') {
      clearTimers();
      resetConfirmOpen = true;
      render();
      return;
    }

    if (optionId) {
      transferPhotoIntoEnvelope(control, optionId);
      return;
    }
    if (action === 'back') dispatch({ type: 'BACK' });
    if (action === 'view-evidence') dispatch({ type: 'VIEW_EVIDENCE' });
    if (action === 'open-card') { saveState = 'idle'; dispatch({ type: 'OPEN_CARD' }); }
    if (action === 'return-to-result') dispatch({ type: 'RETURN_TO_RESULT' });
  }

  /* --------------------------------------------------------------- events */

  function mountedButtonFromTarget(target) {
    const targetElement = target && typeof target.closest === 'function'
      ? target
      : target && target.parentElement;
    const control = targetElement ? targetElement.closest('button') : null;
    return control && mount.contains(control) ? control : null;
  }

  let primaryTouchPointer = null;
  let compatibilityClick = null;
  const compatibilityClickWindowMs = 800;
  const compatibilityClickRadiusPx = 32;

  mount.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    const control = mountedButtonFromTarget(event.target);
    primaryTouchPointer = control
      ? { pointerId: event.pointerId, control }
      : null;
  }, { passive: true });

  mount.addEventListener('pointercancel', (event) => {
    if (primaryTouchPointer && primaryTouchPointer.pointerId === event.pointerId) {
      primaryTouchPointer = null;
    }
  }, { passive: true });

  mount.addEventListener('pointerup', (event) => {
    if (
      event.pointerType !== 'touch'
      || !event.isPrimary
      || !primaryTouchPointer
      || primaryTouchPointer.pointerId !== event.pointerId
    ) return;

    const control = mountedButtonFromTarget(event.target);
    const rememberedControl = primaryTouchPointer.control;
    primaryTouchPointer = null;
    if (!control || control !== rememberedControl) return;

    compatibilityClick = {
      clientX: event.clientX,
      clientY: event.clientY,
      expiresAt: performance.now() + compatibilityClickWindowMs,
    };
    void activateControl(control);
  }, { passive: true });

  mount.addEventListener('click', (event) => {
    const control = mountedButtonFromTarget(event.target);
    if (!control) return;

    if (event.detail !== 0 && compatibilityClick) {
      const expired = performance.now() > compatibilityClick.expiresAt;
      const distance = Math.hypot(
        event.clientX - compatibilityClick.clientX,
        event.clientY - compatibilityClick.clientY,
      );
      if (!expired && distance <= compatibilityClickRadiusPx) {
        compatibilityClick = null;
        event.preventDefault();
        return;
      }
      if (expired) compatibilityClick = null;
    }

    void activateControl(control);
  });

  document.addEventListener('keydown', (event) => {
    if (artworkZoomOpen) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeArtwork(true);
        return;
      }
      if (event.key === 'Tab') {
        const focusable = [...mount.querySelectorAll('[data-artwork-lightbox] button:not([disabled]):not([tabindex="-1"])')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      event.preventDefault();
      return;
    }

    if (resetConfirmOpen && event.key === 'Escape') {
      event.preventDefault();
      resetConfirmOpen = false;
      render();
      schedulePhase();
    }
  });

  root.addEventListener('resize', () => {
    syncSafeAreaLayoutMode();
    if (field) field.resize();
    layoutPhotoAtlases();
  }, { passive: true });

  // 页面不滚动，软键盘弹出时靠这个内边距把居中内容顶上去。
  if (root.visualViewport) {
    const syncKeyboardInset = () => {
      const inset = Math.max(0, root.innerHeight - root.visualViewport.height - root.visualViewport.offsetTop);
      document.documentElement.style.setProperty('--keyboard', `${Math.round(inset)}px`);
      if (field) field.resize();
      layoutPhotoAtlases();
    };
    root.visualViewport.addEventListener('resize', syncKeyboardInset, { passive: true });
    root.visualViewport.addEventListener('scroll', syncKeyboardInset, { passive: true });
  }

  ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
    document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
  });
  document.addEventListener('touchmove', (event) => {
    if (event.touches && event.touches.length > 1) event.preventDefault();
  }, { passive: false });

  if (testMode) {
    root.__PARALLEL_MAILBOX_V2_TEST__ = Object.freeze({
      getState: () => state,
      dispatch,
      introEnvelopeCycleMs,
      introEnvelopeCycleOrder: rarity.styles.map((style) => style.id),
      rarity,
      flow,
    });
  }

  render();
  schedulePhase();
})(typeof globalThis !== 'undefined' ? globalThis : this);
