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

  /* 小红书沙箱：WebView 下载与文件选择可能被禁，导出/导入改走复制粘贴面板。
   * 容器同时禁用剪贴板类 API 与系统长按菜单——面板只展示可选中文本，引导手动复制。 */
  function transferOverlay(text, onImport) {
    var importing = !!onImport;
    var mask = document.createElement('div');
    mask.className = 'transfer-mask';
    mask.innerHTML = '<div class="transfer-box">'
      + '<div class="transfer-title">' + (importing ? '📋 复制 / 粘贴数据' : '📋 备份数据') + '</div>'
      + '<textarea class="transfer-area input" spellcheck="false"' + (importing ? '' : ' readonly') + ' placeholder="' + (importing ? '把备份 JSON 粘贴到这里' : '') + '"></textarea>'
      + '<div class="hint" style="margin:8px 0 10px">' + (importing
          ? '粘贴备份 JSON 后点「导入以上内容」；也可复制现有内容留作备份。'
          : (window.CoffeeXHS
              ? '数据已自动同步到工具专属存储（平台清理后会自动恢复）。文件下载与一键复制被平台禁用，可手动全选下方文本复制转移（不含照片，仅文字数据）。'
              : '长按文本全选复制，粘贴到微信 / 备忘录等处妥善保管这份备份。')) + '</div>'
      + '<div class="btn-row">'
      + (importing ? '<button type="button" class="btn btn-primary" id="tx-import">导入以上内容</button>' : '')
      + '<button type="button" class="btn" id="tx-close">关闭</button>'
      + '</div></div>';
    document.body.appendChild(mask);
    var area = mask.querySelector('.transfer-area');
    area.value = text || '';
    var impBtn = mask.querySelector('#tx-import');
    if (impBtn) impBtn.addEventListener('click', function () {
      var v = area.value;
      mask.remove();
      var data;
      try { data = JSON.parse(v); } catch (e) { status('#data-status', '导入失败：不是有效的 JSON 文件', true); return; }
      onImport(data);
    });
    mask.querySelector('#tx-close').addEventListener('click', function () { mask.remove(); });
    mask.addEventListener('click', function (e) { if (e.target === mask) mask.remove(); });
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
    /* 小红书沙箱：下载与分享面板均不可用，改弹复制粘贴面板 */
    if (window.CoffeeXHS) { transferOverlay(text, null); return; }
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
    var inApp = !!(window.Capacitor || window.CoffeeXHS);   /* 原生壳/小红书沙箱：安装 PWA 区块无意义 */
    var dataHint = window.Capacitor ? '数据保存在本机 App 内。定期导出 JSON 备份，换设备或重装 App 时导入即可迁移。'
      : window.CoffeeXHS ? '数据已自动同步到工具专属存储（平台清理后会自动恢复）。沙箱内导出/导入为纯文本（不含照片），文件操作被平台禁用，跨设备迁移请用网页版或 App。'
      : '数据仅保存在本机浏览器。定期导出 JSON 备份，换设备时导入即可迁移。';
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
      + '<p class="hint" style="margin-bottom:10px">' + dataHint + '</p>'
      + '<div class="btn-row">'
      + '<button class="btn btn-primary" id="exp-json">导出 JSON 备份</button>'
      + '<button class="btn" id="exp-csv">导出 CSV 表格</button>'
      /* 小红书沙箱的选择器只允许图片/视频，JSON 文件导入必然失败，只留粘贴导入 */
      + (window.CoffeeXHS
          ? '<button class="btn" id="imp-paste">📋 粘贴导入</button>'
          : '<label class="btn" style="cursor:pointer">导入 JSON<input type="file" id="imp-file" accept=".json,application/json" hidden></label>')
      + '</div>'
      + '<div class="status-line" id="data-status"></div></div>'

      + '<div class="settings-section"><h3>📖 萃取指导</h3>'
      + '<p class="hint" style="margin-bottom:10px">意式 / 手冲 / 冷萃常见问题的调整方向，当帮助页使用。</p>'
      + '<div class="btn-row"><a class="btn btn-primary" href="#/guide">打开萃取指导</a></div></div>'

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

      + '<div class="footer-note">CoffeeLab v1.1.2 · 数据版本 v' + C.DATA_VERSION + ' · 记录 ' + s.brews.length + ' 杯 · 豆子 ' + s.beans.length + ' 款</div>';

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
      /* 小红书沙箱：导出走复制粘贴，base64 照片会让文本大到无法传输——不含照片 */
      if (window.CoffeeXHS) {
        download('coffeelab-backup-' + stamp() + '.json', JSON.stringify(Object.assign({}, store.get()), null, 2), 'application/json');
        status('#data-status', '✓ 已导出 JSON 备份（不含照片）');
        return;
      }
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

    /* 导入：读取后立即处理（原生 confirm 选合并/覆盖），全程不依赖任何
     * 跨渲染的中间状态。此前"先暂存再点按钮"的两步流程，在 App 里会被选文件时
     * 的页面重载打断（回来页面已重建），表现为"导入了没反应"。 */
    function handleImportData(data) {
      var res = C.validateData(data);
      if (!res.ok) { status('#data-status', '导入失败：数据格式或版本不正确', true); return; }
      /* 小红书沙箱：粘贴导入不写照片库——导出本就不含照片，外部备份的照片
       * base64 体积大且沙箱 IndexedDB 不保证可用；记录中的照片引用保留，
       * 照片不存在时由「照片丢失」占位兜底 */
      var photos = (!window.CoffeeXHS && Array.isArray(data.photos)) ? data.photos : [];
      var desc = '豆子 ' + res.data.beans.length + ' 款、记录 ' + res.data.brews.length + ' 条' + (photos.length ? '、照片 ' + photos.length + ' 张' : '');
      if (confirm('读取到备份：' + desc + '。\n\n「确定」= 合并导入（保留现有，按 id 去重）\n「取消」= 改为覆盖导入（先自动备份再清空现有数据）')) {
        var m = store.importMerge(res.data);
        if (!m) { status('#data-status', '导入失败：数据格式或版本不正确', true); return; }
        importPhotos('✓ 合并完成：新增豆子 ' + m.addedCount.beans + ' 款、记录 ' + m.addedCount.brews + ' 条；跳过已有 ' + (m.skippedCount.beans + m.skippedCount.brews) + ' 条', photos, false);
      } else if (confirm('覆盖导入会先自动备份当前数据，然后清空并替换为备份内容。确定覆盖吗？')) {
        backupThenReplace(res.data, photos);
      } else {
        status('#data-status', '已取消导入');
      }
    }
    var impFile = q('#imp-file');   /* 小红书沙箱内无文件导入（选择器仅允许图片），只有粘贴导入 */
    if (impFile) impFile.addEventListener('change', function (e) {
      var file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var data;
        try { data = JSON.parse(reader.result); }
        catch (err) { status('#data-status', '导入失败：不是有效的 JSON 文件', true); return; }
        handleImportData(data);
      };
      reader.readAsText(file);
    });
    var pasteBtn = q('#imp-paste');
    if (pasteBtn) pasteBtn.addEventListener('click', function () {
      transferOverlay('', handleImportData);
    });
    /* 照片写回 IndexedDB 后补充提示（记录本体已导入，不受照片失败影响） */
    function importPhotos(prefix, photos, replace) {
      if (window.CoffeePhotos && photos.length) {
        CoffeePhotos.importRecords(photos, { replace: replace })
          .then(function (r) {
            status('#data-status', prefix + '；照片新增 ' + r.added + ' 张' + (r.skipped ? '、跳过已有 ' + r.skipped + ' 张' : ''));
          })
          .catch(function () { status('#data-status', prefix + '；照片导入失败（记录已导入）', true); });
      } else status('#data-status', prefix);
    }
    /* 覆盖前自动备份当前数据（含照片；小红书沙箱内备份不含照片），备份发出后再执行覆盖 */
    function backupThenReplace(data, photos) {
      var run = function (current) {
        var payload = Object.assign({}, store.get());
        if (current && current.length) payload.photos = current;
        download('coffeelab-backup-before-replace-' + stamp() + '.json', JSON.stringify(payload, null, 2), 'application/json');
        var ok = store.importReplace(data);
        if (ok) importPhotos('✓ 已覆盖导入（原数据已自动备份）', photos, true);
        else status('#data-status', '导入失败：数据格式或版本不正确', true);
      };
      if (window.CoffeeXHS) run(null);
      else if (window.CoffeePhotos) CoffeePhotos.exportFor(store.get().brews).then(run).catch(function () { run(null); });
      else run(null);
    }

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
