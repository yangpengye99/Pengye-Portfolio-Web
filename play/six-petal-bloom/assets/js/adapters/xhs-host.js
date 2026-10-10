(function attachHostAdapter(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LCN = root.LCN || {};
  Object.assign(root.LCN, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function createHostApi() {
  'use strict';

  function detectCapabilities(bridge) {
    return {
      save: Boolean(bridge && typeof bridge.saveImageToPhotosAlbum === 'function'),
      publish: Boolean(bridge && typeof bridge.postNote === 'function'),
      tempFile: Boolean(bridge && typeof bridge.writeTempFile === 'function'),
    };
  }

  function createHostAdapter(bridgeOrProvider) {
    function resolveBridge() {
      return typeof bridgeOrProvider === 'function' ? bridgeOrProvider() : bridgeOrProvider;
    }
    return {
      get capabilities() {
        return detectCapabilities(resolveBridge());
      },
      async saveImage(dataUrl) {
        const bridge = resolveBridge();
        const capabilities = detectCapabilities(bridge);
        if (!capabilities.save) return { ok: false, fallback: 'screenshot' };
        try {
          let filePath = dataUrl;
          if (capabilities.tempFile) {
            const temporary = await bridge.writeTempFile({ data: dataUrl });
            filePath = temporary.filePath;
          }
          await bridge.saveImageToPhotosAlbum({ filePath });
          return { ok: true, method: 'native-save' };
        } catch (error) {
          return { ok: false, fallback: 'screenshot', error: error && error.errMsg ? error.errMsg : String(error) };
        }
      },
      async publishImage(dataUrl, metadata) {
        const bridge = resolveBridge();
        const capabilities = detectCapabilities(bridge);
        if (!capabilities.publish) return { ok: false, fallback: 'screenshot' };
        try {
          await bridge.postNote({
            title: String(metadata.title || '六出凝华').slice(0, 20),
            content: String(metadata.content || '').slice(0, 1000),
            pageType: 'photo_publish',
            mediaInfo: { image_resources: [{ url: dataUrl }] },
            tags: String(metadata.tags || ''),
          });
          return { ok: true, method: 'native-post' };
        } catch (error) {
          return { ok: false, fallback: 'screenshot', error: error && error.errMsg ? error.errMsg : String(error) };
        }
      },
    };
  }

  return { createHostAdapter, detectCapabilities };
}));
