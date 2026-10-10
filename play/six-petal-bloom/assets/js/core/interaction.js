// 交互映射保持为纯函数，便于鼠标模拟器与真机触摸使用同一方向合同。
(function attachInteraction(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LCN = root.LCN || {};
  Object.assign(root.LCN, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function createInteractionApi() {
  'use strict';

  function mapOrbitDrag(deltaX, deltaY, scale) {
    const ratio = Number.isFinite(scale) ? scale : 1;
    return {
      yaw: -deltaX * ratio,
      pitch: deltaY * ratio,
    };
  }

  return { mapOrbitDrag };
}));

