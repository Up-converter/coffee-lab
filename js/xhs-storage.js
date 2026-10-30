/* xhs-storage.js — 小红书沙箱数据持久化镜像（其他环境自动空转）
 *
 * 小工具容器文档明确：localStorage / IndexedDB 无法保证始终可用或持久；
 * 官方推荐 setStorage（客户端 9.46+）作为本地缓存，低版本回退浏览器存储。
 *
 * 策略：localStorage 仍是工作副本（同步、不改存储架构）；
 *   1) 每次数据落盘后，异步镜像一份到 xhs.miniTool.setStorage；
 *   2) 启动时若工作副本为空而镜像有数据（平台清理过存储），恢复镜像并刷新一次。
 * 照片（IndexedDB Blob）体积大且单 key 上限 1MB，不做镜像；记录可随时重建照片引用。
 */
(function () {
  'use strict';

  var KEY = 'coffeeLab.data';
  var MIRROR_KEY = 'coffeeLab.data.mirror';
  var RESTORE_FLAG = 'coffeeLab.xhsRestored';

  function miniTool() {
    return (window.CoffeeXHS && window.xhs && window.xhs.miniTool &&
      typeof window.xhs.miniTool.setStorage === 'function') ? window.xhs.miniTool : null;
  }

  function localGet() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function localSet(raw) {
    try { localStorage.setItem(KEY, raw); return true; } catch (e) { return false; }
  }

  /* 落盘后镜像：失败静默（工作副本仍在，备份提示由设置页文案承担） */
  function mirror() {
    var mt = miniTool();
    if (!mt) return;
    var raw = localGet();
    if (raw == null) return;
    try {
      var p = mt.setStorage({ key: MIRROR_KEY, data: raw });
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) { /* 沙箱异常：忽略 */ }
  }

  /* 平台清理过 localStorage 时从镜像恢复（一次性刷新，sessionStorage 防循环） */
  function restoreIfNeeded() {
    var mt = miniTool();
    if (!mt || typeof mt.getStorage !== 'function') return;
    var local = localGet();
    if (local != null && local.length > 2) return;   /* 工作副本健在 */
    var guarded = false;
    try { guarded = sessionStorage.getItem(RESTORE_FLAG) === '1'; } catch (e) {}
    if (guarded) return;
    try {
      var p = mt.getStorage({ key: MIRROR_KEY });
      Promise.resolve(p).then(function (r) {
        var data = r && r.data;
        if (!data || data.length < 2) return;
        if (!localSet(data)) return;
        try { sessionStorage.setItem(RESTORE_FLAG, '1'); } catch (e2) {}
        location.reload();
      }).catch(function () {});
    } catch (e) { /* 沙箱异常：忽略 */ }
  }

  function boot() {
    if (!window.CoffeeXHS) return;   /* 非沙箱环境不做任何事 */
    restoreIfNeeded();
    var store = window.CoffeeApp && window.CoffeeApp.store;
    if (store && typeof store.flush === 'function') {
      var origFlush = store.flush;
      /* store.js 内部均为 api.flush() 晚绑定调用，替换原型属性即可覆盖全部落盘路径 */
      store.flush = function () {
        var r = origFlush.apply(this, arguments);
        mirror();
        return r;
      };
    }
    mirror();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
