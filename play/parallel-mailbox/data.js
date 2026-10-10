(function initMemoryEnvelopeData(root, factory) {
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  if (root) root.MemoryEnvelopeData = value;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMemoryEnvelopeData() {
  'use strict';

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
    return value;
  }

  function choiceCell(atlasNumber, cell, alt) {
    return {
      path: `./assets/choices/today-atlas-v3-0${atlasNumber}.webp`,
      column: cell % 2,
      row: Math.floor(cell / 2),
      alt,
    };
  }

  function resultCell(universeIndex, directionIndex, alt) {
    return {
      path: `./assets/results/parallel-universe-v1-0${universeIndex + 1}.webp`,
      column: directionIndex % 2,
      row: Math.floor(directionIndex / 2),
      alt,
    };
  }

  const intro = {
    eyebrow: '平行信箱',
    englishEyebrow: 'PARALLEL MAILBOX',
    title: '把今天寄出去，收一封平行时空的回信',
    titleLines: ['把今天寄出去', '收一封平行时空的回信'],
    method: '看 8 组照片，点更想停一下的那张，装进信封。',
    resultHint: '选完，另一个可能里的你会寄回一张照片和一封信。',
    trust: '这是一段平行故事，不预测真实未来，也不定义你。',
    heroAsset: {
      path: './assets/ui/parallel-mailbox-v1.png',
      alt: '一只夜色中亮着暖光的复古信箱，等待收下今晚的照片信封',
    },
  };

  const letterTemplates = [
    { id: 'received' },
    { id: 'paused' },
    { id: 'side-by-side' },
    { id: 'reply' },
  ];

  const shareKeywords = {
    'q01-a': '包与钥匙',
    'q01-b': '回家灯',
    'q02-a': '雨夜车窗',
    'q02-b': '散场桌面',
    'q03-a': '热面',
    'q03-b': '干净床单',
    'q04-a': '并肩街口',
    'q04-b': '电话声音',
    'q05-a': '晚间站台',
    'q05-b': '湿斑马线',
    'q06-a': '合上电脑',
    'q06-b': '明早桌面',
    'q07-a': '明日行囊',
    'q07-b': '明日一页',
    'q08-a': '帘缝晨光',
    'q08-b': '深夜亮窗',
  };

  const directions = [
    {
      id: 'continuity',
      label: '延续',
      short: '今天仍可以轻轻接到明天',
      description: '信封更常收下那些让普通一天慢慢延续下去的痕迹。',
    },
    {
      id: 'connection',
      label: '相连',
      short: '这一刻与自己或别人相连',
      description: '信封更常收下那些让陪伴、递接与彼此惦记被看见的痕迹。',
    },
    {
      id: 'guidance',
      label: '指引',
      short: '普通片刻为下一步留线索',
      description: '信封更常收下那些像路标或小准备一样指向下一步的痕迹。',
    },
    {
      id: 'possibility',
      label: '可能',
      short: '明天仍可以换一种走法',
      description: '信封更常收下那些还没发生、仍可以慢慢改变的画面。',
    },
  ];

  const carriers = [
    { id: 'people', label: '人物', description: '人影、手势、陪伴或相遇的画面。' },
    { id: 'place', label: '地方', description: '房间、道路、门口、楼道或停留空间。' },
    { id: 'object', label: '物件', description: '包、钥匙、餐具、电脑或日常用品。' },
    { id: 'ritual', label: '仪式', description: '重复动作、时刻、准备或共同习惯。' },
  ];

  const universes = [
    {
      id: 'companionship',
      scoreKey: 'people',
      name: '同行宇宙',
      description: '在那里，普通的陪伴、回应与相遇，会替生活留下一点余温。',
    },
    {
      id: 'shelter',
      scoreKey: 'place',
      name: '落脚宇宙',
      description: '在那里，房间、道路和一盏灯，会替忙完一天的人留一个位置。',
    },
    {
      id: 'keepsake',
      scoreKey: 'object',
      name: '手边宇宙',
      description: '在那里，钥匙、杯子和一页纸，会记住被忽略的小小日常。',
    },
    {
      id: 'rhythm',
      scoreKey: 'ritual',
      name: '节拍宇宙',
      description: '在那里，一个收尾或小准备，会让今天和明天慢慢接上。',
    },
  ];

  const rawQuestions = [
    {
      id: 'q01',
      dimension: 'carrier',
      prompt: '忙完今天这一切，哪一幕更像你此刻的状态？',
      options: [
        ['q01-a', '进门刚放下的包和钥匙', '普通玄关里，包靠着墙，钥匙刚放在桌面。', 'object', 2, 0],
        ['q01-b', '为我留着的那盏灯', '出租屋或宿舍里，一盏灯把房间照得安静。', 'place', 2, 1],
      ],
    },
    {
      id: 'q02',
      dimension: 'carrier',
      prompt: '如果给今天的心情留张照片，你会按下哪次快门？',
      options: [
        ['q02-a', '雨夜车窗上被拉长的灯', '晚间车窗映着城市灯光，雨痕让它们慢慢晃开。', 'place', 2, 2],
        ['q02-b', '散场后还亮着的桌面', '几只杯子留在桌上，像刚有人在这里说过话。', 'people', 2, 3],
      ],
    },
    {
      id: 'q03',
      dimension: 'carrier',
      prompt: '今晚，你更想被哪件小事接住？',
      options: [
        ['q03-a', '一碗还冒着热气的面', '简单的一碗面冒着热气，旁边没有多余摆设。', 'object', 1, 0],
        ['q03-b', '刚铺平的干净床单', '普通房间里，床单刚铺好，留出可以休息的位置。', 'ritual', 1, 1],
      ],
    },
    {
      id: 'q04',
      dimension: 'carrier',
      prompt: '今天，哪种陪伴更让你想多停一会儿？',
      options: [
        ['q04-a', '一起走到街口的两个人', '两个年轻背影并肩过街，没有露出清晰面孔。', 'people', 1, 2],
        ['q04-b', '电话里让你慢下来的声音', '窗边的人只露出背影，手机亮着，没有可读文字。', 'ritual', 1, 3],
      ],
    },
    {
      id: 'q05',
      dimension: 'direction',
      prompt: '回看今天走过的路，哪一段更想被记住？',
      options: [
        ['q05-a', '下班后经过的那段站台', '普通站台在晚灯下延伸，脚步刚从这里经过。', 'continuity', 3, 0, '今天的脚步仍在向下一站延续'],
        ['q05-b', '雨停后刚走过的斑马线', '路面还湿着，白线向街道另一边慢慢展开。', 'guidance', 3, 1, '眼前的白线为下一步留了方向'],
      ],
    },
    {
      id: 'q06',
      dimension: 'direction',
      prompt: '今天还没做完的事，你更想先放在哪？',
      options: [
        ['q06-a', '今晚先合上的电脑', '电脑已经合上，旁边留着一页没有写完的清单。', 'guidance', 3, 2, '没写完的清单仍替下一步留着线索'],
        ['q06-b', '留到明早再收的桌面', '杯子和外套还没归位，房间仍给明天留着余地。', 'possibility', 3, 3, '未完成的桌面也容得下另一种继续'],
      ],
    },
    {
      id: 'q07',
      dimension: 'direction',
      prompt: '想到明天，你更像会做哪种小准备？',
      options: [
        ['q07-a', '门边为明天放好的鞋和包', '鞋、包和钥匙靠在一起，像一项不用费力的小准备。', 'continuity', 4, 0, '今天的小准备轻轻接到了明天'],
        ['q07-b', '给明天的自己留下一页', '笔记本摊在桌上，只留下一个没有文字的记号。', 'connection', 4, 1, '今天和明天在这一页轻轻相连'],
      ],
    },
    {
      id: 'q08',
      dimension: 'direction',
      prompt: '寄出这封信前，哪一幕更想留给几年后的你？',
      options: [
        ['q08-a', '窗帘缝里快亮起来的天', '清晨的光从窗帘缝里进来，房间还没完全醒。', 'possibility', 4, 2, '明天仍给新的走法留着一点光'],
        ['q08-b', '深夜里还亮着的一扇窗', '远处楼里只有一扇窗亮着，光停在夜色里。', 'connection', 4, 3, '远处的灯，让这个夜晚还有一点回应'],
      ],
    },
  ];

  const questions = rawQuestions.map((question) => ({
    id: question.id,
    dimension: question.dimension,
    prompt: question.prompt,
    options: question.options.map(([
      id,
      title,
      caption,
      contribution,
      atlasNumber,
      cell,
      microcopy,
    ]) => ({
      id,
      title,
      caption,
      shareKeyword: shareKeywords[id],
      ...(microcopy ? { microcopy } : {}),
      asset: choiceCell(atlasNumber, cell, `${title}，匿名合成的当代胶片照片`),
      envelopeContribution: { [question.dimension]: contribution },
    })),
  }));

  const rawScenes = [
    ['people-continuity', 'people', 'continuity', '晚归站台上的脚步', 'FOOTSTEPS ON THE LATE PLATFORM', '今天，走到这里已经算数。'],
    ['people-connection', 'people', 'connection', '街口并肩的两个人', 'TWO PEOPLE AT THE CORNER', '今天，没说完也可以慢慢说。'],
    ['people-guidance', 'people', 'guidance', '替人扶住的那扇门', 'THE DOOR HELD OPEN', '今天，拿不准就先问一小步。'],
    ['people-possibility', 'people', 'possibility', '空着一把椅子的长桌', 'AN OPEN SEAT AT THE TABLE', '今天，新的相遇不急着回答。'],
    ['place-continuity', 'place', 'continuity', '回家后亮起的房间', 'THE ROOM LIT AFTER RETURNING', '今天，先让自己有地方落脚。'],
    ['place-connection', 'place', 'connection', '深夜仍亮着的一扇窗', 'A WINDOW STILL LIT', '今天，一点回应就已经很好。'],
    ['place-guidance', 'place', 'guidance', '雨停后看清的路口', 'THE CROSSING AFTER RAIN', '今天，看清下一段就够了。'],
    ['place-possibility', 'place', 'possibility', '清晨的另一处出口', 'ANOTHER EXIT IN THE MORNING', '今天，路线也可以换种走法。'],
    ['object-continuity', 'object', 'continuity', '门边用旧的包和钥匙', 'THE BAG AND KEYS BY THE DOOR', '今天，小小的真实值得记住。'],
    ['object-connection', 'object', 'connection', '桌上多放的一只杯子', 'AN EXTRA CUP ON THE TABLE', '今天，也允许自己接住好意。'],
    ['object-guidance', 'object', 'guidance', '今晚先合上的电脑', 'THE LAPTOP CLOSED FOR TONIGHT', '今天，做到这里先停也算认真。'],
    ['object-possibility', 'object', 'possibility', '留给明早的一页', 'A PAGE LEFT FOR MORNING', '今天，没完成也能换处继续。'],
    ['ritual-continuity', 'ritual', 'continuity', '关灯前的一杯水', 'A GLASS OF WATER BEFORE LIGHTS OUT', '今天，用小动作告诉自己结束。'],
    ['ritual-connection', 'ritual', 'connection', '窗边一通普通电话', 'A QUIET CALL BY THE WINDOW', '今天，想听熟悉的声音很平常。'],
    ['ritual-guidance', 'ritual', 'guidance', '为明天放好的鞋和包', 'SHOES AND A BAG FOR TOMORROW', '今天，只替明天少做个决定。'],
    ['ritual-possibility', 'ritual', 'possibility', '窗帘缝里的第一束光', 'FIRST LIGHT THROUGH THE CURTAIN', '今天，明天还能换一个开头。'],
  ];

  const letterVariantsBySceneId = {
    'people-continuity': [
      { id: 'witness', body: '这一天已经走完了，先别急着给它打分呀。你认认真真撑完了今天，本身就很不容易；睡前记住一件做成的小事，明天再轻一点出发。今晚先把自己放回心里。' },
      { id: 'handoff', body: '有些路走着时看不出意义，也没关系呀。暂时没有结果，不等于白走；今晚先好好休息，明天的你会带着今天继续往前。你走的每一步，都算数。' },
    ],
    'people-connection': [
      { id: 'witness', body: '没说完的话，不必一次讲完呀。想被听见时，发一句普通的“在吗”就很好；暂时不想开口也没关系，你不用独自把感受都整理好。被理解，不用赶时间。' },
      { id: 'handoff', body: '想一个人待着和想有人陪，都没有错呀。可以找信任的人吃顿饭、走几步；哪怕只是并排坐一会儿，今晚也会轻一点。有人在的时候，不用说很多。' },
    ],
    'people-guidance': [
      { id: 'witness', body: '拿不准的时候，别逼自己今晚就想通。可以把问题缩成一句话，问一个信得过的人；听完别人的想法，再按自己的节奏决定。最后的答案，仍在你手里。' },
      { id: 'handoff', body: '答案不必今晚就凑齐，复杂的事本来就值得慢慢想。先确认眼前最具体的一步就够了；开口求助，也不会拿走你的判断。慢一点，真的没关系。' },
    ],
    'people-possibility': [
      { id: 'witness', body: '新的相遇，不必急着给它命名呀。可以从很小的开口开始：回一条消息，或答应一次短暂同行；结果不用现在决定，慢慢来就好。你依然可以保留自己的节奏。' },
      { id: 'handoff', body: '有些同行只走一小段，也会留下真实的温度。先把自己照顾好，再给明天留一个容易靠近的入口；新的关系可以慢慢发生。靠近别人，不必先勉强自己。' },
    ],
    'place-continuity': [
      { id: 'witness', body: '今天在外面应付了很多事，回来就别急着振作啦。先坐稳、喝口水，让身体一点点松下来；今天已经走完，剩下的明天再继续。现在，先让自己回到安全里。' },
      { id: 'handoff', body: '房间不用收拾得很好，今天也不用总结得多完整。关掉一会儿消息，找个舒服的角落待十分钟；今晚先让自己平安回来。能松一口气，就已经很好啦。' },
    ],
    'place-connection': [
      { id: 'witness', body: '热闹过，或是独处了很久，都可能让人想确认：自己还和世界连着。可以回一条想回的消息，也可以先点亮自己的小空间，一点回应就够了。你不必用热闹来证明自己。' },
      { id: 'handoff', body: '孤单不必说得很清楚，也不用拿热闹证明自己被在乎。想靠近，就发一句简单的问候；不想说话，就先休息。你值得被温柔对待，安静也不是被世界落下。' },
    ],
    'place-guidance': [
      { id: 'witness', body: '事情很多、远处又不确定时，不必一次看完整条路。把明天缩成十分钟就能开始的一步；先走好眼前这一段，就已经在往前啦。你只需要照顾好这一小步。' },
      { id: 'handoff', body: '今天有些混乱，也没关系呀。先确认一个时间、一个入口，或一个可以商量的人；只要下一步看得见，你就不算停在原地。方向，会在行动里慢慢长出来。' },
    ],
    'place-possibility': [
      { id: 'witness', body: '计划被打乱，不等于今天走错了呀。可以换个顺序、延后一小段，或者留一点空白；调整不是放弃，是在照顾现在的自己。换一种走法，也是在前进。' },
      { id: 'handoff', body: '原来的办法不合适了，换条路也没关系。先删掉一个不必要的要求，再挑一个更容易开始的方式；你不必困在旧的安排里。新的顺序，一样可以成立。' },
    ],
    'object-continuity': [
      { id: 'witness', body: '任务和消息再多，生活也不只剩下待办呀。摸一摸手边熟悉的东西，喝口水、慢慢呼吸；普通的一天，也值得被认真过完。这些小事，也在陪你生活。' },
      { id: 'handoff', body: '完成了多少，不是今晚唯一的记录。你用过、碰过、经过的小事，都算今天真实地存在过；把一件常用的东西放好，给明早留点从容。平常本身，就值得被看见。' },
    ],
    'object-connection': [
      { id: 'witness', body: '别人递来的好意，不必先换算成亏欠呀。可以坦然收下一句关心，再真诚说声谢谢；被照顾，不需要先证明自己足够辛苦。接受好意，也不需要道歉。' },
      { id: 'handoff', body: '温柔，不是欠谁一份人情。愿意的话，先接住一点好意，再把边界轻轻说清楚；关系既可以温暖，也可以很轻松。舒服的关系，从来容得下拒绝。' },
    ],
    'object-guidance': [
      { id: 'witness', body: '做到这里，就已经算数啦。还有事没做完时，记下明天从哪里继续，然后先吃饭、先休息；停下来不是偷懒，是把自己也放进计划里。休息，也属于今天的安排。' },
      { id: 'handoff', body: '今晚，不必把最后一点力气也交出去。留一个清楚的入口，让设备和脑子都停一会儿；明天可以从入口开始，而不是从内疚开始。暂停，不是把事情弄丢。' },
    ],
    'object-possibility': [
      { id: 'witness', body: '没按原样完成，不等于做过的都作废呀。可以缩小目标、换个时间，或换一种方式开始；你仍然留着继续选择的余地。变化里面，也能长出新的答案。' },
      { id: 'handoff', body: '空白不是失败，它只是还没做好决定。先保存已经完成的部分，明天再补一小步、或重新安排；更适合现在的版本，同样可以成立。完成的样子，由你重新决定。' },
    ],
    'ritual-continuity': [
      { id: 'witness', body: '今天再乱，也能用一个小动作温柔收尾。倒杯水、洗把脸、或关一盏灯，选一个就够啦；做完以后，安心告诉自己：今天结束了。这一晚，也值得被好好照顾。' },
      { id: 'handoff', body: '不需要一场完美的仪式呀。选一件两分钟内就能做完的小事，做完就不再加任务；今晚能安稳睡下，比整理得漂亮更重要。够用的收尾，就是好收尾。' },
    ],
    'ritual-connection': [
      { id: 'witness', body: '想听见熟悉的声音，不代表你不够坚强呀。可以发一句普通的话，或安静听完一段语音；想靠近，是在认真照顾自己的感受。需要陪伴，不必觉得抱歉。' },
      { id: 'handoff', body: '回应可以晚一点到，陪伴也可以隔着距离。愿意，就说一句简单的问候；不愿意，也能先把名字放在心里。今晚按舒服的方式靠近，想念本身就是一种连接。' },
    ],
    'ritual-guidance': [
      { id: 'witness', body: '今天已经做了太多决定，明天的事不必今晚全想完。先放好一件要带的东西，做完就停；这一点准备，已经替自己省下了力气。明早的你，会因此多一点从容。' },
      { id: 'handoff', body: '准备，不必变成新的任务清单。先处理最容易忘的那一件，其余交给明早的自己；你不是在催促未来，只是在温柔照顾自己。现在做一点，就已经够啦。' },
    ],
    'ritual-possibility': [
      { id: 'witness', body: '明天，不必照着今天的剧本开始。先睡一觉，醒来再挑一个更合适的小开头；重新开始不是否定今天，而是给自己新的空间。你随时有权，为明天换个方向。' },
      { id: 'handoff', body: '今天留下的遗憾、疲惫或不甘，都没关系呀。先让夜晚接住你，明天只做一个不同的小选择；你还来得及慢慢调整。新的开始，不需要证明什么。' },
    ],
  };

  const sceneSubtitles = {
    'people-continuity': '站台仍向前，也给你留了位置。',
    'people-connection': '并肩走一段，不必急着说完。',
    'people-guidance': '有人扶住门，下一步仍由你选。',
    'people-possibility': '空着的椅子，等一场新的相遇。',
    'place-continuity': '夜里的房间，能让脚步慢下来。',
    'place-connection': '一扇亮着的窗，也是一种回应。',
    'place-guidance': '雨后的路口，只照亮下一段。',
    'place-possibility': '另一处出口，也是一种走法。',
    'object-continuity': '用旧的小东西，也记住了今天。',
    'object-connection': '多放的一只杯子，也在接住你。',
    'object-guidance': '合上的电脑，替明天保留入口。',
    'object-possibility': '空白的一页，等更合适的开始。',
    'ritual-continuity': '一杯水，也能把今天轻轻放好。',
    'ritual-connection': '一通普通电话，让距离可以靠近。',
    'ritual-guidance': '门边的准备，替你少费一点力。',
    'ritual-possibility': '第一束光，提醒今天还能重来。',
  };

  const sceneLeadLines = Object.fromEntries(rawScenes.map(([id, , , , , lead]) => {
    const separator = lead.indexOf('，');
    return [id, separator < 0 ? [lead] : [lead.slice(0, separator + 1), lead.slice(separator + 1)]];
  }));
  const universeIndex = new Map(universes.map(({ scoreKey }, index) => [scoreKey, index]));
  const universeByScoreKey = new Map(universes.map((universe) => [universe.scoreKey, universe]));
  const directionIndex = new Map(directions.map(({ id }, index) => [id, index]));
  const scenes = rawScenes.map(([
    id,
    carrier,
    direction,
    title,
    englishTitle,
    lead,
  ]) => {
    const universe = universeByScoreKey.get(carrier);
    const photoCaption = `来自${universe.name}的照片：${title}`;
    return {
      id,
      carrier,
      direction,
      universeId: universe.id,
      title,
      englishTitle,
      photoCaption,
      todayMessage: {
        lead,
        leadLines: sceneLeadLines[id],
        subtitle: sceneSubtitles[id],
        variants: letterVariantsBySceneId[id],
      },
      asset: resultCell(
        universeIndex.get(carrier),
        directionIndex.get(direction),
        `平行宇宙寄回的日常照片：${title}`,
      ),
    };
  });
  const result = {
    productName: '平行信箱',
    englishName: 'PARALLEL MAILBOX',
    boundary: '这是一段由今晚 8 次选择生成的平行故事，不判断情绪，不测试人格，也不预测真实未来。',
    futureBoundary: '平行宇宙与“几年后”是今晚邮戳对应的创意坐标，不代表真实未来。',
    possibilityBoundary: '“可能”只是一种内容方向，不代表我们知道你的愿望、恐惧或未来。',
    intro,
    letterTemplates,
    directions,
    carriers,
    universes,
    questions,
    scenes,
  };

  return deepFreeze(result);
});
