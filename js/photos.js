/* CoffeePhotos — 冲煮记录照片：IndexedDB 存 JPEG Blob，主数据(JSON)里只存照片 id 引用。
 * 设计要点：
 *  - localStorage 约 5MB 配额放不下照片；IndexedDB 按源可有数百 MB，Blob 原样存储。
 *  - 选图后经 canvas 压缩（长边 ≤1280px、JPEG q0.78），统一格式并抹去 EXIF。
 *  - 导出：照片转 base64 内嵌进 JSON 备份；导入：解码写回 IndexedDB（合并按 id 去重）。
 *  - 所有页面调用处均以 window.CoffeePhotos 存在性守卫，本模块加载失败不影响记录功能。 */
(function (root) {
  'use strict';

  var DB_NAME = 'coffeelab-photos';
  var STORE = 'photos';
  var DB_VERSION = 1;
  var MAX_EDGE = 1280;          /* 压缩后长边上限（px） */
  var JPEG_QUALITY = 0.78;

  var dbPromise = null;
  var urlCache = {};            /* photoId -> objectURL，会话内复用不重复创建 */

  function genId() {
    return 'ph-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var st = db.createObjectStore(STORE, { keyPath: 'id' });
          st.createIndex('brewId', 'brewId', { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  /* 以事务模式执行 fn(store)，事务完成后 resolve fn 返回的 IDBRequest 结果 */
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
    return Promise.all((ids || []).map(function (id) { return get(id); }))
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
      /* 同一事务内先查再删：oncomplete 时 keys 已填充 */
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

  /* ---------- 压缩：canvas 统一为 JPEG、长边 ≤ MAX_EDGE ---------- */

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
      var timer = setTimeout(fallback, 1500);            /* 回调不来就走兜底 */
      canvas.toBlob(function (blob) {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (blob) resolve(blob); else fallback();
      }, 'image/jpeg', JPEG_QUALITY);
    });
  }

  /* 超大源图（如 4800 万像素手机直出）在部分移动端画布上会失败：先逐级减半到安全面积再缩放 */
  var MAX_CANVAS_PIXELS = 16777216;

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

  /* 取照片显示用 URL（命中缓存立即返回；照片不存在/库不可用 → null） */
  function urlFor(id) {
    if (urlCache[id]) return Promise.resolve(urlCache[id]);
    return get(id).then(function (rec) {
      if (!rec || !rec.blob) return null;
      urlCache[id] = URL.createObjectURL(rec.blob);
      return urlCache[id];
    }).catch(function () { return null; });
  }

  /* 新增一张：压缩后写入，返回记录（含 id），brewId 在保存记录时已知 */
  function add(brewId, file) {
    return compress(file).then(function (blob) { return save(brewId, blob); });
  }

  /* 写入已压缩的 Blob（表单里选图时仅 compress 暂存，提交时才 save） */
  function save(brewId, blob) {
    var rec = { id: genId(), brewId: brewId || null, createdAt: new Date().toISOString(), blob: blob };
    return put(rec).then(function () { return rec; });
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
    compress: compress,
    add: add,
    save: save,
    get: get,
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
