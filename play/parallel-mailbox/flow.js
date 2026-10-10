(function initParallelMailboxFlow(root, factory) {
  const data = typeof module === 'object' && module.exports
    ? require('./data.js')
    : root.MemoryEnvelopeData;
  const engine = typeof module === 'object' && module.exports
    ? require('./engine.js')
    : root.MemoryEnvelopeEngine;
  const rarity = typeof module === 'object' && module.exports
    ? require('./rarity.js')
    : root.ParallelMailboxRarity;
  const value = factory(data, engine, rarity);
  if (typeof module === 'object' && module.exports) module.exports = value;
  if (root) root.ParallelMailboxFlow = value;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createParallelMailboxFlow(data, engine, rarity) {
  'use strict';

  if (!data || !engine || !rarity) throw new Error('Parallel Mailbox v2 flow is missing a dependency');

  /**
   * release-v2 流程
   *
   * intro → handover → question → sending → delivery → reveal → evidence | card
   *
   * 与 release-v1 的差异：
   * - 删除 feedback（装信改为选照片页内联动画）
   * - 删除 sealing 视频（改为 sending 的代码动画）
   * - 新增 handover（递交信封）与 delivery（回信抵达，待拆封）
   *
   * 内容仍完全由 release-v1 的确定性引擎推出；稀有度是独立的概率层，
   * 只影响信封 / 信纸 / 邮戳 / 粒子的呈现，不改变宇宙、年份或正文。
   * 抽出的是 17 款之一（style），其中 tierId 表示稀有档位、variantId 表示配色款式。
   */
  const PHASES = Object.freeze([
    'intro', 'handover', 'question', 'sending', 'delivery', 'reveal', 'evidence', 'card',
  ]);

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
    return value;
  }

  function makeState(phase, answers, result) {
    return deepFreeze({ phase, answers: [...answers], result: result || null });
  }

  function createInitialState() {
    return makeState('intro', [], null);
  }

  /** 载荷可能是款式、档位对象，或只是个 id（来自 ?tier= / ?variant=），统一解析成款式。 */
  function resolveStyle(input) {
    if (!input) return rarity.draw();
    if (typeof input === 'string') return rarity.get(input);
    if (input.variantId) return input;
    return rarity.get(input.id);
  }

  function buildResult(answers, input) {
    const style = resolveStyle(input);
    const resolution = engine.resolveScene(answers);
    return {
      ...resolution,
      edition: engine.deriveLetterEdition(answers, resolution),
      narrativeFuture: engine.deriveNarrativeFuture(answers, resolution),
      rarity: {
        schemeVersion: rarity.schemeVersion,
        // styleId 是「哪一款」（如 common-kraft），tierId 是「有多稀有」
        styleId: style.id,
        variantId: style.variantId,
        variantName: style.variantName,
        tierId: style.tierId,
        tierName: style.name,
        tierEnglishName: style.englishName,
        percentLabel: rarity.percentLabel(style),
        tierPercentLabel: rarity.tierPercentLabel(rarity.getTier(style.tierId)),
        lore: style.lore,
      },
    };
  }

  function reduce(state, action) {
    if (!state || !action || typeof action.type !== 'string') return state;

    switch (action.type) {
      case 'START':
        if (state.phase !== 'intro') return state;
        return makeState('handover', state.answers, null);

      case 'ACCEPT_ENVELOPE':
        if (state.phase !== 'handover') return state;
        return makeState('question', state.answers, null);

      case 'CHOOSE': {
        if (state.phase !== 'question' || state.answers.length >= data.questions.length) return state;
        const question = data.questions[state.answers.length];
        if (!question.options.some(({ id }) => id === action.optionId)) return state;
        const answers = [...state.answers, action.optionId];
        return makeState(
          answers.length === data.questions.length ? 'sending' : 'question',
          answers,
          null,
        );
      }

      case 'BACK':
        if (state.phase !== 'question' || state.answers.length === 0) return state;
        return makeState('question', state.answers.slice(0, -1), null);

      case 'SEND_DONE': {
        if (state.phase !== 'sending' || state.answers.length !== data.questions.length) return state;
        return makeState('delivery', state.answers, buildResult(state.answers, action.tier));
      }

      case 'OPEN_REPLY':
        if (state.phase !== 'delivery' || !state.result) return state;
        return makeState('reveal', state.answers, state.result);

      case 'VIEW_EVIDENCE':
        if (state.phase !== 'reveal' || !state.result) return state;
        return makeState('evidence', state.answers, state.result);

      case 'OPEN_CARD':
        if (state.phase !== 'reveal' || !state.result) return state;
        return makeState('card', state.answers, state.result);

      case 'RETURN_TO_RESULT':
        if (!['evidence', 'card'].includes(state.phase) || !state.result) return state;
        return makeState('reveal', state.answers, state.result);

      case 'RESET':
        return createInitialState();

      default:
        return state;
    }
  }

  return deepFreeze({
    schemeVersion: 'parallel-mailbox-v2',
    PHASES,
    createInitialState,
    reduce,
  });
});
