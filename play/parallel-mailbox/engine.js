(function initMemoryEnvelopeEngine(root, factory) {
  const data = typeof module === 'object' && module.exports
    ? require('./data.js')
    : root.MemoryEnvelopeData;
  const value = factory(data);
  if (typeof module === 'object' && module.exports) module.exports = value;
  if (root) root.MemoryEnvelopeEngine = value;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMemoryEnvelopeEngine(data) {
  'use strict';

  if (!data) throw new Error('MemoryEnvelopeData must load before MemoryEnvelopeEngine');

  const optionById = new Map();
  for (const question of data.questions) {
    for (const option of question.options) optionById.set(option.id, { question, option });
  }
  const sceneByKey = new Map(
    data.scenes.map((scene) => [`${scene.carrier}:${scene.direction}`, scene]),
  );
  const sceneById = new Map(data.scenes.map((scene) => [scene.id, scene]));
  const universeByScoreKey = new Map(
    data.universes.map((universe, index) => [universe.scoreKey, { ...universe, index }]),
  );

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
    return value;
  }

  function makeState(phase, answers, result) {
    return deepFreeze({
      phase,
      answers: [...answers],
      result: result || null,
    });
  }

  function createInitialState() {
    return makeState('intro', [], null);
  }

  function validateEnvelopeOptionIds(answerIds) {
    if (!Array.isArray(answerIds)) return deepFreeze([]);
    const envelopeOptionIds = [];
    const limit = Math.min(answerIds.length, data.questions.length);
    for (let index = 0; index < limit; index += 1) {
      const question = data.questions[index];
      const envelopeOptionId = answerIds[index];
      if (!question.options.some(({ id }) => id === envelopeOptionId)) break;
      envelopeOptionIds.push(envelopeOptionId);
    }
    return deepFreeze(envelopeOptionIds);
  }

  function encodePathStamp(answerIds) {
    const ids = validateEnvelopeOptionIds(answerIds);
    if (ids.length !== data.questions.length) {
      throw new RangeError('A path stamp requires one positional answer for every question');
    }
    const marks = ids.map((optionId, index) => (
      data.questions[index].options.findIndex(({ id }) => id === optionId)
    ));
    const value = marks.reduce((total, mark) => (total << 1) | mark, 0);
    return deepFreeze({
      bits: marks.join(''),
      value,
      hex: value.toString(16).padStart(2, '0').toUpperCase(),
      marks,
    });
  }

  function parity(value) {
    let remaining = value;
    let bit = 0;
    while (remaining > 0) {
      bit ^= remaining & 1;
      remaining >>>= 1;
    }
    return bit;
  }

  function foldNibble(nibble) {
    return parity(nibble & 0b1011) | (parity(nibble & 0b1101) << 1);
  }

  function resolveLetterVariant(marks) {
    const low = marks[1] ^ marks[2] ^ marks[5] ^ marks[6];
    const high = marks[0] ^ marks[3] ^ marks[4] ^ marks[7];
    return low | (high << 1);
  }

  function selectLetterMomentIndices(stamp) {
    const earlyNibble = stamp.value >>> 4;
    const lateNibble = stamp.value & 0b1111;
    const first = foldNibble(lateNibble);
    const second = 4 + foldNibble(earlyNibble);
    const remaining = Array.from({ length: data.questions.length }, (_, index) => index)
      .filter((index) => index !== first && index !== second);
    const mixed = ((stamp.value * 5) ^ (stamp.value >>> 7) ^ 1) >>> 0;
    return [first, second, remaining[mixed % remaining.length]];
  }

  function rankDimension(ids, dimension, items) {
    const scores = Object.fromEntries(items.map(({ id }) => [id, 0]));
    const latest = Object.fromEntries(items.map(({ id }) => [id, -1]));

    ids.forEach((optionId, index) => {
      const record = optionById.get(optionId);
      if (!record) return;
      const contribution = record.option.envelopeContribution[dimension];
      if (!contribution || !(contribution in scores)) return;
      scores[contribution] += 1;
      latest[contribution] = index;
    });

    const order = new Map(items.map(({ id }, index) => [id, index]));
    const ranking = items.map(({ id }) => id).sort((left, right) => (
      scores[right] - scores[left]
      || latest[right] - latest[left]
      || order.get(left) - order.get(right)
    ));

    return {
      scores,
      latest,
      ranking,
      winner: ranking[0],
      runnerUp: ranking[1],
      margin: scores[ranking[0]] - scores[ranking[1]],
    };
  }

  function scoreAnswers(answerIds) {
    const submittedAnswerIds = Array.isArray(answerIds)
      ? answerIds.slice(0, data.questions.length)
      : [];
    const envelopeOptionIds = validateEnvelopeOptionIds(submittedAnswerIds);
    const validAnswerIds = submittedAnswerIds.slice(0, envelopeOptionIds.length);
    const carrier = rankDimension(envelopeOptionIds, 'carrier', data.carriers);
    const direction = rankDimension(envelopeOptionIds, 'direction', data.directions);
    return deepFreeze({
      answerIds: validAnswerIds,
      carriers: carrier.scores,
      directions: direction.scores,
      carrierRanking: carrier.ranking,
      directionRanking: direction.ranking,
      carrierId: carrier.winner,
      directionId: direction.winner,
      carrierMargin: carrier.margin,
      directionMargin: direction.margin,
      latestCarrier: carrier.latest,
      latestDirection: direction.latest,
    });
  }

  function resolveScene(answerIds) {
    if (!Array.isArray(answerIds) || answerIds.length !== data.questions.length) {
      throw new RangeError('A parallel reply requires one positional answer for every question');
    }
    const score = scoreAnswers(answerIds);
    if (score.answerIds.length !== data.questions.length) {
      throw new RangeError('Every envelope answer must belong to its matching question');
    }
    const scene = sceneByKey.get(`${score.carrierId}:${score.directionId}`);
    if (!scene) throw new Error('No parallel reply matches the resolved carrier and direction');

    let runnerUpScene = null;
    if (score.carrierMargin === 0 || score.directionMargin === 0) {
      const replaceCarrier = score.carrierMargin <= score.directionMargin;
      const runnerCarrier = replaceCarrier ? score.carrierRanking[1] : score.carrierId;
      const runnerDirection = replaceCarrier ? score.directionId : score.directionRanking[1];
      runnerUpScene = sceneByKey.get(`${runnerCarrier}:${runnerDirection}`) || null;
    }

    return deepFreeze({
      sceneId: scene.id,
      carrierId: score.carrierId,
      directionId: score.directionId,
      carrierMargin: score.carrierMargin,
      directionMargin: score.directionMargin,
      runnerUpSceneId: runnerUpScene ? runnerUpScene.id : null,
      isClose: Boolean(runnerUpScene),
      scores: {
        carriers: score.carriers,
        directions: score.directions,
      },
    });
  }

  function getEvidence(answerIds, resolvedResult) {
    const result = resolvedResult || resolveScene(answerIds);
    const envelopeOptionIds = validateEnvelopeOptionIds(answerIds);
    const envelopeItems = envelopeOptionIds
      .map((optionId, index) => {
        const record = optionById.get(optionId);
        return record ? {
          ...record,
          optionId,
          index,
        } : null;
      })
      .filter(Boolean);

    const picked = [];
    function addLatest(predicate, reason) {
      const match = [...envelopeItems].reverse().find((item) => (
        !picked.some((pickedItem) => pickedItem.optionId === item.optionId) && predicate(item)
      ));
      if (match) picked.push({ ...match, reason: reason(match) });
    }

    const carrier = data.carriers.find(({ id }) => id === result.carrierId);
    const direction = data.directions.find(({ id }) => id === result.directionId);

    addLatest(
      ({ option }) => option.envelopeContribution.carrier === result.carrierId,
      ({ option }) => `你在本轮问题中选择了“${option.title}”；它是较多出现的${carrier.label}线索之一。`,
    );
    addLatest(
      ({ option }) => option.envelopeContribution.direction === result.directionId,
      ({ option }) => `你选中了“${option.title}”；它更贴近“${direction.label}”这一叙事方向。`,
    );
    addLatest(
      () => true,
      ({ option }) => `“${option.title}”是你这轮直接点选放入信封的照片，也为这封回信保留了具体出处。`,
    );

    return deepFreeze(picked.map(({
      question,
      option,
      optionId,
      reason,
    }) => ({
      questionId: question.id,
      optionId,
      title: option.title,
      caption: option.caption,
      asset: option.asset,
      reason,
    })));
  }

  function deriveLetterEdition(answerIds, resolvedResult) {
    const stamp = encodePathStamp(answerIds);
    const result = resolvedResult || resolveScene(answerIds);
    const scene = sceneById.get(result.sceneId);
    if (!scene) throw new Error('No parallel reply matches the letter edition');

    const variantIndex = resolveLetterVariant(stamp.marks);
    const template = data.letterTemplates[variantIndex];
    const coreVariant = scene.todayMessage.variants[
      variantIndex % scene.todayMessage.variants.length
    ];
    const momentOptionIds = selectLetterMomentIndices(stamp)
      .map((index) => answerIds[index]);

    return deepFreeze({
      schemeVersion: 'letter-edition-v2',
      stamp,
      variantIndex,
      variantId: coreVariant.id,
      templateId: template.id,
      momentOptionIds,
      shareOptionIds: momentOptionIds.slice(0, 2),
      message: {
        lead: scene.todayMessage.lead,
        subtitle: scene.todayMessage.subtitle,
        body: coreVariant.body,
      },
    });
  }

  function deriveNarrativeFuture(answerIds, resolvedResult) {
    const stamp = encodePathStamp(answerIds);
    const result = resolvedResult || resolveScene(answerIds);
    const universe = universeByScoreKey.get(result.carrierId);
    if (!universe) throw new Error('No parallel universe matches this reply');
    const futureYears = 2 + (stamp.value % 8);

    return deepFreeze({
      schemeVersion: 'narrative-future-v1',
      sourceStampHex: stamp.hex,
      universeIndex: universe.index,
      universeId: universe.id,
      universeName: universe.name,
      futureYears,
      futureSelfIntro: `我是来自「${universe.name}」的，${futureYears}年后的另一个你。`,
      signoff: `来自「${universe.name}」· ${futureYears}年后的你`,
    });
  }

  function reduce(state, action) {
    if (!state || !action || typeof action.type !== 'string') return state;

    switch (action.type) {
      case 'START':
        if (state.phase !== 'intro') return state;
        return makeState('question', state.answers, null);
      case 'CHOOSE': {
        if (state.phase !== 'question' || state.answers.length >= data.questions.length) return state;
        const question = data.questions[state.answers.length];
        const isCurrentOption = question.options.some(({ id }) => id === action.optionId);
        if (!isCurrentOption) return state;
        return makeState('feedback', [...state.answers, action.optionId], null);
      }
      case 'ADVANCE':
        if (state.phase !== 'feedback') return state;
        return makeState(
          state.answers.length === data.questions.length ? 'sealing' : 'question',
          state.answers,
          null,
        );
      case 'BACK':
        if (!['question', 'feedback'].includes(state.phase) || state.answers.length === 0) return state;
        return makeState('question', state.answers.slice(0, -1), null);
      case 'SEAL_DONE':
        if (state.phase !== 'sealing' || state.answers.length !== data.questions.length) return state;
        {
          const resolution = resolveScene(state.answers);
          return makeState('reveal', state.answers, {
            ...resolution,
            edition: deriveLetterEdition(state.answers, resolution),
            narrativeFuture: deriveNarrativeFuture(state.answers, resolution),
          });
        }
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

  function enumerateOutcomeStats() {
    const counts = Object.fromEntries(data.scenes.map(({ id }) => [id, 0]));
    const total = 2 ** data.questions.length;
    for (let path = 0; path < total; path += 1) {
      const answerIds = data.questions.map((question, index) => question.options[(path >> index) & 1].id);
      counts[resolveScene(answerIds).sceneId] += 1;
    }
    const shares = Object.values(counts).map((count) => count / total);
    return deepFreeze({
      total,
      counts,
      minimumShare: Math.min(...shares),
      maximumShare: Math.max(...shares),
    });
  }

  return deepFreeze({
    createInitialState,
    reduce,
    scoreAnswers,
    resolveScene,
    getEvidence,
    encodePathStamp,
    deriveLetterEdition,
    deriveNarrativeFuture,
    enumerateOutcomeStats,
  });
});
