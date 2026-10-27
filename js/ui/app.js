/* app.js — 引导：store、hash 路由、页面分发、警示条、SW 注册、安装事件 */
(function () {
  'use strict';
  var store = CoffeeStore.createStore();
  store.load();

  var pendingInstall = null;

  window.CoffeeApp = {
    store: store,
    go: function (h) { location.hash = h; },
    installEvent: null
  };

  function parseHash() {
    var h = (location.hash || '#/brews').replace(/^#/, '');
    var qi = h.indexOf('?');
    var path = h, query = {};
    if (qi >= 0) {
      path = h.slice(0, qi);
      h.slice(qi + 1).split('&').forEach(function (kv) {
        if (!kv) return;
        var p = kv.split('=');
        query[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
      });
    }
    return { parts: path.split('/').filter(Boolean), query: query };
  }

  var NOT_FOUND = { render: function (root) { root.innerHTML = '<div class="empty">页面不存在</div>'; } };

  function render() {
    var r = parseHash();
    var page = r.parts[0] || 'brews';
    var mod = (window.Pages && (window.Pages[page] || (page === 'brew' ? window.Pages.brews : null))) || NOT_FOUND;
    var navKey = page === 'brew' ? 'brews' : page;
    document.querySelectorAll('[data-nav]').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-nav') === navKey);
    });
    var main = document.getElementById('view');
    main.innerHTML = '';
    /* 每次渲染提供全新容器，页面级事件监听随容器一起丢弃，避免重复叠加 */
    var container = document.createElement('div');
    main.appendChild(container);
    try { mod.render(container, r); } catch (e) { console.error(e); main.innerHTML = '<div class="empty">渲染出错：' + CoffeeCore.esc(String(e.message || e)) + '</div>'; }
    var bar = document.getElementById('storage-warning');
    bar.hidden = !(store.saveError || store.loadError);
    bar.textContent = store.saveError
      ? '⚠️ 本地存储写入失败，数据仅保留在内存中，请立即到「设置」导出 JSON 备份'
      : (store.loadError || '');
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    pendingInstall = e;
    window.CoffeeApp.installEvent = e;
    var btn = document.getElementById('install-btn');
    if (btn) btn.hidden = false;
  });
  window.addEventListener('appinstalled', function () {
    window.CoffeeApp.installEvent = null;
    var btn = document.getElementById('install-btn');
    if (btn) btn.hidden = true;
  });

  store.subscribe(render);
  window.addEventListener('hashchange', render);
  document.addEventListener('DOMContentLoaded', function () {
    if (!location.hash) location.hash = '#/brews';
    render();
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') store.saveNow(); });
    window.addEventListener('beforeunload', function () { store.saveNow(); });
    window.addEventListener('pagehide', function () { store.saveNow(); });
    /* Capacitor 原生壳内资源已随 App 内置，注册 SW 反而可能让更新停留在旧缓存，跳过 */
    if (!window.Capacitor && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('./sw.js').catch(function () { /* file:// 或离线首次，忽略 */ });
    }
  });
})();
