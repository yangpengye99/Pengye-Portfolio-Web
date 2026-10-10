// 作品命名与纪时：沿用「法帖 / 卷 / 图 / 谱」的传统命名格式，
// 但全部为本项目当代生成的作品名，不指涉任何一件传世作品。
(function attachNaming(root, factory) {
  const dependencies = typeof module === 'object' && module.exports ? require('./prng.js') : root.LCN;
  const api = factory(dependencies);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LCN = root.LCN || {};
  Object.assign(root.LCN, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function createNamingApi(prngApi) {
  'use strict';

  const { mulberry32, seedFromParts } = prngApi;

  const SNOW_WORDS = Object.freeze([
    '凝华', '六出', '霁色', '玉尘', '素影', '澄冰', '疏英', '初凝',
    '寒芒', '冰绡', '霏微', '月痕', '寒英', '晴雪', '积素', '缀雪',
  ]);
  const FORMS = Object.freeze(['帖', '卷', '图', '谱', '册']);

  const DIGITS = Object.freeze(['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九']);
  const SHICHEN = Object.freeze([
    '子', '丑', '丑', '寅', '寅', '卯', '卯', '辰', '辰', '巳', '巳', '午',
    '午', '未', '未', '申', '申', '酉', '酉', '戌', '戌', '亥', '亥', '子',
  ]);

  function chineseYear(year) {
    return String(year).split('').map((digit) => DIGITS[Number(digit)]).join('');
  }

  function chineseNumber(value) {
    if (value <= 10) return value === 10 ? '十' : DIGITS[value];
    if (value < 20) return `十${DIGITS[value - 10]}`;
    const tens = Math.floor(value / 10);
    const ones = value % 10;
    return `${DIGITS[tens]}十${ones ? DIGITS[ones] : ''}`;
  }

  // 传统日序：初一…初十、十一…、廿一…
  function chineseDay(day) {
    if (day <= 10) return `初${chineseNumber(day)}`;
    if (day < 20) return `十${DIGITS[day - 10]}`;
    if (day === 20) return '二十';
    if (day < 30) return `廿${DIGITS[day - 20]}`;
    return day === 30 ? '三十' : '卅一';
  }

  /** 把公历时间写成传统纪时格式（公历日期 + 十二时辰），不做农历换算。 */
  function formatMoment(timestamp) {
    const date = new Date(Number(timestamp) || 0);
    return {
      full: `${chineseYear(date.getFullYear())}年${chineseNumber(date.getMonth() + 1)}月${chineseDay(date.getDate())}日`,
      hour: `${SHICHEN[date.getHours()]}时`,
      iso: `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`,
      clock: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
    };
  }

  /** 依据种子与用色生成作品名，例如《霁色帖》《六出凝华图》。 */
  function createWorkTitle(seed, colorNames) {
    const random = mulberry32(seedFromParts(seed, 'title', colorNames || []));
    const word = SNOW_WORDS[Math.floor(random() * SNOW_WORDS.length)];
    const form = FORMS[Math.floor(random() * FORMS.length)];
    const paired = random() > 0.62;
    const second = SNOW_WORDS[Math.floor(random() * SNOW_WORDS.length)];
    // 两词有共同字时不组合，避免出现「素影积素」式的重字。
    const clashes = second === word || Array.from(second).some((ch) => word.includes(ch));
    const body = paired && !clashes ? `${word}${second}` : word;
    return { body, form, full: `${body}${form}`, display: `《${body}${form}》` };
  }

  /** 依据主色与器物生成一句释名短句，用于海报侧栏。 */
  function createColophon(seed, vesselName, colorNames) {
    const random = mulberry32(seedFromParts(seed, 'colophon'));
    const openings = ['六出自器心生', '雪意起于盏底', '晶华自釉中出', '寒色循釉而行'];
    const closings = ['而后敛于口沿', '渐次布满器面', '止于留白处', '终成六重之势'];
    const first = openings[Math.floor(random() * openings.length)];
    const last = closings[Math.floor(random() * closings.length)];
    const colors = (colorNames || []).slice(0, 3).join('、');
    return `${first}，${last}。器为${vesselName}，色历${colors}。`;
  }

  return { FORMS, SNOW_WORDS, chineseDay, chineseNumber, chineseYear, createColophon, createWorkTitle, formatMoment };
}));
