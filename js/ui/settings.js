/* settings.js — 器具默认值 / 数据导出导入 / 清空 / 安装 */
(function () {
  'use strict';
  var C = CoffeeCore;

  /* 持久状态提示：store 变更会同步触发 notify() → app.js 重建 #view，
   * 写进页面内的状态行会随旧容器一起脱离文档；因此同步写入 #view 之外的
   * #app-toast（index.html 常驻节点），6s 后自动隐藏，重复调用重置计时。 */
  var toastTimer = null;
  function toast(msg, isErr) {
    var el = document.getElementById('app-toast');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('err', !!isErr);
    el.hidden = !msg;
    if (toastTimer != null) clearTimeout(toastTimer);
    toastTimer = null;
    if (msg) toastTimer = setTimeout(function () { el.hidden = true; toastTimer = null; }, 6000);
  }

  function download(filename, text, mime) {
    function browserDownload() {
      var blob = new Blob([text], { type: mime || 'application/octet-stream' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    /* Capacitor 原生壳：WebView 不支持 <a download>，写缓存后交系统分享面板保存/发送；插件不可用或失败则退回浏览器路径 */
    var Cap = window.Capacitor;
    if (Cap && Cap.Plugins && Cap.Plugins.Filesystem && Cap.Plugins.Share) {
      Cap.Plugins.Filesystem.writeFile({ path: filename, data: text, directory: 'CACHE', encoding: 'utf8' })
        .then(function (r) { return Cap.Plugins.Share.share({ title: filename, url: r.uri, dialogTitle: '保存或分享' }); })
        .catch(browserDownload);
      return;
    }
    browserDownload();
  }
  function stamp() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  function render(root) {
    var store = CoffeeApp.store, s = store.get();
    var G = s.gear;
    var inApp = !!window.Capacitor;   /* Android 原生壳内：安装 PWA 区块无意义，文案也不提浏览器 */
    function gField(label, key, ph) {
      return '<div class="field"><span class="label">' + label + '</span>'
        + '<input id="g-' + key + '" class="input" value="' + C.esc(G[key] || '') + '" placeholder="' + ph + '"></div>';
    }

    root.innerHTML = '<div class="page-head"><h2>设置</h2></div>'

      + '<div class="settings-section"><h3>⚙️ 我的器具</h3>'
      + '<p class="hint" style="margin-bottom:10px">固定设备在这里设置一次即可，保存记录时会自动带上，不用每次填写。</p>'
      + '<div class="field-row">'
      + gField('咖啡机', 'machine', '如 ECM Synchronika')
      + gField('意式磨豆机', 'espressoGrinder', '如 Niche Zero')
      + gField('手冲磨豆机', 'pourOverGrinder', '如 Comandante C40')
      + gField('手冲壶', 'kettle', '如 Fellow Stagg')
      + gField('粉碗规格', 'basket', '如 58mm 18g')
      + gField('常用滤纸', 'filterPaper', '如 Hario 02 漂白')
      + '</div>'
      + '<div class="btn-row" style="margin-top:12px"><button class="btn btn-primary" id="gear-save">保存器具</button></div>'
      + '<div class="status-line" id="gear-status"></div></div>'

      + '<div class="settings-section"><h3>💾 数据</h3>'
      + '<p class="hint" style="margin-bottom:10px">' + (inApp
          ? '数据保存在本机 App 内。定期导出 JSON 备份，换设备或重装 App 时导入即可迁移。'
          : '数据仅保存在本机浏览器。定期导出 JSON 备份，换设备时导入即可迁移。') + '</p>'
      + '<div class="btn-row">'
      + '<button class="btn btn-primary" id="exp-json">导出 JSON 备份</button>'
      + '<button class="btn" id="exp-csv">导出 CSV 表格</button>'
      + '<label class="btn" style="cursor:pointer">导入 JSON<input type="file" id="imp-file" accept=".json,application/json" hidden></label>'
      + '</div>'
      + '<div class="confirm-row" id="imp-actions" hidden>'
      + '<span class="hint">导入方式：</span>'
      + '<button class="btn" id="imp-merge">合并（保留现有，按 id 去重）</button>'
      + '<button class="btn btn-danger" id="imp-replace">覆盖（会先自动备份当前数据）</button>'
      + '</div>'
      + '<div class="status-line" id="data-status"></div></div>'

      + '<div class="settings-section"><h3>🧹 危险区</h3>'
      + '<p class="hint" style="margin-bottom:10px">清空全部记录与豆子库。建议先导出 JSON 备份。</p>'
      + '<div class="confirm-row">'
      + '<input id="wipe-input" class="input" placeholder="输入「删除」解锁">'
      + '<button class="btn btn-danger" id="wipe-btn" disabled>清空全部数据</button>'
      + '</div></div>'

      + (inApp ? '' : '<div class="settings-section"><h3>📱 安装到主屏幕</h3>'
      + '<p class="hint" style="margin-bottom:10px">通过 https 访问时（如 GitHub Pages），可将本应用安装到手机主屏幕，像原生 App 一样全屏离线使用。</p>'
      + '<button class="btn btn-primary" id="install-btn" hidden>安装应用</button>'
      + '<div class="status-line" id="install-status"></div></div>')

      + '<div class="footer-note">CoffeeLab v1.0 · 数据版本 v' + C.DATA_VERSION + ' · 记录 ' + s.brews.length + ' 杯 · 豆子 ' + s.beans.length + ' 款</div>';

    var q = function (id) { return root.querySelector(id); };
    var status = function (id, msg, isErr) {
      var el = q(id);
      if (el) { el.textContent = msg || ''; el.classList.toggle('err', !!isErr); }
      toast(msg, isErr); /* 视图被 notify() 重建后，消息仍显示在持久 toast 上 */
    };

    q('#gear-save').addEventListener('click', function () {
      store.setGear({
        machine: q('#g-machine').value.trim(),
        espressoGrinder: q('#g-espressoGrinder').value.trim(),
        pourOverGrinder: q('#g-pourOverGrinder').value.trim(),
        kettle: q('#g-kettle').value.trim(),
        basket: q('#g-basket').value.trim(),
        filterPaper: q('#g-filterPaper').value.trim()
      });
      status('#gear-status', '✓ 器具已保存，之后新建的记录会自动带上');
    });

    q('#exp-json').addEventListener('click', function () {
      var done = function (photos) {
        var payload = Object.assign({}, store.get());
        if (photos && photos.length) payload.photos = photos;
        download('coffeelab-backup-' + stamp() + '.json', JSON.stringify(payload, null, 2), 'application/json');
        status('#data-status', '✓ 已导出 JSON 备份' + (photos && photos.length ? '（含照片 ' + photos.length + ' 张）' : ''));
      };
      if (window.CoffeePhotos) {
        CoffeePhotos.exportFor(store.get().brews).then(done).catch(function () { done(null); });
      } else done(null);
    });
    q('#exp-csv').addEventListener('click', function () {
      download('coffeelab-records-' + stamp() + '.csv', '\uFEFF' + C.brewsToCsv(store.get().brews), 'text/csv');
      status('#data-status', '✓ 已导出 CSV（' + store.get().brews.length + ' 条）');
    });

    var pendingImport = null;
    var pendingImportPhotos = [];   /* 备份里的照片（base64），主数据导入后写回 IndexedDB */
    q('#imp-file').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          pendingImport = JSON.parse(reader.result);
          pendingImportPhotos = Array.isArray(pendingImport.photos) ? pendingImport.photos : [];
          delete pendingImport.photos;   /* 照片不入 localStorage 主数据 */
          q('#imp-actions').hidden = false;
          status('#data-status', '已读取文件，请选择导入方式' + (pendingImportPhotos.length ? '（含照片 ' + pendingImportPhotos.length + ' 张）' : ''));
        } catch (err) {
          pendingImport = null;
          pendingImportPhotos = [];
          q('#imp-actions').hidden = true;
          status('#data-status', '导入失败：不是有效的 JSON 文件', true);
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    });
    /* 照片写回 IndexedDB 后补充提示 */
    function importPhotosStatus(prefix, replace) {
      if (window.CoffeePhotos && pendingImportPhotos.length) {
        CoffeePhotos.importRecords(pendingImportPhotos, { replace: replace })
          .then(function (r) {
            status('#data-status', prefix + '；照片新增 ' + r.added + ' 张' + (r.skipped ? '、跳过已有 ' + r.skipped + ' 张' : ''));
          })
          .catch(function () { status('#data-status', prefix + '；照片导入失败（记录已导入）', true); });
      } else status('#data-status', prefix);
      pendingImportPhotos = [];
    }
    q('#imp-merge').addEventListener('click', function () {
      if (!pendingImport) return;
      var m = store.importMerge(pendingImport);
      if (!m) { status('#data-status', '导入失败：数据格式或版本不正确', true); }
      else importPhotosStatus('✓ 合并完成：新增豆子 ' + m.addedCount.beans + ' 款、记录 ' + m.addedCount.brews + ' 条；跳过已有 ' + (m.skippedCount.beans + m.skippedCount.brews) + ' 条', false);
      pendingImport = null;
      q('#imp-actions').hidden = true;
    });
    q('#imp-replace').addEventListener('click', function () {
      if (!pendingImport) return;
      var run = function (photos) {
        /* 覆盖前自动备份（含照片） */
        var payload = Object.assign({}, store.get());
        if (photos && photos.length) payload.photos = photos;
        download('coffeelab-backup-before-replace-' + stamp() + '.json', JSON.stringify(payload, null, 2), 'application/json');
        var ok = store.importReplace(pendingImport);
        if (ok) importPhotosStatus('✓ 已覆盖导入（原数据已自动备份下载）', true);
        else status('#data-status', '导入失败：数据格式或版本不正确', true);
        pendingImport = null;
        q('#imp-actions').hidden = true;
      };
      if (window.CoffeePhotos) CoffeePhotos.exportFor(store.get().brews).then(run).catch(function () { run(null); });
      else run(null);
    });

    q('#wipe-input').addEventListener('input', function (e) {
      q('#wipe-btn').disabled = e.target.value !== '删除';
    });
    q('#wipe-btn').addEventListener('click', function () {
      if (!confirm('确认清空全部记录与豆子库？此操作不可撤销。')) return;
      store.clearAll();
      if (window.CoffeePhotos) CoffeePhotos.deleteAll().catch(function () { /* 照片清理失败不影响主流程 */ });
      status('#data-status', '已清空全部数据');
    });

    var installBtn = q('#install-btn');
    if (!installBtn) return;   /* 原生壳内该区块不存在 */
    if (window.CoffeeApp.installEvent) installBtn.hidden = false;
    installBtn.addEventListener('click', function () {
      var ev = window.CoffeeApp.installEvent;
      if (!ev) { status('#install-status', '当前环境不支持安装（需 https 访问）', true); return; }
      ev.prompt();
      ev.userChoice.then(function (r) {
        if (r.outcome === 'accepted') status('#install-status', '✓ 已安装到主屏幕');
        window.CoffeeApp.installEvent = null;
        installBtn.hidden = true;
      });
    });
  }

  window.Pages = window.Pages || {};
  Pages.settings = { render: render };
})();
