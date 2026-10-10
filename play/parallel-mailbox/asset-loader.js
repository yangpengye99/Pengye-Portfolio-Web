(function initMemoryEnvelopeAssets(root) {
  'use strict';

  const data = root.MemoryEnvelopeData;
  if (!data) throw new Error('MemoryEnvelopeData must load before MemoryEnvelopeAssets');
  const cache = new Map();
  const declaredAssets = new Set([

    ...data.questions.flatMap((question) => question.options.map((option) => option.asset.path)),
    ...data.scenes.map((scene) => scene.asset.path),
  ]);

  function load(assetPath) {
    if (!declaredAssets.has(assetPath)) return Promise.resolve(false);
    if (cache.has(assetPath)) return cache.get(assetPath);

    const pending = new Promise((resolve) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(true), { once: true });
      image.addEventListener('error', () => resolve(false), { once: true });
      image.src = assetPath;
    });
    cache.set(assetPath, pending);
    return pending;
  }

  root.MemoryEnvelopeAssets = Object.freeze({ load });
})(typeof globalThis !== 'undefined' ? globalThis : this);
