(function attachPrng(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LCN = root.LCN || {};
  Object.assign(root.LCN, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function createPrngApi() {
  'use strict';

  function hashString(value) {
    const text = String(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  function seedFromParts() {
    return hashString(Array.from(arguments).map(stableStringify).join('|'));
  }

  function mulberry32(seed) {
    let state = seed >>> 0;
    return function nextRandom() {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function quantizePoint(point) {
    return {
      x: Math.round(clamp01(point.x) * 4095),
      y: Math.round(clamp01(point.y) * 4095),
    };
  }

  return { clamp01, hashString, mulberry32, quantizePoint, seedFromParts };
}));
