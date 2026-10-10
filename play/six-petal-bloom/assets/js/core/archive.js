// 本地作品仓库：仅保存成章截图与必要题签，不保存可执行内容。
(function attachArchive(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LCN = root.LCN || {};
  Object.assign(root.LCN, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function createArchiveApi() {
  'use strict';

  const STORAGE_KEY = 'liuchu-ninghua:works:v1';

  function safeParse(value) {
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function normalize(work) {
    if (!work || !work.id || !/^data:image\//.test(String(work.dataUrl || ''))) return null;
    return {
      id: String(work.id),
      dataUrl: String(work.dataUrl),
      createdAt: Number(work.createdAt) || 0,
      title: String(work.title || '无题'),
      vesselName: String(work.vesselName || ''),
    };
  }

  function createWorkArchive(storage, options) {
    const target = storage || null;
    const limit = Math.max(1, Math.floor(Number(options && options.limit) || 8));

    function read() {
      if (!target || typeof target.getItem !== 'function') return [];
      try {
        return safeParse(target.getItem(STORAGE_KEY))
          .map(normalize)
          .filter(Boolean)
          .sort((left, right) => right.createdAt - left.createdAt);
      } catch (error) {
        return [];
      }
    }

    function persist(items) {
      if (!target || typeof target.setItem !== 'function') return false;
      const next = items.slice(0, limit);
      while (next.length) {
        try {
          target.setItem(STORAGE_KEY, JSON.stringify(next));
          return true;
        } catch (error) {
          // localStorage 空间不足时只淘汰最旧的一张，不影响当前创作。
          next.pop();
        }
      }
      try {
        target.setItem(STORAGE_KEY, '[]');
      } catch (error) { /* 无可用持久化空间 */ }
      return false;
    }

    return {
      list: read,
      get(id) {
        const targetId = String(id);
        return read().find((item) => item.id === targetId) || null;
      },
      add(work) {
        const item = normalize(work);
        if (!item) return null;
        const next = [item].concat(read().filter((existing) => existing.id !== item.id));
        persist(next);
        return item;
      },
    };
  }

  return { STORAGE_KEY, createWorkArchive };
}));

