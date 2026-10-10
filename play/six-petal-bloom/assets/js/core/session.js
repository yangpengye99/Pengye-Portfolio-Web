// 会话状态机：入境 → 择器 → 凝花（六次） → 收笔 → 成章。
(function attachSession(root, factory) {
  const dependencies = typeof module === 'object' && module.exports
    ? { ...require('./prng.js'), ...require('./palette.js'), ...require('./composition.js'), ...require('./crackle.js'), ...require('./crystal.js'), ...require('./vessels.js') }
    : root.LCN;
  const api = factory(dependencies);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LCN = root.LCN || {};
  Object.assign(root.LCN, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function createSessionApi(core) {
  'use strict';

  const REQUIRED_CRYSTALS = core.MAX_CRYSTALS;

  function createSession(seed, vesselId, resetCount) {
    const id = vesselId || core.DEFAULT_VESSEL_ID;
    const colourReset = Math.max(0, Math.floor(Number(resetCount) || 0));
    return {
      phase: 'ENTRY',
      sessionSeed: String(seed),
      paletteSeed: colourReset ? `${String(seed)}|palette-reset-${colourReset}` : String(seed),
      resetCount: colourReset,
      vesselId: id,
      // 冰裂片场：与渲染层共用同一张（同种子同器物），点击按波前逐片揭示。
      iceField: core.iceFieldFor(String(seed), core.getVessel(id)),
      composition: core.createComposition(seed),
      taps: [],
      recipes: [],
      activeIndex: -1,
      createdAt: null,
      resultId: null,
    };
  }

  /**
   * 揭示配方：这一击从点击处按距离波前揭示一批尚未出现的冰片。
   * 配额 = 剩余片数 / 剩余点击数，因此第六击后整碗必然填满。
   */
  function buildRecipe(session, placement, priorRecipes) {
    const base = core.pickSnowColor(session.paletteSeed || session.sessionSeed, placement.index, REQUIRED_CRYSTALS);
    const chips = session.iceField.chips;
    const used = new Set();
    (priorRecipes || []).forEach((recipe) => recipe.chipIds.forEach((id) => used.add(id)));
    const rest = [];
    for (let index = 0; index < chips.length; index += 1) {
      if (used.has(index)) continue;
      rest.push({
        index,
        distance: Math.hypot(chips[index].centroid.x - placement.x, chips[index].centroid.y - placement.y),
      });
    }
    rest.sort((a, b) => (a.distance - b.distance) || (a.index - b.index));
    const clicksLeft = REQUIRED_CRYSTALS - placement.index;
    const quota = Math.max(1, Math.ceil(rest.length / Math.max(1, clicksLeft)));
    const chosen = rest.slice(0, quota);
    const minDistance = chosen.length ? chosen[0].distance : 0;
    const maxDistance = Math.max(minDistance + 0.08, chosen.length ? chosen[chosen.length - 1].distance : 0.12);
    // 后几笔会遇到前几笔留下的狭长残片。仍揭示这些片，但只让落点附近承接完整釉色，
    // 从中段开始用平滑曲线减淡远端尾巴，避免一整条残余通道突然染成同一实色。
    const featherIndex = Math.max(0, Math.floor((chosen.length - 1) * 0.55));
    const featherStart = chosen.length ? chosen[featherIndex].distance : minDistance;
    const featherSpan = Math.max(0.04, maxDistance - featherStart);
    const chipTintWeights = chosen.map((item) => {
      if (item.distance <= featherStart) return 1;
      const distanceT = Math.max(0, Math.min(1, (item.distance - featherStart) / featherSpan));
      const smooth = distanceT * distanceT * (3 - 2 * distanceT);
      return 0.18 + 0.82 * (1 - smooth);
    });
    return {
      algorithmVersion: 6,
      kind: 'reveal',
      clickIndex: placement.index,
      cx: placement.x,
      cy: placement.y,
      radius: maxDistance,
      color: base,
      colorId: base.id,
      colorName: base.name,
      chipIds: chosen.map((item) => item.index),
      chipTintWeights,
      // 每片的出生时刻按距离归一（自最近片起算）：点击处即刻响应，波前向四周缓缓漫开。
      chipBirths: chosen.map((item) => 0.03 + 0.60 * ((item.distance - minDistance) / (maxDistance - minDistance))),
      opacity: 1,
    };
  }

  function rebuild(session, taps) {
    let composition = core.createComposition(session.sessionSeed);
    const recipes = [];
    taps.forEach((point) => {
      const mapped = core.mapTap(composition, point);
      composition = mapped.state;
      recipes.push(buildRecipe(session, mapped.placement, recipes));
    });
    return { composition, recipes };
  }

  function reduceSession(session, action) {
    if (!session || !action) throw new Error('invalid-session-action');
    switch (action.type) {
      case 'ENTER_SELECT':
        if (session.phase !== 'ENTRY' && session.phase !== 'SELECT') throw new Error('invalid-transition');
        return { ...session, phase: 'SELECT' };
      case 'CHOOSE_VESSEL': {
        if (session.phase !== 'SELECT') throw new Error('invalid-transition');
        const vessel = core.getVessel(action.vesselId);
        const next = {
          ...session,
          vesselId: vessel.id,
          iceField: core.iceFieldFor(session.sessionSeed, vessel),
        };
        // 新片场下按点击序重放揭示，进度保留。
        return { ...next, ...rebuild(next, next.taps) };
      }
      case 'CONFIRM_VESSEL':
        if (session.phase !== 'SELECT') throw new Error('invalid-transition');
        return { ...session, phase: 'READY' };
      case 'TAP': {
        if (session.phase !== 'READY') throw new Error('invalid-transition');
        if (session.recipes.length >= REQUIRED_CRYSTALS) throw new Error('composition-full');
        const point = { x: Number(action.point.x) || 0, y: Number(action.point.y) || 0 };
        const mapped = core.mapTap(session.composition, point);
        return {
          ...session,
          phase: 'GROWING',
          composition: mapped.state,
          taps: session.taps.concat(point),
          recipes: session.recipes.concat(buildRecipe(session, mapped.placement, session.recipes)),
          activeIndex: mapped.placement.index,
        };
      }
      case 'GROWTH_COMPLETE':
        if (session.phase !== 'GROWING') throw new Error('invalid-transition');
        return { ...session, phase: 'READY', activeIndex: -1 };
      case 'UNDO': {
        if (session.phase !== 'READY' || !session.taps.length) return session;
        const taps = session.taps.slice(0, -1);
        return { ...session, taps, ...rebuild(session, taps), activeIndex: -1 };
      }
      case 'BACK_TO_SELECT':
        if (session.phase !== 'READY') throw new Error('invalid-transition');
        return { ...session, phase: 'SELECT' };
      case 'FINISH':
        if (session.phase !== 'READY') throw new Error('invalid-transition');
        if (session.recipes.length < REQUIRED_CRYSTALS) throw new Error('not-enough-crystals');
        return { ...session, phase: 'FRAMING' };
      case 'FRAME_BACK':
        if (session.phase !== 'FRAMING') throw new Error('invalid-transition');
        return { ...session, phase: 'READY' };
      case 'CAPTURE':
        if (session.phase !== 'FRAMING') throw new Error('invalid-transition');
        return { ...session, phase: 'FINALIZING' };
      case 'FINALIZED': {
        if (session.phase !== 'FINALIZING') throw new Error('invalid-transition');
        const signature = `${session.sessionSeed}|${session.vesselId}|${session.recipes.map((item) => item.seed).join(',')}`;
        return {
          ...session,
          phase: 'RESULT',
          createdAt: Number(action.createdAt) || 0,
          resultId: core.hashString(signature).toString(36).toUpperCase().padStart(6, '0'),
        };
      }
      case 'RESET':
        return {
          ...createSession(session.sessionSeed, session.vesselId, (session.resetCount || 0) + 1),
          phase: 'READY',
        };
      case 'RESTART':
        return createSession(action.seed || session.sessionSeed, session.vesselId);
      default:
        throw new Error('unknown-action');
    }
  }

  return { REQUIRED_CRYSTALS, createSession, reduceSession };
}));
