/* CoffeeStore — 状态树（UMD）。存储后端可注入：浏览器 localStorage，Node/测试用 memoryStorage */
(function (root, factory) {
  var Core = (typeof module !== 'undefined' && module.exports)
    ? require('./core.js')
    : root.CoffeeCore;
  var lib = factory(Core);
  if (typeof module !== 'undefined' && module.exports) { module.exports = lib; }
  else { root.CoffeeStore = lib; }
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';

  var KEY = 'coffeeLab.data';

  function memoryStorage() {
    var m = {};
    return {
      getItem: function (k) { return k in m ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; }
    };
  }

  function defaultStorage() {
    try {
      var t = '__cl_probe__';
      localStorage.setItem(t, '1'); localStorage.removeItem(t);
      return localStorage;
    } catch (e) { return memoryStorage(); }
  }

  function createStore(storage, opts) {
    storage = storage || defaultStorage();
    opts = opts || {};
    var debounceMs = opts.debounceMs != null ? opts.debounceMs : 300;
    var state = Core.emptyState();
    var listeners = [];
    var timer = null;

    var api = {
      saveError: false,
      loadError: null,

      get: function () { return state; },

      subscribe: function (fn) {
        listeners.push(fn);
        return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
      },
      notify: function () {
        listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
      },

      saveNow: function () {
        try { storage.setItem(KEY, JSON.stringify(state)); api.saveError = false; }
        catch (e) { api.saveError = true; }
        api.notify();
      },
      scheduleSave: function () {
        if (timer != null) clearTimeout(timer);
        timer = setTimeout(function () { timer = null; api.saveNow(); }, debounceMs);
      },

      load: function () {
        var raw = null;
        try { raw = storage.getItem(KEY); }
        catch (e) { api.loadError = '无法读取本地存储'; state = Core.emptyState(); return { ok: false, error: api.loadError }; }
        if (raw == null) { state = Core.emptyState(); return { ok: true }; }
        var parsed;
        try { parsed = JSON.parse(raw); }
        catch (e) {
          api.loadError = '本地数据已损坏，已重置为空（建议尽快导入 JSON 备份）';
          state = Core.emptyState(); return { ok: false, error: api.loadError };
        }
        var res = Core.migrate(parsed);
        if (!res.ok) {
          api.loadError = '本地数据版本不兼容，已重置为空';
          state = Core.emptyState(); return { ok: false, error: api.loadError };
        }
        state = res.data; api.loadError = null;
        return { ok: true };
      },

      addBean: function (b) { state.beans.push(b); api.scheduleSave(); api.notify(); },
      updateBean: function (id, patch) {
        var b = state.beans.find(function (x) { return x.id === id; });
        if (b) Object.assign(b, patch);
        api.scheduleSave(); api.notify();
      },
      deleteBean: function (id) {
        state.beans = state.beans.filter(function (x) { return x.id !== id; });
        api.scheduleSave(); api.notify();
      },

      addBrew: function (w) { state.brews.push(w); api.scheduleSave(); api.notify(); },
      updateBrew: function (id, patch) {
        var w = state.brews.find(function (x) { return x.id === id; });
        if (w) Object.assign(w, patch);
        api.scheduleSave(); api.notify();
      },
      deleteBrew: function (id) {
        state.brews = state.brews.filter(function (x) { return x.id !== id; });
        api.scheduleSave(); api.notify();
      },
      toggleFavorite: function (id) {
        var w = state.brews.find(function (x) { return x.id === id; });
        if (w) { w.favorite = !w.favorite; api.scheduleSave(); api.notify(); }
      },

      setGear: function (patch) { Object.assign(state.gear, patch); api.scheduleSave(); api.notify(); },
      setSettings: function (patch) { Object.assign(state.settings, patch); api.scheduleSave(); api.notify(); },

      importMerge: function (data) {
        var res = Core.validateData(data);
        if (!res.ok) return null;
        var m = Core.mergeImport(state, res.data);
        state = m.data;
        api.saveNow();
        return { addedCount: m.addedCount, skippedCount: m.skippedCount };
      },
      importReplace: function (data) {
        var res = Core.validateData(data);
        if (!res.ok) return false;
        state = res.data;
        api.saveNow();
        return true;
      },
      clearAll: function () { state = Core.emptyState(); api.saveNow(); }
    };
    return api;
  }

  return { createStore: createStore, memoryStorage: memoryStorage, KEY: KEY };
});
