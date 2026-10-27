/* CoffeePhotos — 冲煮记录照片：IndexedDB 存 JPEG Blob，主数据(JSON)里只存照片 id 引用。
 * 兼容性设计（微信内置 / 夸克等内核上必须可靠）：
 *  - 选图 → stage()：同步生成 id + 原图 objectURL 立即显示，不经画布、不碰 IndexedDB；
 *  - 保存 → persist()：记录保存后后台执行，逐张压缩（失败/超时用原图），任何失败只提示、绝不阻断记录；
 *  - 所有 IndexedDB 读写都带超时兜底，内核挂起时走降级路径而不是永远等待。 */
(function (root) {
  'use strict';

  var DB_NAME = 'coffeelab-photos';
  var STORE = 'photos';
  var DB_VERSION = 1;
  var MAX_EDGE = 1280;          /* 压缩后长边上限（px） */
  var JPEG_QUALITY = 0.78;
  var IO_TIMEOUT = 4000;        /* 单次 IndexedDB 操作/压缩兜底时限 */

  var dbPromise = null;
  var urlCache = {};            /* photoId -> objectURL，会话内复用 */

  function genId() {
    return 'ph-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /* 承诺超时兜底：p 不论成功/失败/挂起，ms 内必然落定（挂起/出错都取 fallback 值） */
  function withTimeout(p, ms, fallback) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; resolve(fallback); }
      }, ms);
      Promise.resolve(p).then(function (v) {
        if (!done) { done = true; clearTimeout(timer); resolve(v); }
      }, function () {
        if (!done) { done = true; clearTimeout(timer); resolve(fallback); }
      });
    });
  }

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'id' })
            .createIndex('brewId', 'brewId', { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    /* open 本身也可能挂起：包一层超时，失败则置空避免反复重试 */
    return (dbPromise = withTimeout(dbPromise, IO_TIMEOUT, null).then(function (db) {
      if (!db) dbPromise = Promise.reject(new Error('IndexedDB 不可用'));
      return db;
    }));
  }

  function withStore(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var req = fn(t.objectStore(STORE));
        t.oncomplete = function () { resolve(req && req.result !== undefined ? req.result : undefined); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  function put(rec) { return withStore('readwrite', function (st) { return st.put(rec); }); }
  function get(id) { return withStore('readonly', function (st) { return st.get(id); }); }
  function getMany(ids) {
    return Promise.all((ids || []).map(function (id) { return get(id).catch(function () { return null; }); }))
      .then(function (rows) { return rows.filter(Boolean); });
  }
  function deleteIds(ids) {
    return withStore('readwrite', function (st) {
      (ids || []).forEach(function (id) { st.delete(id); delete urlCache[id]; });
      return null;
    });
  }
  function deleteByBrew(brewId) {
    return withStore('readwrite', function (st) {
      var keys = st.index('brewId').getAllKeys(brewId);
      keys.onsuccess = function () {
        keys.result.forEach(function (id) { st.delete(id); delete urlCache[id]; });
      };
      return null;
    });
  }
  function deleteAll() {
    urlCache = {};
    return withStore('readwrite', function (st) { return st.clear(); });
  }

  /* ---------- Blob ⇄ base64 ---------- */

  function blobToDataURL(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(blob);
    });
  }

  function dataURLToBlob(dataURL) {
    var comma = dataURL.indexOf(',');
    var meta = dataURL.slice(0, comma);
    var mime = /data:([^;]+)/.exec(meta);
    var bin = atob(dataURL.slice(comma + 1));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime ? mime[1] : 'image/jpeg' });
  }

  /* ---------- 压缩（仅保存阶段使用；失败一律降级用原图） ---------- */

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('无法读取图片')); };
      img.src = url;
    });
  }

  /* canvas → JPEG Blob；个别旧内核 toBlob 缺失/不回调，用 toDataURL 兜底 */
  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      function fallback() {
        if (settled) return;
        settled = true;
        try { resolve(dataURLToBlob(canvas.toDataURL('image/jpeg', JPEG_QUALITY))); }
        catch (e) { reject(new Error('图片压缩失败')); }
      }
      if (!canvas.toBlob) { fallback(); return; }
      var timer = setTimeout(fallback, 1500);
      canvas.toBlob(function (blob) {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (blob) resolve(blob); else fallback();
      }, 'image/jpeg', JPEG_QUALITY);
    });
  }

  var MAX_CANVAS_PIXELS = 16777216;   /* 超大图先逐级减半，规避移动端画布面积上限 */

  function compress(file) {
    return loadImage(file).then(function (img) {
      var src = img, w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (!w || !h) return Promise.reject(new Error('无法读取图片'));
      while (w * h > MAX_CANVAS_PIXELS) {
        var step = document.createElement('canvas');
        step.width = Math.max(1, Math.round(w / 2));
        step.height = Math.max(1, Math.round(h / 2));
        step.getContext('2d').drawImage(src, 0, 0, step.width, step.height);
        src = step; w = step.width; h = step.height;
      }
      var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
      return canvasToBlob(canvas);
    });
  }

  /* ---------- 页面辅助 ---------- */

  /* 选图瞬间调用：同步返回 {id, blob, url}，url 立即可用于 <img> 显示（原图直出） */
  function stage(file) {
    return { id: genId(), blob: file, url: URL.createObjectURL(file) };
  }

  /* 记录保存成功后后台落库：entries 里只写带 blob 的（新选图），removedIds 为编辑时移除的旧照片。
   * 返回 {saved, failed}；内部所有失败都降级（压缩失败用原图），不会 reject。 */
  function persist(brewId, entries, removedIds) {
    var pre = (removedIds && removedIds.length) ? deleteIds(removedIds).catch(function () {}) : Promise.resolve();
    var fresh = (entries || []).filter(function (p) { return p && p.id && p.blob; });
    return pre.then(function () {
      return Promise.all(fresh.map(function (p) {
        return withTimeout(compress(p.blob), IO_TIMEOUT, p.blob)
          .then(function (blob) {
            return put({ id: p.id, brewId: brewId || null, createdAt: new Date().toISOString(), blob: blob });
          })
          .then(function () { return true; })
          .catch(function () { return false; });      /* 单张失败不影响其他 */
      })).then(function (rs) {
        var saved = rs.filter(Boolean).length;
        return { saved: saved, failed: rs.length - saved };
      });
    }).catch(function () { return { saved: 0, failed: fresh.length }; });
  }

  /* 取照片显示用 URL（缓存命中/照片不存在/超时 → null），读方自行隐藏占位 */
  function urlFor(id) {
    if (urlCache[id]) return Promise.resolve(urlCache[id]);
    return withTimeout(get(id), IO_TIMEOUT, null).then(function (rec) {
      if (!rec || !rec.blob) return null;
      urlCache[id] = URL.createObjectURL(rec.blob);
      return urlCache[id];
    }).catch(function () { return null; });
  }

  /* ---------- 导出 / 导入 ---------- */

  /* 导出 brews 引用到的照片为 [{id, brewId, createdAt, data}]（base64 内嵌） */
  function exportFor(brews) {
    var ids = [];
    (brews || []).forEach(function (w) {
      (w.photos || []).forEach(function (id) { ids.push(id); });
    });
    return getMany(ids).then(function (rows) {
      return Promise.all(rows.map(function (rec) {
        return blobToDataURL(rec.blob).then(function (data) {
          return { id: rec.id, brewId: rec.brewId, createdAt: rec.createdAt, data: data };
        });
      }));
    });
  }

  /* 导入：replace=true 先清空；按 id 去重跳过已存在。返回 {added, skipped} */
  function importRecords(list, opts) {
    opts = opts || {};
    var step = opts.replace ? deleteAll() : Promise.resolve();
    return step.then(function () {
      var added = 0, skipped = 0;
      return (list || []).reduce(function (chain, item) {
        return chain.then(function () {
          if (!item || !item.id || !item.data) { return null; }
          return get(item.id).then(function (exists) {
            if (exists) { skipped++; return null; }
            return put({
              id: item.id, brewId: item.brewId || null,
              createdAt: item.createdAt || new Date().toISOString(),
              blob: dataURLToBlob(item.data)
            }).then(function () { added++; });
          });
        });
      }, Promise.resolve()).then(function () { return { added: added, skipped: skipped }; });
    });
  }

  root.CoffeePhotos = {
    MAX_PHOTOS: 3,
    stage: stage,
    persist: persist,
    urlFor: urlFor,
    deleteIds: deleteIds,
    deleteByBrew: deleteByBrew,
    deleteAll: deleteAll,
    exportFor: exportFor,
    importRecords: importRecords,
    /* 供测试/调试 */
    _internal: { dataURLToBlob: dataURLToBlob, MAX_EDGE: MAX_EDGE, JPEG_QUALITY: JPEG_QUALITY }
  };
})(typeof self !== 'undefined' ? self : this);
