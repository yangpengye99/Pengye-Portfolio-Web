// 六出凝华：入境 → 择器 → 凝花（六次·俯视静置） → 取景（旋转找角度） → 成章。
(function bootstrapLiuchuNinghua() {
  'use strict';

  const core = window.LCN;
  const app = document.getElementById('app');
  const scenes = {
    entry: document.getElementById('scene-entry'),
    select: document.getElementById('scene-select'),
    archive: document.getElementById('scene-archive'),
    create: document.getElementById('scene-create'),
  };

  const entryCanvas = document.getElementById('entry-canvas');
  const vesselStage = document.getElementById('vessel-stage');
  const vesselCanvas = document.getElementById('vessel-canvas');
  const vesselList = document.getElementById('vessel-list');
  const selectName = document.getElementById('select-name');
  const selectNextButton = document.getElementById('select-next-button');
  const archiveButton = document.getElementById('archive-button');
  const archiveCount = document.getElementById('archive-count');
  const archiveList = document.getElementById('archive-list');
  const archiveEmpty = document.getElementById('archive-empty');
  const archiveViewer = document.getElementById('archive-viewer');
  const archiveViewerImage = document.getElementById('archive-viewer-image');
  const archiveSaveButton = document.getElementById('archive-save-button');
  const tapFeedback = document.getElementById('tap-feedback');
  const gestureHint = document.getElementById('gesture-hint');
  const fxCanvas = document.getElementById('fx-canvas');
  const workingHint = document.getElementById('working-hint');
  const crystalColor = document.getElementById('crystal-color');
  const createHint = document.getElementById('create-hint');
  const progressDots = document.getElementById('progress-dots');
  const createBackButton = document.getElementById('create-back-button');
  const undoButton = document.getElementById('undo-button');
  const resetButton = document.getElementById('reset-button');
  const finishButton = document.getElementById('finish-button');
  const finishHint = document.getElementById('finish-hint');
  const frameBar = document.getElementById('frame-bar');
  const frameBackButton = document.getElementById('frame-back-button');
  const captureButton = document.getElementById('capture-button');
  const finalizingLayer = document.getElementById('finalizing-layer');
  const resetDialog = document.getElementById('reset-dialog');
  const resultOverlay = document.getElementById('result-overlay');
  const resultLine1 = document.getElementById('result-line1');
  const resultLine3 = document.getElementById('result-line3');
  const saveButton = document.getElementById('save-button');
  const publishButton = document.getElementById('publish-button');
  const toast = document.getElementById('toast');
  const embeddedMusic = window.LCN_EMBEDDED_AUDIO;

  const CHINESE_COUNT = ['〇', '一', '二', '三', '四', '五', '六'];
  const ORDINALS = ['一重', '二重', '三重', '四重', '五重', '六重'];
  // 制作视角：碗底朝向屏幕平面的正俯视，静置不可拖拽。
  const TOP_DOWN = { yaw: 0, pitch: 1.50, zoom: 1 };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hostAdapter = core.createHostAdapter(() => window.xhs && window.xhs.miniTool);
  const soundController = core.createSoundController(null, null, embeddedMusic);
  // 宿主允许时打开小工具即启乐；若系统拦截有声自动播放，首次进入手势会再试一次。
  soundController.startMusic();
  let archiveStorage = null;
  try { archiveStorage = window.localStorage; } catch (error) { archiveStorage = null; }
  const workArchive = core.createWorkArchive(archiveStorage, { limit: 8 });

  // 小工具是不可复制的沉浸式画布：禁用页面级缩放、选择、复制与长按拖拽菜单。
  ['gesturestart', 'gesturechange', 'gestureend', 'selectstart', 'copy', 'cut', 'dragstart', 'contextmenu']
    .forEach((eventName) => {
      document.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
    });
  document.addEventListener('dblclick', (event) => event.preventDefault(), { passive: false });

  let session = core.createSession(`liuchu-${Date.now()}`);
  let currentScene = 'entry';
  let toastTimer = 0;
  let sceneBusy = false;
  // 择器门槛：用户亲手点过一件器才能「下一步」。
  let vesselChosen = false;
  let poster = null;
  let workTitle = null;
  let moment = null;
  let sessionCounter = 0;
  let renderLoop = 0;
  let lastRenderAt = 0;
  let thumbRenderer = null;
  let thumbTexture = null;
  let archiveViewerWork = null;

  const texture = core.createGlazeTexture({
    size: 1024,
    seed: session.sessionSeed,
    vessel: core.getVessel(session.vesselId),
    field: session.iceField,
  });
  let renderer = null;
  try {
    renderer = core.createVesselRenderer(vesselCanvas, { shimmer: 0.06, reflectionStrength: 0.88 });
  } catch (error) {
    renderer = null;
  }
  if (!renderer) renderer = core.createFallbackRenderer(vesselCanvas, { reflectionStrength: 0.88 });
  renderer.setVessel(core.getVessel(session.vesselId));
  renderer.setTexture(texture.canvas, texture.maskCanvas);
  renderer.setOrientation(TOP_DOWN);

  const entryField = core.createEntryField(entryCanvas, { seed: `${session.sessionSeed}-entry` });
  const ambientDrift = core.createAmbientDrift(
    document.getElementById('ambient-canvas'),
    { seed: `${session.sessionSeed}-ambient` },
  );

  function delay(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function showToast(message, duration) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, duration || 2200);
  }

  function startRenderLoop() {
    if (renderLoop) return;
    const frame = (now) => {
      const interactiveFraming = session.phase === 'FRAMING' || session.phase === 'RESULT';
      const interval = interactiveFraming ? 16 : 32;
      if (!lastRenderAt || now - lastRenderAt >= interval) {
        renderer.render(now / 1000);
        lastRenderAt = now;
      }
      renderLoop = window.requestAnimationFrame(frame);
    };
    lastRenderAt = 0;
    renderLoop = window.requestAnimationFrame(frame);
  }

  function stopRenderLoop() {
    window.cancelAnimationFrame(renderLoop);
    renderLoop = 0;
    lastRenderAt = 0;
  }

  // 单段切换：旧场景立即让位，新场景一次淡入——不再有「跳两下」的中间态。
  function showScene(name) {
    if (sceneBusy || currentScene === name) return;
    sceneBusy = true;
    const previous = scenes[currentScene];
    const next = scenes[name];
    previous.classList.remove('is-active');
    previous.hidden = true;
    next.hidden = false;
    window.requestAnimationFrame(() => {
      next.classList.add('is-active');
      sceneBusy = false;
    });
    currentScene = name;
    app.dataset.phase = name === 'archive' ? 'ARCHIVE' : session.phase;
    ambientDrift.setProfile(name === 'create' && session.phase === 'RESULT' ? 'result' : 'default');

    if (name === 'entry') {
      entryField.start();
      ambientDrift.stop();
    } else {
      entryField.stop();
      ambientDrift.start();
    }

    if (name === 'create') {
      window.requestAnimationFrame(() => {
        renderer.resize();
        startRenderLoop();
      });
    } else {
      stopRenderLoop();
    }

    if (name === 'archive') renderArchive();
  }

  /* ---------- 声音与往作 ---------- */

  function refreshArchiveCount() {
    const count = workArchive.list().length;
    archiveCount.textContent = String(count);
    archiveCount.hidden = count === 0;
  }

  function openArchiveWork(work) {
    archiveViewerWork = work;
    archiveViewerImage.src = work.dataUrl;
    archiveViewerImage.alt = `${work.title || '无题'}，${work.vesselName || '白釉器'}作品截图`;
    archiveSaveButton.textContent = hostAdapter.capabilities.save ? '再次保存' : '截图留存';
    archiveViewer.hidden = false;
  }

  function closeArchiveViewer() {
    archiveViewer.hidden = true;
    archiveViewerImage.removeAttribute('src');
    archiveViewerWork = null;
  }

  function renderArchive() {
    const works = workArchive.list();
    archiveCount.textContent = String(works.length);
    archiveCount.hidden = works.length === 0;
    archiveList.replaceChildren();
    archiveList.hidden = works.length === 0;
    archiveEmpty.hidden = works.length > 0;

    const fragment = document.createDocumentFragment();
    works.forEach((work) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'archive-card';
      card.setAttribute('role', 'listitem');
      card.setAttribute('aria-label', `全屏查看${work.title || '无题'}`);
      const image = document.createElement('img');
      image.src = work.dataUrl;
      image.alt = '';
      image.decoding = 'async';
      card.appendChild(image);
      card.addEventListener('click', () => openArchiveWork(work));
      fragment.appendChild(card);
    });
    archiveList.appendChild(fragment);
  }

  function archivePoster(nextPoster) {
    if (!nextPoster || !session.resultId) return;
    const vessel = core.getVessel(session.vesselId);
    workArchive.add({
      id: session.resultId,
      dataUrl: nextPoster.archiveDataUrl || nextPoster.dataUrl,
      createdAt: session.createdAt,
      title: workTitle ? workTitle.full : '无题',
      vesselName: vessel.formalName,
    });
    refreshArchiveCount();
  }

  async function saveArchivedWork() {
    if (!archiveViewerWork || archiveSaveButton.disabled) return;
    const label = archiveSaveButton.textContent;
    archiveSaveButton.disabled = true;
    archiveSaveButton.setAttribute('aria-busy', 'true');
    archiveSaveButton.textContent = '保存中…';
    try {
      const result = await hostAdapter.saveImage(archiveViewerWork.dataUrl);
      showToast(result.ok ? '已保存到相册' : '当前环境没有相册写入能力，请直接系统截图保存', result.ok ? 2200 : 3600);
    } finally {
      archiveSaveButton.disabled = false;
      archiveSaveButton.removeAttribute('aria-busy');
      archiveSaveButton.textContent = label;
    }
  }

  /* ---------- 择器 ---------- */

  // 缩略图用一个离屏渲染器逐件出图，避免为每张卡片各开一个 WebGL 上下文。
  function ensureThumbRenderer() {
    if (thumbRenderer !== null) return thumbRenderer;
    const canvas = document.createElement('canvas');
    canvas.width = 420;
    canvas.height = 420;
    try {
      thumbRenderer = core.createVesselRenderer(canvas, { shimmer: 0, reflectionStrength: 0.58 });
    } catch (error) {
      thumbRenderer = false;
    }
    if (thumbRenderer) {
      thumbTexture = core.createGlazeTexture({ size: 512, seed: 'thumb', vessel: core.VESSELS[0] });
    }
    return thumbRenderer;
  }

  function thumbnailFor(vessel) {
    const preview = ensureThumbRenderer();
    if (!preview) return null;
    thumbTexture.setVessel(vessel, []);
    preview.setVessel(vessel);
    preview.setTexture(thumbTexture.canvas, thumbTexture.maskCanvas);
    preview.setOrientation({ yaw: 0.5, pitch: 0.85, zoom: 1 });
    preview.resize();
    preview.render(0);
    return preview.snapshot();
  }

  function buildVesselList() {
    vesselList.replaceChildren();
    core.VESSELS.forEach((vessel) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'vessel-card';
      card.dataset.vesselId = vessel.id;
      card.setAttribute('role', 'radio');
      card.setAttribute('aria-checked', String(vessel.id === session.vesselId));

      const figure = document.createElement('span');
      figure.className = 'vessel-card-figure';
      const source = thumbnailFor(vessel);
      if (source) {
        const image = document.createElement('img');
        image.src = source;
        image.alt = '';
        figure.appendChild(image);
      } else {
        figure.classList.add('is-flat');
      }

      const label = document.createElement('span');
      label.className = 'vessel-card-name';
      label.textContent = vessel.name;
      // 器名书法图：加载成功则替换文字器名，缺图自动回落。
      const nameArt = document.createElement('img');
      nameArt.className = 'vessel-card-name-art';
      nameArt.alt = '';
      nameArt.hidden = true;
      nameArt.src = `assets/images/vessel-name-${vessel.id}.webp`;
      nameArt.addEventListener('load', () => {
        nameArt.hidden = false;
        label.hidden = true;
      });
      nameArt.addEventListener('error', () => nameArt.remove());
      const glaze = document.createElement('span');
      glaze.className = 'vessel-card-glaze';
      glaze.textContent = (core.GLAZE_COLORS[vessel.glaze] || {}).name || '';

      card.append(figure, nameArt, label, glaze);
      card.addEventListener('click', () => chooseVessel(vessel.id));
      vesselList.appendChild(card);
    });
    refreshSelection();
  }

  function refreshSelection() {
    if (!vesselChosen) {
      // 未择器：不高亮任何卡片，下一步锁定。
      selectName.textContent = '轻点选择一件器';
      selectNextButton.disabled = true;
      Array.from(vesselList.children).forEach((card) => {
        card.classList.remove('is-selected');
        card.setAttribute('aria-checked', 'false');
      });
      return;
    }
    const vessel = core.getVessel(session.vesselId);
    selectName.textContent = vessel.formalName;
    selectNextButton.disabled = false;
    Array.from(vesselList.children).forEach((card) => {
      const selected = card.dataset.vesselId === session.vesselId;
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-checked', String(selected));
    });
  }

  function chooseVessel(vesselId) {
    if (session.phase !== 'SELECT') return;
    vesselChosen = true;
    session = core.reduceSession(session, { type: 'CHOOSE_VESSEL', vesselId });
    const vessel = core.getVessel(session.vesselId);
    texture.setVessel(vessel, session.recipes, session.iceField);
    renderer.setVessel(vessel);
    renderer.setTexture(texture.canvas, texture.maskCanvas);
    refreshSelection();
  }

  /* ---------- 凝花 ---------- */

  function renderProgress() {
    if (progressDots.children.length !== core.REQUIRED_CRYSTALS) {
      const fragment = document.createDocumentFragment();
      for (let index = 0; index < core.REQUIRED_CRYSTALS; index += 1) {
        fragment.appendChild(document.createElement('span'));
      }
      progressDots.replaceChildren(fragment);
    }
    Array.from(progressDots.children).forEach((dot, index) => {
      if (index < session.recipes.length) {
        dot.classList.add('is-filled');
        dot.style.setProperty('--dot-color', session.recipes[index].color.tip);
      } else {
        dot.classList.remove('is-filled');
        dot.style.removeProperty('--dot-color');
      }
    });
  }

  function updateCreationUi() {
    const count = session.recipes.length;
    const framing = session.phase === 'FRAMING';
    vesselCanvas.setAttribute(
      'aria-label',
      framing
        ? '拖动旋转器物，双指缩放，寻一个入画的角度。'
        : `器面上已凝结 ${CHINESE_COUNT[count]} 重结晶。${count >= core.REQUIRED_CRYSTALS ? '现在可以收笔取景。' : '继续轻点器面凝花。'}`,
    );
    createBackButton.disabled = session.phase !== 'READY';
    undoButton.disabled = session.phase !== 'READY' || count === 0;
    resetButton.disabled = session.phase !== 'READY';

    if (count > 0 && !framing) {
      const last = session.recipes[count - 1];
      crystalColor.hidden = false;
      crystalColor.textContent = `${ORDINALS[count - 1]} · ${last.colorName}`;
      crystalColor.style.setProperty('--swatch', last.color.tip);
    } else {
      crystalColor.hidden = true;
    }

    if (framing) {
      finishButton.hidden = true;
      finishHint.hidden = true;
    } else if (count < core.REQUIRED_CRYSTALS) {
      finishButton.hidden = true;
      finishHint.hidden = false;
      finishHint.textContent = `再凝${CHINESE_COUNT[core.REQUIRED_CRYSTALS - count]}重即可收笔`;
    } else {
      finishButton.hidden = false;
      finishHint.hidden = false;
      finishHint.textContent = '六重已足';
    }

    frameBar.hidden = !framing;
    gestureHint.hidden = !(framing || session.phase === 'RESULT');
    createHint.style.opacity = (framing || count >= 2) ? '0' : '1';
    renderProgress();
    app.dataset.phase = session.phase;
    ambientDrift.setProfile(session.phase === 'RESULT' ? 'result' : 'default');
  }

  function easeGrowth(value) {
    // smoothstep：起步缓、收尾缓，纹路是「渐渐浮现」而不是弹出来。
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  }

  /* ---------- 点击魔法：粒子迸发 ---------- */

  const fxCtx = fxCanvas.getContext('2d');
  let fxParticles = [];
  let fxFrame = 0;
  let fxLastAt = 0;
  const fxSpriteCache = new Map();
  // 粒子也走种子随机：装饰层同样不引入不可复现的熵源。
  let fxSpawnCount = 0;

  function fxSpriteFor(color) {
    if (fxSpriteCache.has(color)) return fxSpriteCache.get(color);
    const sprite = document.createElement('canvas');
    sprite.width = 48;
    sprite.height = 48;
    const spriteCtx = sprite.getContext('2d');
    const glow = spriteCtx.createRadialGradient(24, 24, 0, 24, 24, 24);
    glow.addColorStop(0, core.rgba(color, 0.65));
    glow.addColorStop(1, core.rgba(color, 0));
    spriteCtx.fillStyle = glow;
    spriteCtx.fillRect(0, 0, 48, 48);
    fxSpriteCache.set(color, sprite);
    return sprite;
  }

  function fxResize() {
    // 点击光晕本身是柔焦纹理，1.5× 已足够清晰，也能减轻手机 Canvas 压力。
    const ratio = Math.min(1.5, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(fxCanvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(fxCanvas.clientHeight * ratio));
    if (fxCanvas.width !== width || fxCanvas.height !== height) {
      fxCanvas.width = width;
      fxCanvas.height = height;
    }
    return ratio;
  }

  // 在点击处迸发一圈冰蓝微粒：向四周散开、微微上飘、渐隐。
  function spawnBurst(clientX, clientY, colorHex, stageRect) {
    const rect = stageRect || vesselStage.getBoundingClientRect();
    const ratio = fxResize();
    const originX = (clientX - rect.left) * ratio;
    const originY = (clientY - rect.top) * ratio;
    fxSpawnCount += 1;
    const random = core.mulberry32(core.seedFromParts(session.sessionSeed, 'burst', fxSpawnCount));
    for (let index = 0; index < 16; index += 1) {
      const angle = random() * Math.PI * 2;
      const speed = (0.6 + random() * 2.2) * ratio;
      fxParticles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.5 * ratio,
        life: 1,
        decay: 0.022 + random() * 0.02,
        radius: (1.2 + random() * 2.4) * ratio,
        color: random() < 0.65 ? (colorHex || '#B9DCE8') : '#F4FFFC',
      });
    }
    if (!fxFrame) fxFrame = window.requestAnimationFrame(fxTick);
  }

  function fxTick(now) {
    if (fxLastAt && now - fxLastAt < 32) {
      fxFrame = window.requestAnimationFrame(fxTick);
      return;
    }
    const step = fxLastAt ? Math.min(2.5, (now - fxLastAt) / 16.667) : 1;
    fxLastAt = now;
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    fxCtx.globalCompositeOperation = 'lighter';
    fxParticles = fxParticles.filter((particle) => {
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      particle.vx *= Math.pow(0.96, step);
      particle.vy = particle.vy * Math.pow(0.96, step) - 0.02 * step;
      particle.life -= particle.decay * step;
      if (particle.life <= 0) return false;
      fxCtx.globalAlpha = particle.life;
      fxCtx.drawImage(
        fxSpriteFor(particle.color),
        particle.x - particle.radius * 3, particle.y - particle.radius * 3,
        particle.radius * 6, particle.radius * 6,
      );
      return true;
    });
    fxCtx.globalAlpha = 1;
    fxCtx.globalCompositeOperation = 'source-over';
    if (fxParticles.length) {
      fxFrame = window.requestAnimationFrame(fxTick);
    } else {
      fxFrame = 0;
      fxLastAt = 0;
      fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    }
  }

  /* ---------- 点击队列：连点即时反馈、依序快速凝结 ---------- */

  const tapQueue = [];
  let growing = false;

  function refreshWorkingHint() {
    workingHint.hidden = !(growing || tapQueue.length);
  }

  async function drainTapQueue() {
    if (growing) return;
    growing = true;
    ambientDrift.pause();
    refreshWorkingHint();
    while (tapQueue.length) {
      const point = tapQueue.shift();
      if (session.phase !== 'READY' || session.recipes.length >= core.REQUIRED_CRYSTALS) break;
      session = core.reduceSession(session, { type: 'TAP', point });
      updateCreationUi();
      refreshWorkingHint();
      const recipe = session.recipes[session.recipes.length - 1];
      // 快：单枚约半秒内凝成，连点时依序尽快消化。
      await animateGrowth(recipe, 360 + Math.min(1, recipe.radius) * 240);
      session = core.reduceSession(session, { type: 'GROWTH_COMPLETE' });
      updateCreationUi();
    }
    tapQueue.length = 0;
    growing = false;
    refreshWorkingHint();
    ambientDrift.start();
  }

  // 生长期间只重传贴图的脏矩形；完成后整枚烘焙进静态层。
  function animateGrowth(recipe, duration) {
    const actual = reducedMotion.matches ? 150 : duration;
    const startedAt = performance.now();
    let lastUpload = 0;
    return new Promise((resolve) => {
      function frame(now) {
        const progress = Math.min(1, (now - startedAt) / actual);
        // 贴图重绘与上传节流到约 30fps：渐现动画看不出差别，却省掉一半
        // getImageData + texSubImage2D 的开销（手机上这是本环节的性能大头）。
        if (progress >= 1 || now - lastUpload >= 32) {
          lastUpload = now;
          const update = texture.drawGrowing(recipe, easeGrowth(progress));
          if (update.rect) renderer.updateTextureRegion(texture.canvas, texture.maskCanvas, update.rect);
          if (progress >= 1 && !update.complete) {
            window.requestAnimationFrame(frame);
            return;
          }
        }
        if (progress < 1) {
          window.requestAnimationFrame(frame);
          return;
        }
        texture.commit(recipe);
        // Chrome / 部分 Android WebView 在连续 Canvas→texSubImage2D 后会偶发保留脏区边界，
        // 视觉上形成黑色矩形或长条。每一笔结束从确定性配方重建干净静态层，
        // 再用全范围子图覆盖校正并立即定格一帧；避免重新分配 GPU 纹理，动画仍走轻量局部更新。
        texture.reset(session.recipes);
        renderer.updateTextureRegion(texture.canvas, texture.maskCanvas, {
          x: 0,
          y: 0,
          width: texture.size,
          height: texture.size,
        });
        renderer.render(performance.now() / 1000);
        resolve();
      }
      window.requestAnimationFrame(frame);
    });
  }



  function showTapFeedback(clientX, clientY, stageRect) {
    const rect = stageRect || vesselStage.getBoundingClientRect();
    tapFeedback.style.left = `${clientX - rect.left}px`;
    tapFeedback.style.top = `${clientY - rect.top}px`;
    tapFeedback.classList.remove('is-visible');
    void tapFeedback.offsetWidth;
    tapFeedback.classList.add('is-visible');
  }

  /* ---------- 手势：凝花时只认轻点；取景时才有旋转与缩放 ---------- */

  const pointers = new Map();
  let dragged = false;
  let pinchDistance = 0;
  let pinchCenter = null;

  function pointerDown(event) {
    try {
      if (window.PointerEvent && vesselCanvas.setPointerCapture) vesselCanvas.setPointerCapture(event.pointerId);
    } catch (error) { /* 部分 WebView 不支持指针捕获 */ }
    pointers.set(event.pointerId, {
      x: event.clientX, y: event.clientY,
      startX: event.clientX, startY: event.clientY,
      time: performance.now(),
    });
    if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      pinchCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    dragged = false;
  }

  function pointerMove(event) {
    const tracked = pointers.get(event.pointerId);
    if (!tracked) return;
    const deltaX = event.clientX - tracked.x;
    const deltaY = event.clientY - tracked.y;
    tracked.x = event.clientX;
    tracked.y = event.clientY;
    if (session.phase !== 'FRAMING' && session.phase !== 'RESULT') return;

    if (pointers.size >= 2) {
      const [a, b] = Array.from(pointers.values());
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance > 0 && distance > 0) renderer.zoom(pinchDistance / distance);
      pinchDistance = distance;
      // 双指同向拖动 = 上下左右平移取景。
      const centerX = (a.x + b.x) / 2;
      const centerY = (a.y + b.y) / 2;
      if (pinchCenter) renderer.pan(centerX - pinchCenter.x, centerY - pinchCenter.y);
      pinchCenter = { x: centerX, y: centerY };
      dragged = true;
      return;
    }

    // 手机端手指轻点常抖 8–15px，判定拖拽的门槛放宽到 12px，免得点击被吞。
    if (Math.hypot(event.clientX - tracked.startX, event.clientY - tracked.startY) > 12) dragged = true;
    if (!dragged) return;
    const scale = 0.0062;
    const orbit = core.mapOrbitDrag(deltaX, deltaY, scale);
    renderer.orbit(orbit.yaw, orbit.pitch);
  }

  function pointerUp(event) {
    const tracked = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (pointers.size < 2) { pinchDistance = 0; pinchCenter = null; }
    if (!tracked || dragged || pointers.size > 0) return;
    if (session.phase === 'FRAMING' || session.phase === 'RESULT') return;
    if (performance.now() - tracked.time > 700) return;
    if (session.phase !== 'READY') return;
    const done = session.recipes.length + tapQueue.length + (growing ? 0 : 0);
    if (session.recipes.length >= core.REQUIRED_CRYSTALS || done >= core.REQUIRED_CRYSTALS + 2) {
      if (session.recipes.length >= core.REQUIRED_CRYSTALS) showToast('六重已足，可以收笔取景');
      return;
    }
    // 用按下时的坐标拾取：部分手机 WebView 的抬指坐标不可靠。
    const point = renderer.pick(tracked.startX, tracked.startY);
    const stageRect = vesselStage.getBoundingClientRect();
    showTapFeedback(tracked.startX, tracked.startY, stageRect);
    if (!point) {
      showToast('请点在器内的釉面上');
      return;
    }
    // 点击立即回应：粒子迸发如施术，凝结在队列里快速接续。
    const nextIndex = Math.min(core.REQUIRED_CRYSTALS - 1, session.recipes.length + tapQueue.length);
    const burstColor = core.pickSnowColor(
      session.paletteSeed || session.sessionSeed,
      nextIndex,
      core.REQUIRED_CRYSTALS,
    ).tip;
    soundController.playCrystalTap(nextIndex);
    spawnBurst(tracked.startX, tracked.startY, burstColor, stageRect);
    tapQueue.push(point);
    // 先让触摸光圈与粒子进入本帧，构图从下一帧开始，避免抬指事件被计算阻塞。
    window.requestAnimationFrame(() => drainTapQueue());
  }

  function handleWheel(event) {
    if (session.phase !== 'FRAMING' && session.phase !== 'RESULT') return;
    event.preventDefault();
    renderer.zoom(event.deltaY > 0 ? 1.08 : 0.92);
  }

  /* ---------- 取景与成章 ---------- */

  function enterFraming() {
    if (growing || tapQueue.length) return;
    if (session.phase !== 'READY' || session.recipes.length < core.REQUIRED_CRYSTALS) return;
    session = core.reduceSession(session, { type: 'FINISH' });
    // 给取景一个已倾斜的起点，提示器物可转。
    renderer.setOrientation({ yaw: 0.4, pitch: 1.02, zoom: 1 });
    updateCreationUi();
  }

  function exitFraming() {
    if (session.phase !== 'FRAMING') return;
    session = core.reduceSession(session, { type: 'FRAME_BACK' });
    renderer.setOrientation(TOP_DOWN);
    updateCreationUi();
  }

  async function captureWork() {
    if (session.phase !== 'FRAMING') return;
    session = core.reduceSession(session, { type: 'CAPTURE' });
    finalizingLayer.hidden = false;
    app.dataset.phase = session.phase;
    await delay(reducedMotion.matches ? 60 : 240);
    session = core.reduceSession(session, { type: 'FINALIZED', createdAt: Date.now() });

    // 成章即浮层：模型铺满全屏继续可转，题款浮在其上。
    const vessel = core.getVessel(session.vesselId);
    const colorNames = session.recipes.map((recipe) => recipe.colorName);
    workTitle = core.createWorkTitle(session.sessionSeed, colorNames);
    moment = core.formatMoment(session.createdAt);
    poster = null;

    resultLine1.textContent = `${vessel.formalName} · 结晶釉六重`;
    resultLine3.textContent = `${moment.full} ${moment.hour} 凝`;
    finalizingLayer.hidden = true;
    resultOverlay.hidden = false;
    paintResultBackdrop();
    updateCreationUi();
    window.requestAnimationFrame(() => {
      renderer.resize();
      window.requestAnimationFrame(() => {
        poster = composePoster();
        archivePoster(poster);
      });
    });
    refreshHostActions();
    showToast('拖动旋转，寻一个合意的角度，再截图保存');
  }

  function viewportRect(element) {
    const rect = element.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }

  function captureTextBlock(element) {
    const style = window.getComputedStyle(element);
    return {
      text: element.textContent.trim(),
      rect: viewportRect(element),
      style: {
        size: Number.parseFloat(style.fontSize),
        letterSpacing: Number.parseFloat(style.letterSpacing) || 0,
        color: style.color,
        weight: style.fontWeight,
        font: style.fontFamily,
        opacity: Number.parseFloat(style.opacity),
        writingMode: style.writingMode,
      },
    };
  }

  // 保存 / 发布时按「此刻屏幕 + 此刻视角」即时合成，不另做固定比例海报重排。
  /* ---------- 成章背景纹：作品用色的一簇静态冰纹 ----------
     与幕后页同源的 Voronoi 剖分：源点定在右上，向四周化入墨底。
     每片的颜色循环取这件作品六击的定稿色，故每一件的背景都随作品走。 */

  const resultBg = document.getElementById('result-bg');
  const resultBgCtx = resultBg.getContext('2d');

  function paintResultBackdrop() {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(resultBg.clientWidth * ratio));
    const height = Math.max(1, Math.round(resultBg.clientHeight * ratio));
    resultBg.width = width;
    resultBg.height = height;
    resultBgCtx.clearRect(0, 0, width, height);
    if (session.phase !== 'RESULT' || !session.recipes.length) return;

    const field = core.createIceField({
      seed: core.seedFromParts(session.sessionSeed, 'result-bg'),
      fineCount: 120,
      coarseCount: 24,
    });
    // 源点在右上，纹理尺度盖过半屏，越远越隐。
    const originX = width * 0.86;
    const originY = height * 0.16;
    const scale = Math.max(width, height) * 0.92;
    const colors = session.recipes.map((recipe) => recipe.color.tip);

    resultBgCtx.lineJoin = 'round';
    field.chips.forEach((chip, index) => {
      const fade = Math.max(0, 1 - Math.hypot(chip.centroid.x, chip.centroid.y));
      if (fade <= 0.03) return;
      const tip = colors[index % colors.length];
      resultBgCtx.beginPath();
      chip.polygon.forEach((point, pointIndex) => {
        const x = originX + point.x * scale;
        const y = originY + point.y * scale;
        if (pointIndex === 0) resultBgCtx.moveTo(x, y);
        else resultBgCtx.lineTo(x, y);
      });
      resultBgCtx.closePath();
      // 淡淡一层本色 + 一线微光的界：若隐若现，不与器物争。
      resultBgCtx.fillStyle = core.rgba(tip, 0.016 * fade);
      resultBgCtx.fill();
      resultBgCtx.strokeStyle = core.rgba(core.blendHex(tip, '#FFFFFF', 0.45), 0.11 * fade * fade);
      resultBgCtx.lineWidth = 1;
      resultBgCtx.stroke();
    });
  }

  function clearResultBackdrop() {
    resultBgCtx.clearRect(0, 0, resultBg.width, resultBg.height);
  }

  function composePoster() {
    renderer.render(performance.now() / 1000);
    const offscreen = document.createElement('canvas');
    const ambientCanvas = document.getElementById('ambient-canvas');
    const watermark = resultOverlay.querySelector('.result-watermark');
    const seal = resultOverlay.querySelector('.result-seal');
    const colorNames = session.recipes.map((recipe) => recipe.colorName);
    const uniqueColors = colorNames.filter((name, index) => colorNames.indexOf(name) === index);
    const result = core.renderScreenCapture({
      canvas: offscreen,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        pixelRatio: window.devicePixelRatio || 1,
      },
      ambientSource: ambientCanvas,
      ambientRect: viewportRect(ambientCanvas),
      crackleSource: resultBg,
      crackleRect: viewportRect(resultBg),
      vesselSource: vesselCanvas,
      vesselRect: viewportRect(vesselCanvas),
      watermarkSource: watermark.complete && watermark.naturalWidth ? watermark : null,
      watermarkRect: viewportRect(watermark),
      watermarkOpacity: Number.parseFloat(window.getComputedStyle(watermark).opacity),
      textBlocks: [resultLine1, resultLine3].map(captureTextBlock),
      sealRect: viewportRect(seal),
      title: workTitle,
      colorNames: uniqueColors,
    });
    result.archiveDataUrl = offscreen.toDataURL('image/jpeg', 0.88);
    return result;
  }

  function refreshHostActions() {
    const capabilities = hostAdapter.capabilities;
    saveButton.textContent = capabilities.save ? '保存作品' : '截图保存';
    publishButton.hidden = false;
    publishButton.textContent = capabilities.publish ? '发布到小红书' : '发布';
  }

  async function saveWork() {
    if (session.phase !== 'RESULT' || saveButton.disabled) return;
    poster = composePoster();
    archivePoster(poster);
    const label = saveButton.textContent;
    saveButton.disabled = true;
    saveButton.setAttribute('aria-busy', 'true');
    saveButton.textContent = '保存中…';
    try {
      const result = await hostAdapter.saveImage(poster.dataUrl);
      if (result.ok) {
        showToast('已保存到相册');
        return;
      }
      showToast('当前环境没有相册写入能力，请直接系统截图保存', 3600);
    } finally {
      saveButton.disabled = false;
      saveButton.removeAttribute('aria-busy');
      saveButton.textContent = label;
    }
  }

  async function publishWork() {
    if (session.phase !== 'RESULT' || publishButton.disabled) return;
    poster = composePoster();
    archivePoster(poster);
    const label = publishButton.textContent;
    publishButton.disabled = true;
    publishButton.setAttribute('aria-busy', 'true');
    publishButton.textContent = '发布中…';
    try {
      const result = await hostAdapter.publishImage(poster.dataUrl, {
        title: `六出凝华 ${workTitle ? workTitle.display : ''}`,
        content: '在白瓷盏心点六次，结晶自器心发色，向杯壁化白。器形、冰裂与用色都由程序当场生成。',
        tags: '#六出凝华 #结晶釉 #国风小工具',
      });
      if (result.ok) {
        showToast('已打开小红书发布页');
        return;
      }
      showToast('当前环境暂不能发布，请先截图保存作品', 3600);
    } finally {
      publishButton.disabled = false;
      publishButton.removeAttribute('aria-busy');
      publishButton.textContent = label;
    }
  }

  /* ---------- 流程 ---------- */

  function resetCrystals() {
    tapQueue.length = 0;
    session = core.reduceSession(session, { type: 'RESET' });
    texture.reset([]);
    renderer.setTexture(texture.canvas, texture.maskCanvas);
    renderer.setOrientation(TOP_DOWN);
    updateCreationUi();
    showToast('已换一轮新色，轻点盏心重新凝花');
  }

  function restart(seed) {
    clearResultBackdrop();
    session = core.reduceSession(session, { type: 'RESTART', seed });
    poster = null;
    vesselChosen = false;
    resultOverlay.hidden = true;
    texture.setVessel(core.getVessel(session.vesselId), [], session.iceField);
    renderer.setVessel(core.getVessel(session.vesselId));
    renderer.setTexture(texture.canvas, texture.maskCanvas);
    renderer.setOrientation(TOP_DOWN);
    entryField.reset();
    updateCreationUi();
    showScene('entry');
  }

  // 整屏轻触进入；同时为拦截自动播放的浏览器提供一次合法手势重试。
  document.getElementById('start-button').addEventListener('click', () => {
    if (session.phase !== 'ENTRY') return;
    soundController.startMusic(true);
    session = core.reduceSession(session, { type: 'ENTER_SELECT' });
    vesselChosen = session.recipes.length > 0;
    buildVesselList();
    showScene('select');
  });

  document.getElementById('select-back-button').addEventListener('click', () => {
    // 已有结晶时，「返回」回到凝花继续；否则回入境。
    if (session.recipes.length) {
      session = core.reduceSession(session, { type: 'CONFIRM_VESSEL' });
      renderer.setOrientation(TOP_DOWN);
      updateCreationUi();
      showScene('create');
      return;
    }
    session = core.createSession(session.sessionSeed, session.vesselId);
    showScene('entry');
  });

  archiveButton.addEventListener('click', () => {
    if (session.phase !== 'SELECT') return;
    closeArchiveViewer();
    showScene('archive');
  });

  document.getElementById('archive-back-button').addEventListener('click', () => {
    closeArchiveViewer();
    showScene('select');
  });
  document.getElementById('archive-viewer-back').addEventListener('click', closeArchiveViewer);
  archiveSaveButton.addEventListener('click', saveArchivedWork);

  selectNextButton.addEventListener('click', () => {
    if (!vesselChosen || session.phase !== 'SELECT') return;
    session = core.reduceSession(session, { type: 'CONFIRM_VESSEL' });
    renderer.setOrientation(TOP_DOWN);
    updateCreationUi();
    showScene('create');
  });

  createBackButton.addEventListener('click', () => {
    if (session.phase !== 'READY') return;
    session = core.reduceSession(session, { type: 'BACK_TO_SELECT' });
    vesselChosen = true;
    buildVesselList();
    showScene('select');
  });

  if (window.PointerEvent) {
    vesselCanvas.addEventListener('pointerdown', pointerDown);
    vesselCanvas.addEventListener('pointermove', pointerMove);
    vesselCanvas.addEventListener('pointerup', pointerUp);
    vesselCanvas.addEventListener('pointercancel', (event) => {
      pointers.delete(event.pointerId);
      pinchDistance = 0;
    });
  } else {
    // 老 WebView 无 Pointer Events：用 touch 事件映射同一套手势逻辑。
    const asPointer = (touch) => ({ pointerId: touch.identifier, clientX: touch.clientX, clientY: touch.clientY });
    vesselCanvas.addEventListener('touchstart', (event) => {
      event.preventDefault();
      Array.from(event.changedTouches).forEach((touch) => pointerDown(asPointer(touch)));
    }, { passive: false });
    vesselCanvas.addEventListener('touchmove', (event) => {
      event.preventDefault();
      Array.from(event.changedTouches).forEach((touch) => pointerMove(asPointer(touch)));
    }, { passive: false });
    vesselCanvas.addEventListener('touchend', (event) => {
      Array.from(event.changedTouches).forEach((touch) => pointerUp(asPointer(touch)));
    });
    vesselCanvas.addEventListener('touchcancel', (event) => {
      Array.from(event.changedTouches).forEach((touch) => {
        pointers.delete(touch.identifier);
      });
      pinchDistance = 0;
    });
  }
  vesselCanvas.addEventListener('wheel', handleWheel, { passive: false });
  vesselCanvas.addEventListener('contextmenu', (event) => event.preventDefault());

  undoButton.addEventListener('click', () => {
    if (growing || tapQueue.length) return;
    session = core.reduceSession(session, { type: 'UNDO' });
    texture.reset(session.recipes);
    renderer.setTexture(texture.canvas, texture.maskCanvas);
    updateCreationUi();
  });

  resetButton.addEventListener('click', () => {
    resetDialog.hidden = false;
    document.getElementById('reset-cancel-button').focus();
  });
  document.getElementById('reset-cancel-button').addEventListener('click', () => { resetDialog.hidden = true; });
  document.getElementById('reset-confirm-button').addEventListener('click', () => {
    resetDialog.hidden = true;
    resetCrystals();
  });

  finishButton.addEventListener('click', enterFraming);
  frameBackButton.addEventListener('click', exitFraming);
  captureButton.addEventListener('click', captureWork);
  saveButton.addEventListener('click', saveWork);
  publishButton.addEventListener('click', publishWork);
  document.getElementById('again-button').addEventListener('click', () => {
    sessionCounter += 1;
    restart(`liuchu-${Date.now()}-${sessionCounter}`);
  });

  window.addEventListener('resize', () => {
    ambientDrift.resize();
    if (currentScene === 'create') window.requestAnimationFrame(() => renderer.resize());
    if (session.phase === 'RESULT') paintResultBackdrop();
  });

  // 以 iPhone 15 Pro Max（430×932）为设计基准等比缩放，框外由 body 的黑色蔓延填满。
  function fitFrame() {
    const fit = Math.min(window.innerWidth / 430, window.innerHeight / 932);
    document.documentElement.style.setProperty('--fit', fit.toFixed(4));
    // 顶部预留要换算回真实像素，宿主按钮与状态栏才不会压住内容。
    document.documentElement.style.setProperty('--top-reserve', `${Math.round(80 / fit)}px`);
  }
  fitFrame();
  window.addEventListener('resize', fitFrame);
  window.addEventListener('orientationchange', fitFrame);
  window.addEventListener('pagehide', () => soundController.stop());

  // 书法图槽位：逐个探测，加载成功才启用；缺图的那一块自动回落到代码版楷体字。
  Array.from(document.querySelectorAll('[data-art]')).forEach((image) => {
    const flag = `has-art-${image.dataset.art}`;
    const useArt = () => app.classList.add(flag);
    if (image.complete && image.naturalWidth > 0) useArt();
    else image.addEventListener('load', useArt);
    image.addEventListener('error', () => app.classList.remove(flag));
  });

  updateCreationUi();
  refreshArchiveCount();
  entryField.start();
  document.documentElement.classList.add('js-ready');
}());
