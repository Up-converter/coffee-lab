/* brews.js — 冲煮记录：列表 / 表单 / 详情 */
(function () {
  'use strict';
  var C = CoffeeCore;
  var listState = { tab: 'all', q: '' };
  var BADGE_CLASS = { espresso: 'badge-esp', pourOver: 'badge-pour', coldBrew: 'badge-cold' };
  var METHOD_TOGGLE = { espresso: '☕ 意式浓缩', pourOver: '🫖 手冲', coldBrew: '🧊 冷萃' };
  /* 切换冲煮方式时暂存已填内容，避免整表重渲染丢失输入 */
  var draft = null;

  function normalizeMethod(m, fallback) {
    if (C.METHODS.indexOf(m) >= 0) return m;
    if (C.METHODS.indexOf(fallback) >= 0) return fallback;
    return 'espresso';
  }

  function methodBadge(m) {
    return '<span class="badge ' + (BADGE_CLASS[m] || 'badge-plain') + '">'
      + (C.METHOD_LABEL[m] || C.esc(m) || '记录') + '</span>';
  }

  /* 枚举选项：datalist 在部分手机浏览器"下拉可见但点选无效"，统一改原生 select；
   * 历史数据里的自定义值若不在标准列表中，追加为选项保持可显示 */
  function enumOptions(values, current) {
    var list = values.slice();
    if (current && list.indexOf(current) < 0) list.push(current);
    return '<option value=""></option>' + list.map(function (v) {
      return '<option value="' + C.esc(v) + '"' + (v === current ? ' selected' : '') + '>' + C.esc(v) + '</option>';
    }).join('');
  }

  /* 复用 index.html 常驻 #app-toast 的轻提示（与 settings.js 同款，6s 自动隐藏） */
  var appToastTimer = null;
  function appToast(msg, isErr) {
    var el = document.getElementById('app-toast');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('err', !!isErr);
    el.hidden = !msg;
    if (appToastTimer != null) clearTimeout(appToastTimer);
    appToastTimer = null;
    if (msg) appToastTimer = setTimeout(function () { el.hidden = true; appToastTimer = null; }, 6000);
  }

  /* 全屏看图（详情页照片点开）：点空白处/✕ 关闭，多张可左右切换 */
  function openLightbox(urls, idx) {
    var cur = idx || 0;
    var ov = document.createElement('div');
    ov.className = 'lightbox';
    function paint() {
      ov.innerHTML = '<img src="' + urls[cur] + '" alt="照片 ' + (cur + 1) + '">'
        + (urls.length > 1
          ? '<button type="button" class="lb-nav lb-prev" data-lb-go="-1">‹</button>'
          + '<button type="button" class="lb-nav lb-next" data-lb-go="1">›</button>'
          + '<div class="lb-count">' + (cur + 1) + ' / ' + urls.length + '</div>' : '')
        + '<button type="button" class="lb-close" title="关闭">✕</button>';
    }
    paint();
    ov.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-lb-go]');
      if (nav) { cur = (cur + Number(nav.getAttribute('data-lb-go')) + urls.length) % urls.length; paint(); return; }
      if (e.target === ov || e.target.closest('.lb-close')) ov.remove();
    });
    document.body.appendChild(ov);
  }

  function starsHtml(n) {
    n = n || 0;
    var s = '';
    for (var i = 1; i <= 5; i++) s += i <= n ? '★' : '<span class="off">☆</span>';
    return s;
  }

  function ageOf(w) {
    return w.beanSnapshot && w.beanSnapshot.roastDate
      ? C.calcBeanAgeDays(w.date, w.beanSnapshot.roastDate) : null;
  }

  function cardHtml(w) {
    var ratio = C.formatRatio(w.dose, w.water);
    var time = C.formatTimeFor(w.method, w.time) || '-';
    var age = ageOf(w);
    var params = [(w.dose != null ? w.dose : '-') + 'g → ' + (w.water != null ? w.water : '-') + 'g', time, ratio || '-'];
    return '<article class="card brew-card">'
      + (w.photos && w.photos.length ? '<div class="card-photo" data-photo="' + C.esc(w.photos[0]) + '" hidden></div>' : '')
      + '<div class="card-top">'
      + methodBadge(w.method)
      + (w.beanSnapshot && w.beanSnapshot.roastLevel ? '<span class="badge badge-plain">' + C.esc(w.beanSnapshot.roastLevel) + '</span>' : '')
      + '<span class="fav' + (w.favorite ? ' active' : '') + '" data-fav="' + C.esc(w.id) + '">' + (w.favorite ? '★' : '☆') + '</span>'
      + '</div>'
      + '<h3 class="card-title">' + C.esc(w.beanSnapshot ? w.beanSnapshot.name : '未命名') + '</h3>'
      + '<div class="card-meta">' + C.esc((w.date || '').slice(0, 10)) + (age != null ? ' · 烘焙后 ' + age + ' 天' : '') + '</div>'
      + '<div class="bignum-row">' + params.map(function (p) { return '<div class="bignum">' + C.esc(p) + '</div>'; }).join('') + '</div>'
      + '<div class="card-bottom"><span class="stars">' + starsHtml(w.sensory && w.sensory.stars) + '</span>'
      + '<a class="btn btn-ghost" href="#/brew/' + C.esc(w.id) + '">详情</a></div>'
      + '</article>';
  }

  function filteredBrews(s) {
    var list = s.brews.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    if (C.METHODS.indexOf(listState.tab) >= 0) {
      list = list.filter(function (w) { return w.method === listState.tab; });
    } else if (listState.tab === 'fav') {
      list = list.filter(function (w) { return w.favorite; });
    }
    if (listState.q) {
      var q = listState.q.toLowerCase();
      list = list.filter(function (w) {
        var hay = [(w.beanSnapshot && w.beanSnapshot.name) || '', (w.sensory && w.sensory.notes) || '',
          (w.sensory && w.sensory.tags || []).join(' ')].join(' ').toLowerCase();
        return hay.indexOf(q) >= 0;
      });
    }
    return list;
  }

  var TABS = [{ k: 'all', t: '全部' }].concat(
    C.METHODS.map(function (m) { return { k: m, t: C.METHOD_LABEL[m] }; })
  ).concat([{ k: 'fav', t: '⭐收藏' }]);

  /* 页面内部重渲染时也换新容器，事件监听不叠加 */
  function mount(rootEl) { rootEl.innerHTML = ''; var d = document.createElement('div'); rootEl.appendChild(d); return d; }

  /* 列表卡片首图横幅：异步取 URL 后填充；照片仍在后台写入时短暂重试 */
  function fillCardPhotos(root) {
    if (!window.CoffeePhotos) return;
    root.querySelectorAll('.card-photo[data-photo]').forEach(function (el) {
      var attempt = function (tries) {
        CoffeePhotos.urlFor(el.getAttribute('data-photo')).then(function (url) {
          if (!el.isConnected) return;
          if (!url) {
            if (tries > 0) setTimeout(function () { attempt(tries - 1); }, 1300);
            else el.remove();
            return;
          }
          el.innerHTML = '<img src="' + url + '" alt="">';
          el.hidden = false;
        });
      };
      attempt(2);
    });
  }

  function renderList(rootEl) {
    var root = mount(rootEl);
    var store = CoffeeApp.store;
    var list = filteredBrews(store.get());
    root.innerHTML = '<div class="page-head"><h2>冲煮记录 ' + list.length + ' 杯</h2>'
      + '<div class="filters">' + TABS.map(function (t) {
        return '<button class="chip' + (listState.tab === t.k ? ' on' : '') + '" data-tab="' + t.k + '">' + t.t + '</button>';
      }).join('') + '</div>'
      + '<input id="search" class="search" type="search" placeholder="搜豆名 / 笔记 / 标签" value="' + C.esc(listState.q) + '">'
      + '</div>'
      + (list.length
        ? '<div class="card-grid">' + list.map(cardHtml).join('') + '</div>'
        : '<div class="empty">还没有记录，点右下角 ＋ 记第一杯 ☕</div>')
      + '<a class="fab" href="#/brew/new" title="新建记录">＋</a>';
    fillCardPhotos(root);

    root.querySelector('#search').addEventListener('input', function (e) {
      listState.q = e.target.value;
      var fresh = filteredBrews(store.get());
      var h2 = root.querySelector('.page-head h2');
      if (h2) h2.textContent = '冲煮记录 ' + fresh.length + ' 杯';
      var grid = root.querySelector('.card-grid');
      if (grid) {
        if (fresh.length) grid.innerHTML = fresh.map(cardHtml).join('');
        else grid.outerHTML = '<div class="empty">没有匹配的记录</div>'; /* 零匹配：整格替换为空态，避免空白 */
      } else {
        var empty = root.querySelector('.empty');
        if (empty) empty.outerHTML = fresh.length
          ? '<div class="card-grid">' + fresh.map(cardHtml).join('') + '</div>'
          : '<div class="empty">' + (store.get().brews.length === 0 ? '还没有记录，点右下角 ＋ 记第一杯 ☕' : '没有匹配的记录') + '</div>';
      }
      fillCardPhotos(root);
    });
    root.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-tab]');
      if (tab) { listState.tab = tab.getAttribute('data-tab'); renderList(rootEl); return; }
      var fav = e.target.closest('[data-fav]');
      if (fav) { store.toggleFavorite(fav.getAttribute('data-fav')); }
    });
  }

  /* ---------- 详情页 ---------- */

  function dlRow(k, v) { return v ? '<div><dt>' + k + '</dt><dd>' + C.esc(v) + '</dd></div>' : ''; }

  function renderDetail(root, id) {
    var store = CoffeeApp.store;
    var w = store.get().brews.filter(function (x) { return x.id === id; })[0];
    if (!w) { root.innerHTML = '<div class="empty">记录不存在，<a href="#/brews">返回列表</a></div>'; return; }
    var s = w.beanSnapshot || {};
    var age = s.roastDate ? C.calcBeanAgeDays(w.date, s.roastDate) : null;
    var E = (w.advanced && w.advanced.espresso) || {}, P = (w.advanced && w.advanced.pourOver) || {},
        CB = (w.advanced && w.advanced.coldBrew) || {};
    var G = w.gearSnapshot || {};
    var ey = C.eyFor(w);
    var isPour = w.method === 'pourOver';
    var isEsp = w.method === 'espresso';

    var cells = [
      { k: '粉量', v: w.dose != null ? w.dose + 'g' : '' },
      { k: isEsp ? '液重' : '注水总量', v: w.water != null ? w.water + 'g' : '' },
      { k: '比例', v: C.formatRatio(w.dose, w.water) },
      { k: '做法', v: w.drink || E.drinkType || '' },
      { k: '时间', v: C.formatTimeFor(w.method, w.time) },
      { k: '水温', v: w.temp != null ? w.temp + '℃' : '' },
      { k: '研磨刻度', v: w.grind || '' }
    ];
    if (isPour) cells.push({ k: '滤杯', v: w.dripper || '' });
    if (CB.container) cells.push({ k: '容器', v: CB.container });
    if (ey != null) cells.push({ k: '萃取率 EY', v: ey + '%' });

    var gearBits = [];
    if (G.machine) gearBits.push('咖啡机 ' + G.machine);
    if (G.grinder) gearBits.push('磨豆机 ' + G.grinder);
    if (G.basket) gearBits.push('粉碗 ' + G.basket);
    if (G.kettle) gearBits.push('手冲壶 ' + G.kettle);
    if (G.filterPaper) gearBits.push('滤纸 ' + G.filterPaper);

    var advRows = '';
    if (isEsp) {
      advRows = dlRow('峰值压力', E.pressure != null ? E.pressure + ' bar' : '')
        + dlRow('预浸', (E.preinfusionTime != null ? E.preinfusionTime + 's' : '') + (E.preinfusionType ? ' · ' + E.preinfusionType : ''))
        + dlRow('首滴时间', E.firstDrip != null ? E.firstDrip + 's' : '')
        + dlRow('布粉压粉', E.puckPrep || '')
        + dlRow('萃取观察', E.observation || '');
    } else if (isPour) {
      advRows = dlRow('闷蒸', (P.bloomWater != null ? P.bloomWater + 'g' : '') + (P.bloomTime != null ? ' · ' + P.bloomTime + 's' : ''))
        + dlRow('分段注水', C.formatPours(P.pours))
        + dlRow('出品液重', P.beverageWeight != null ? P.beverageWeight + 'g' : '')
        + dlRow('手法', P.technique || '')
        + dlRow('滴滤完成', P.drainTime != null ? P.drainTime + 's' : '');
    } else {
      advRows = dlRow('容器 / 方式', CB.container || '')
        + dlRow('出品液重', CB.beverageWeight != null ? CB.beverageWeight + 'g' : '');
    }
    advRows += dlRow('水质', w.advanced && w.advanced.water)
      + dlRow('环境', w.advanced && w.advanced.env)
      + dlRow('TDS', w.advanced && w.advanced.tds != null ? w.advanced.tds + '%' : '');

    var sliders = C.SENSORY_SLIDERS.concat(isEsp ? [C.ESPRESSO_EXTRA_SLIDER] : []);
    var barsHtml = sliders.map(function (sl) {
      var v = (w.sensory.sliders || {})[sl.key];
      var pct = v != null && v > 0 ? (v / 10) * 100 : 0;
      return '<div class="fbar-row"><span class="fbar-label">' + sl.label + '</span>'
        + '<div class="fbar-track"><div class="fbar-fill c-' + sl.color + '" style="width:' + pct + '%"></div></div>'
        + '<span class="fbar-val">' + (v != null && v > 0 ? v : '-') + '</span></div>';
    }).join('');

    var tags = (w.sensory.tags || []).map(function (t) { return '<span class="badge badge-plain">' + C.esc(t) + '</span>'; }).join(' ');

    root.innerHTML =
      '<div class="detail-hero">'
      + '<div class="badges">' + methodBadge(w.method)
      + (s.roastLevel ? '<span class="badge badge-plain">' + C.esc(s.roastLevel) + '</span>' : '')
      + (w.favorite ? '<span class="badge badge-plain">⭐ 收藏</span>' : '') + '</div>'
      + '<h2>' + C.esc(s.name || '未命名') + '</h2>'
      + '<div class="meta">' + C.esc((w.date || '').replace('T', ' ')) + (age != null ? ' · 烘焙后 ' + age + ' 天' : '') + '</div>'
      + '<div class="gear-line">' + C.esc(gearBits.join(' · ')) + '</div>'
      + '</div>'
      + '<div class="actions">'
      + '<a class="btn btn-primary" href="#/brew/' + C.esc(w.id) + '/edit">编辑</a>'
      + '<a class="btn" href="#/brew/new?from=' + C.esc(w.id) + '">复制为新实验</a>'
      + '<button class="btn" id="d-fav">' + (w.favorite ? '★ 取消收藏' : '☆ 收藏') + '</button>'
      + '<button class="btn btn-danger" id="d-del">删除</button>'
      + '</div>'
      + '<div class="param-grid">' + cells.map(function (c) {
        return '<div class="param-cell"><div class="k">' + c.k + '</div><div class="v">' + C.esc(c.v || '–') + '</div></div>';
      }).join('') + '</div>'
      + ((w.photos && w.photos.length) ? '<div class="photo-strip" id="photo-strip"></div>' : '')
      + (advRows ? '<div class="group-title">进阶参数</div><dl class="dl-fields">' + advRows + '</dl>' : '')
      + '<div class="group-title">风味 <span class="stars">' + starsHtml(w.sensory.stars) + '</span></div>'
      + '<div class="note-box">' + barsHtml + (tags ? '<div style="margin-top:10px">' + tags + '</div>' : '') + '</div>'
      + (w.sensory.notes ? '<div class="group-title">品鉴笔记</div><div class="note-box">' + C.esc(w.sensory.notes) + '</div>' : '')
      + (w.sensory.nextStep ? '<div class="group-title">下次调整计划</div><div class="next-step">→ ' + C.esc(w.sensory.nextStep) + '</div>' : '')
      + '<div class="footer-note">记录于 ' + C.esc((w.createdAt || '').slice(0, 10)) + '</div>';

    root.querySelector('#d-fav').addEventListener('click', function () { store.toggleFavorite(w.id); });
    root.querySelector('#d-del').addEventListener('click', function () {
      if (confirm('确定删除这条记录？')) {
        store.deleteBrew(w.id);
        if (window.CoffeePhotos) CoffeePhotos.deleteByBrew(w.id);   /* 同步清理照片 */
        CoffeeApp.go('#/brews');
      }
    });

    /* 照片墙：异步取 Blob URL，点开全屏查看。
     * 保存后照片可能仍在后台写入 IndexedDB：短暂重试几次再判定为没有照片。 */
    var strip = root.querySelector('#photo-strip');
    if (strip && window.CoffeePhotos) {
      var fillStrip = function (tries) {
        if (!strip.isConnected) return;
        Promise.all((w.photos || []).map(function (id) { return CoffeePhotos.urlFor(id); })).then(function (urls) {
          urls = urls.filter(Boolean);
          if (!strip.isConnected) return;
          if (!urls.length) {
            if (tries > 0) setTimeout(function () { fillStrip(tries - 1); }, 1300);
            else strip.remove();
            return;
          }
          strip.innerHTML = urls.map(function (u, i) {
            return '<button type="button" class="strip-thumb" data-lb="' + i + '"><img src="' + u + '" alt="照片 ' + (i + 1) + '"></button>';
          }).join('');
          strip.addEventListener('click', function (e) {
            var t = e.target.closest('[data-lb]');
            if (t) openLightbox(urls, Number(t.getAttribute('data-lb')));
          });
        });
      };
      fillStrip(3);
    }
  }

  /* ---------- 表单（新建 / 编辑 / 复制为新实验） ---------- */

  function nowLocal() {
    var d = new Date(); d.setSeconds(0, 0);
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function renderForm(root, opts) {
    var store = CoffeeApp.store, s = store.get();
    var editBrew = opts.editId ? s.brews.filter(function (w) { return w.id === opts.editId; })[0] : null;
    var base = null, method;
    if (editBrew) { base = editBrew; method = editBrew.method; }
    else {
      /* 未指定方式时沿用上次使用的冲煮方式，减少误记成意式 */
      method = normalizeMethod(opts.method, s.settings.lastMethod);
      if (opts.fromId) {
        base = s.brews.filter(function (w) { return w.id === opts.fromId; })[0] || null;
        if (base) method = base.method;
      } else {
        base = s.brews.filter(function (w) { return w.method === method; })
          .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); })[0] || null;
      }
    }
    var E = (base && base.advanced && base.advanced.espresso) || null;
    var P = (base && base.advanced && base.advanced.pourOver) || null;
    var CB = (base && base.advanced && base.advanced.coldBrew) || null;
    var AD = (base && base.advanced) || {};
    function val(key) { return base && base[key] != null ? base[key] : ''; }
    function eval_(k) { return E && E[k] != null ? E[k] : ''; }
    function pval(k) { return P && P[k] != null ? P[k] : ''; }
    function cval(k) { return CB && CB[k] != null ? CB[k] : ''; }
    /* 做法/喝法：新字段 drink；老记录的 advanced.espresso.drinkType 自动带入 */
    function dval() { return (base && base.drink) || (E && E.drinkType) || ''; }
    var isEsp = method === 'espresso', isPour = method === 'pourOver', isCold = method === 'coldBrew';
    /* 时间：内部统一存秒，冷萃表单按小时显示/输入 */
    function timeVal() {
      var t = val('time');
      if (t === '') return '';
      return isCold ? (Math.round(t / 360) / 10) : t;
    }
    /* 照片：{id}=已存 IndexedDB；{blob,url}=选图待存（提交时才写入）。
     * 编辑时移除的已有照片先记在 removedPhotoIds，提交成功才真正删除。 */
    var photos = editBrew ? (editBrew.photos || []).map(function (id) { return { id: id }; }) : [];
    var removedPhotoIds = [];
    var wantBeanId = editBrew ? editBrew.beanId : (base ? base.beanId : null);
    /* 豆子已被删除时回退为"直接输入"模式，快照信息仍可用于预填 */
    if (wantBeanId && !s.beans.some(function (b) { return b.id === wantBeanId; })) wantBeanId = null;
    var manualBean = !wantBeanId;

    var beanOptions = s.beans.slice()
      .sort(function (a, b) { return (a.finished ? 1 : 0) - (b.finished ? 1 : 0); })
      .map(function (b) {
        return '<option value="' + C.esc(b.id) + '"' + (wantBeanId === b.id ? ' selected' : '') + '>'
          + C.esc(b.name + (b.finished ? '（已喝完）' : '')) + '</option>';
      }).join('');

    var manual = manualBean ? (base ? base.beanSnapshot : null) : (editBrew ? editBrew.beanSnapshot : null);
    var datalistBeans = s.beans.map(function (b) { return '<option value="' + C.esc(b.name) + '">'; }).join('');
    var datalistDrippers = unique(s.brews.map(function (w) { return w.dripper; })).map(function (d) { return '<option value="' + C.esc(d) + '">'; }).join('');

    var sliders = C.SENSORY_SLIDERS.concat(isEsp ? [C.ESPRESSO_EXTRA_SLIDER] : []);
    var sliderHtml = sliders.map(function (sl) {
      var v0 = (editBrew && editBrew.sensory.sliders[sl.key] != null) ? editBrew.sensory.sliders[sl.key] : '';
      return '<div class="slider-row"><span class="slider-label">' + sl.label + '</span>'
        + '<input type="range" min="0" max="10" step="0.5" class="c-' + sl.color + '" id="s-' + sl.key + '" value="' + v0 + '">'
        + '<span class="slider-val">' + (v0 === '' ? '-' : v0) + '</span></div>';
    }).join('');

    var tagSel = {};
    if (editBrew) editBrew.sensory.tags.forEach(function (t) { tagSel[t] = true; });
    var allTags = C.FLAVOR_TAGS.concat(editBrew ? editBrew.sensory.tags.filter(function (t) { return C.FLAVOR_TAGS.indexOf(t) < 0; }) : []);
    var tagHtml = allTags.map(function (t) {
      return '<button type="button" class="tag-chip' + (tagSel[t] ? ' on' : '') + '" data-tag="' + C.esc(t) + '">' + C.esc(t) + '</button>';
    }).join('');

    function starBtns() {
      var n = editBrew ? (editBrew.sensory.stars || 0) : 0, h = '';
      for (var i = 1; i <= 5; i++) h += '<button type="button" class="star-btn' + (i <= n ? ' on' : '') + '" data-star="' + i + '">★</button>';
      return h + '<input type="hidden" id="f-stars" value="' + n + '">';
    }

    function pourRow(p) {
      return '<div class="pour-row">'
        + '<input class="input pour-g" inputmode="decimal" placeholder="注至 45g" value="' + (p ? p.target : '') + '">'
        + '<span class="hint">@</span>'
        + '<input class="input pour-t" placeholder="0:30" value="' + (p ? C.esc(p.at || '') : '') + '">'
        + '<button type="button" class="pour-del" title="删除此段">✕</button></div>';
    }
    var pours = (P && P.pours && P.pours.length) ? P.pours : [null];

    var advCommon =
      '<div class="field"><span class="label">水质</span><input id="a-water" class="input" placeholder="如 农夫山泉 / GH68·KH40" value="' + C.esc(AD.water || '') + '"></div>'
      + '<div class="field"><span class="label">环境温湿度</span><input id="a-env" class="input" placeholder="26℃ 60%" value="' + C.esc(AD.env || '') + '"></div>'
      + '<div class="field"><span class="label">TDS %（有折光仪才填）</span><input id="a-tds" class="input" type="number" step="0.01" min="0" value="' + (AD.tds != null ? AD.tds : '') + '"><span class="hint">自动计算萃取率 EY%</span></div>';

    var advEsp =
      '<div class="field"><span class="label">峰值压力 (bar)</span><input id="a-pressure" class="input" type="number" step="0.1" value="' + eval_('pressure') + '"></div>'
      + '<div class="field"><span class="label">预浸时间 (秒)</span><input id="a-preinfusion-time" class="input" type="number" value="' + eval_('preinfusionTime') + '"></div>'
      + '<div class="field"><span class="label">预浸方式</span><input id="a-preinfusion-type" class="input" value="' + C.esc(eval_('preinfusionType') || '') + '" placeholder="渐进 / 低压"></div>'
      + '<div class="field"><span class="label">首滴时间 (秒)</span><input id="a-first-drip" class="input" type="number" value="' + eval_('firstDrip') + '"></div>'
      + '<div class="field wide"><span class="label">布粉压粉手法</span><input id="a-puck-prep" class="input" value="' + C.esc(eval_('puckPrep') || '') + '" placeholder="如 WDT + 布粉器 + 恒力压粉锤"></div>'
      + '<div class="field wide"><span class="label">萃取观察</span><textarea id="a-observation" class="input" placeholder="虎斑油脂 / 通道效应 / 喷溅 / 粉饼状态…">' + C.esc(eval_('observation') || '') + '</textarea></div>';

    var advPour =
      '<div class="field"><span class="label">闷蒸水量 (g)</span><input id="a-bloom-water" class="input" type="number" value="' + pval('bloomWater') + '"></div>'
      + '<div class="field"><span class="label">闷蒸时间 (秒)</span><input id="a-bloom-time" class="input" type="number" value="' + pval('bloomTime') + '"></div>'
      + '<div class="field"><span class="label">出品液重 (g)</span><input id="a-beverage" class="input" type="number" value="' + pval('beverageWeight') + '"></div>'
      + '<div class="field"><span class="label">滴滤完成 (秒)</span><input id="a-drain" class="input" type="number" value="' + pval('drainTime') + '"></div>'
      + '<div class="field wide"><span class="label">绕圈/搅拌手法</span><input id="a-technique" class="input" value="' + C.esc(pval('technique') || '') + '" placeholder="中心向外绕圈，距滤纸 1cm"></div>'
      + '<div class="field wide"><span class="label">分段注水计划</span><div class="pour-rows" id="pour-rows">' + pours.map(pourRow).join('') + '</div>'
      + '<button type="button" class="btn btn-ghost" id="pour-add" style="margin-top:8px">＋ 添加一段</button></div>';

    var advCold =
      '<div class="field"><span class="label">容器 / 方式</span><input id="a-container" class="input" value="' + C.esc(cval('container') || '') + '" placeholder="如 冷泡壶 / 冰滴塔 / Mason 罐"></div>'
      + '<div class="field"><span class="label">出品液重 (g)</span><input id="a-cold-beverage" class="input" type="number" value="' + cval('beverageWeight') + '"></div>';

    root.innerHTML = '<form class="form-card" id="brew-form" novalidate>'
      + '<div class="page-head"><h2>' + (editBrew ? '编辑记录' : '记一杯') + '</h2></div>'
      + (editBrew ? '' : '<div class="method-toggle">'
        + C.METHODS.map(function (m) {
          return '<button type="button" class="chip' + (method === m ? ' on' : '') + '" data-method="' + m + '">' + METHOD_TOGGLE[m] + '</button>';
        }).join('') + '</div>')
      + '<div class="err-box" id="form-errors"></div>'

      + '<div class="form-section"><h4>① 咖啡豆</h4>'
      + '<div class="field-row">'
      + '<div class="field wide"><span class="label">豆子库</span><select id="f-bean" class="input"><option value="">➕ 直接输入豆名…</option>' + beanOptions + '</select></div>'
      + '</div>'
      + '<div class="field-row" id="bean-manual"' + (manualBean ? '' : ' hidden') + '>'
      + '<div class="field"><span class="label">豆名 <span class="req">*</span></span><input id="f-bean-name" class="input" list="bean-names" value="' + C.esc(manual ? manual.name : '') + '"></div>'
      + '<div class="field"><span class="label">烘焙度</span><select id="f-roast" class="input">' + enumOptions(C.ROAST_LEVELS, manual ? (manual.roastLevel || '') : '') + '</select></div>'
      + '<div class="field"><span class="label">烘焙日期</span><input id="f-roast-date" class="input" type="date" value="' + C.esc(manual ? (manual.roastDate || '') : '') + '"></div>'
      + '<div class="field wide"><label class="hint"><input type="checkbox" id="f-save-bean"> 同时存入豆子库</label></div>'
      + '</div>'
      + '<div class="bean-age" id="bean-age-line"></div>'
      + '<datalist id="bean-names">' + datalistBeans + '</datalist>'
      + '</div>'

      + '<div class="form-section"><h4>② 核心参数</h4>'
      + '<div class="field-row">'
      + '<div class="field"><span class="label">日期时间</span><input id="f-date" class="input" type="datetime-local" value="' + C.esc(editBrew ? editBrew.date : nowLocal()) + '"></div>'
      + '<div class="field"><span class="label">粉量 (g)</span><input id="f-dose" class="input" type="number" inputmode="decimal" step="0.1" value="' + val('dose') + '"></div>'
      + '<div class="field"><span class="label">' + (isEsp ? '液重 (g)' : '注水总量 (g)') + '</span><input id="f-water" class="input" type="number" inputmode="decimal" step="0.1" value="' + val('water') + '"></div>'
      + '<div class="field"><span class="label">' + (isCold ? '萃取时间 (小时)' : '萃取时间 (秒)') + '</span><input id="f-time" class="input" type="number" inputmode="decimal" step="' + (isCold ? '0.5' : '0.1') + '" value="' + timeVal() + '"' + (isCold ? ' placeholder="如 12"' : '') + '></div>'
      + '<div class="field"><span class="label">水温 (℃)</span><input id="f-temp" class="input" type="number" inputmode="decimal" step="0.1" value="' + val('temp') + '"></div>'
      + '<div class="field"><span class="label">做法 / 喝法</span><select id="f-drink" class="input">' + enumOptions(C.DRINK_OPTIONS[method] || [], dval()) + '</select></div>'
      + '<div class="field"><span class="label">研磨刻度</span><input id="f-grind" class="input" value="' + C.esc(val('grind') || '') + '" placeholder="如 Niche 12 / C40 24格"></div>'
      + (isPour ? '<div class="field"><span class="label">滤杯</span><input id="f-dripper" class="input" list="drippers" value="' + C.esc(val('dripper') || '') + '" placeholder="V60-02 / Kalita 155"></div>' : '')
      + '<div class="field"><span class="label">比例（自动）</span><div class="ratio-live" id="ratio-out">–</div></div>'
      + '</div>'
      + '<datalist id="drippers">' + datalistDrippers + '</datalist>'
      + '</div>'

      + '<details class="adv form-section"><summary>③ 更多参数（选填）</summary>'
      + '<div class="field-row">' + (isPour ? advPour : (isCold ? advCold : advEsp)) + advCommon + '</div>'
      + '</details>'

      + '<div class="form-section"><h4>④ 照片（选填，最多 3 张）</h4>'
      + '<div class="photo-tiles" id="photo-tiles"></div>'
      + '<input type="file" id="photo-file" accept="image/*" multiple hidden>'
      + '<div class="hint" id="photo-hint" style="margin-top:6px;min-height:14px"></div>'
      + '</div>'

      + '<div class="form-section"><h4>⑤ 风味与计划</h4>'
      + sliderHtml
      + '<div class="field-row" style="margin-top:12px">'
      + '<div class="field"><span class="label">总体星级</span><div id="star-input">' + starBtns() + '</div></div>'
      + '<div class="field wide"><span class="label">风味标签</span><div class="tag-chips" id="tag-chips">' + tagHtml + '</div></div>'
      + '<div class="field wide"><span class="label">品鉴笔记</span><textarea id="f-notes" class="input">' + C.esc(editBrew ? editBrew.sensory.notes : '') + '</textarea></div>'
      + '<div class="field wide"><span class="label">下次调整计划</span><input id="f-next" class="input" value="' + C.esc(editBrew ? editBrew.sensory.nextStep : '') + '" placeholder="如：研磨调粗 1 格 / 粉量减 0.5g"></div>'
      + '<div class="field wide"><label class="hint"><input type="checkbox" id="f-favorite"' + (editBrew && editBrew.favorite ? ' checked' : '') + '> ⭐ 收藏这杯</label></div>'
      + '</div></div>'

      + '<div class="btn-row">'
      + '<button type="submit" class="btn btn-primary">保存记录</button>'
      + '<a class="btn" href="' + (editBrew ? '#/brew/' + C.esc(editBrew.id) : '#/brews') + '">取消</a>'
      + (editBrew ? '<button type="button" class="btn btn-danger" id="btn-del">删除记录</button>' : '')
      + '</div></form>';

    function q(sel) { return root.querySelector(sel); }
    if (!opts.switched) draft = null;   /* 非切换进入的渲染 = 全新表单会话，旧草稿作废 */
    if (draft && draft.photos) photos = draft.photos;   /* 切换方式时照片随草稿带过去 */

    /* 照片缩略图（含"添加"占位块）；已存照片的图异步回填 */
    function renderPhotoTiles() {
      var box = q('#photo-tiles');
      if (!box) return;
      function tileHtml(i, url) {
        return '<div class="photo-tile' + (url ? '' : ' loading') + '" data-pidx="' + i + '">'
          + (url ? '<img src="' + url + '" alt="">' : '')
          + '<button type="button" class="photo-del" data-pdel="' + i + '" title="移除此照片">✕</button></div>';
      }
      var html = '';
      photos.forEach(function (p, i) { html += tileHtml(i, p.url || null); });
      if (photos.length < maxPhotos()) html += '<button type="button" class="photo-add" id="photo-add">📷<span>拍照 / 选图</span></button>';
      box.innerHTML = html;
      if (window.CoffeePhotos) {
        photos.forEach(function (p, i) {
          if (!p.url && p.id) {
            CoffeePhotos.urlFor(p.id).then(function (url) {
              if (!url || !box.isConnected) return;
              var tile = box.querySelector('[data-pidx="' + i + '"]');
              if (tile) tile.outerHTML = tileHtml(i, url);
            });
          }
        });
      }
    }
    function maxPhotos() { return (window.CoffeePhotos && CoffeePhotos.MAX_PHOTOS) || 3; }

    /* 切换冲煮方式时：暂存当前已填内容 → 重渲染 → 按新方式恢复。
     * values 与上一份草稿合并，来回切换也不丢已填字段；提交或离开表单时整体作废。 */
    function harvestDraft() {
      var values = {};
      root.querySelectorAll('input[id], select[id], textarea[id]').forEach(function (el) {
        values[el.id] = (el.type === 'checkbox') ? el.checked : el.value;
      });
      var det = root.querySelector('details.adv'), bm = root.querySelector('#bean-manual');
      draft = {
        fromMethod: method,
        values: Object.assign({}, draft && draft.values, values),
        photos: photos,
        tags: Array.prototype.map.call(root.querySelectorAll('#tag-chips .tag-chip.on'), function (t) { return t.getAttribute('data-tag'); }),
        stars: Number((root.querySelector('#f-stars') || {}).value) || 0,
        openAdv: det ? det.open : null,
        beanManualHidden: bm ? bm.hidden : null
      };
    }
    function applyDraft() {
      var d = draft;
      if (!d) return;
      Object.keys(d.values).forEach(function (id) {
        var el = root.querySelector('#' + id);
        if (!el) return;
        var v = d.values[id];
        if (id === 'f-time' && v !== '') {
          /* 秒 ⇄ 小时：按原方式与新方式的单位换算 */
          var sec = d.fromMethod === 'coldBrew' ? Number(v) * 3600 : Number(v);
          el.value = isCold ? (Math.round(sec / 360) / 10) : Math.round(sec);
        } else if (el.type === 'checkbox') el.checked = !!v;
        else el.value = v;
        if (el.type === 'range') {
          var out = el.parentElement.querySelector('.slider-val');
          if (out) out.textContent = el.value === '' ? '-' : el.value;
        }
      });
      if (d.beanManualHidden != null) { var bm = root.querySelector('#bean-manual'); if (bm) bm.hidden = d.beanManualHidden; }
      if (d.openAdv != null) { var det = root.querySelector('details.adv'); if (det) det.open = d.openAdv; }
      (d.tags || []).forEach(function (t) {
        var chip = root.querySelector('.tag-chip[data-tag="' + String(t).replace(/["\\]/g, '\\$&') + '"]');
        if (chip) chip.classList.add('on');
      });
      if (d.stars > 0) {
        var hid = root.querySelector('#f-stars');
        if (hid) {
          hid.value = d.stars;
          root.querySelectorAll('#star-input .star-btn').forEach(function (b) {
            b.classList.toggle('on', Number(b.getAttribute('data-star')) <= d.stars);
          });
        }
      }
    }
    applyDraft();
    renderPhotoTiles();

    function updateAge() {
      var beanId = q('#f-bean').value;
      var bean = beanId ? s.beans.filter(function (b) { return b.id === beanId; })[0] : null;
      var roastDate = bean ? bean.roastDate : (q('#bean-manual').hidden ? null : q('#f-roast-date').value);
      var age = roastDate ? C.calcBeanAgeDays(q('#f-date').value, roastDate) : null;
      q('#bean-age-line').textContent = age != null ? '🌿 养豆 ' + age + ' 天（按 ' + q('#f-date').value.slice(0, 10) + ' 计算）' : '';
    }
    function updateRatio() {
      var r = C.formatRatio(q('#f-dose').value, q('#f-water').value);
      q('#ratio-out').textContent = r || '–';
    }
    updateAge(); updateRatio();

    root.addEventListener('change', function (e) {
      if (e.target.id === 'f-bean') {
        var manualBlock = q('#bean-manual');
        manualBlock.hidden = !!e.target.value;
        updateAge();
      }
      if (e.target.id === 'f-roast-date' || e.target.id === 'f-date') updateAge();
      if (e.target.id === 'photo-file' && e.target.files && e.target.files.length) {
        var files = Array.prototype.slice.call(e.target.files);
        e.target.value = '';                                  /* 允许再次选同一文件 */
        var hint = q('#photo-hint');
        if (!window.CoffeePhotos) { if (hint) hint.textContent = '照片功能不可用（浏览器不支持）'; return; }
        var room = maxPhotos() - photos.length, skipped = 0, taken = 0;
        files.forEach(function (f) {
          if (taken >= room) { skipped++; return; }
          var looksImage = (f.type && f.type.indexOf('image/') === 0) || /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(f.name || '');
          if (!looksImage) { skipped++; return; }
          photos.push(CoffeePhotos.stage(f));   /* 同步登记：原图 URL 立即显示，压缩留到保存时 */
          taken++;
        });
        if (hint) hint.textContent = skipped ? '已忽略 ' + skipped + ' 个文件（超出上限或非图片）' : '';
        renderPhotoTiles();
      }
    });
    root.addEventListener('input', function (e) {
      if (e.target.id === 'f-dose' || e.target.id === 'f-water') updateRatio();
      if (e.target.type === 'range') {
        var out = e.target.parentElement.querySelector('.slider-val');
        if (out) out.textContent = e.target.value === '' ? '-' : e.target.value;
      }
    });
    root.addEventListener('click', function (e) {
      if (e.target.closest('#photo-add')) { var pf = q('#photo-file'); if (pf) pf.click(); return; }
      var pdel = e.target.closest('[data-pdel]');
      if (pdel) {
        var pidx = Number(pdel.getAttribute('data-pdel'));
        var removed = photos.splice(pidx, 1)[0];
        if (removed && removed.id) removedPhotoIds.push(removed.id);   /* 提交时才真正删除 */
        renderPhotoTiles();
        return;
      }
      var mchip = e.target.closest('[data-method]');
      if (mchip && !editBrew) {
        var m = mchip.getAttribute('data-method');
        if (m !== method && C.METHODS.indexOf(m) >= 0) {
          harvestDraft();
          /* 换新容器再重渲染，事件监听不叠加（与 renderList 的 mount 约定一致） */
          var fresh = document.createElement('div');
          root.replaceWith(fresh);
          renderForm(fresh, { fromId: opts.fromId, method: m, switched: true });
        }
        return;
      }
      var star = e.target.closest('[data-star]');
      if (star) {
        var n = Number(star.getAttribute('data-star'));
        q('#f-stars').value = n;
        root.querySelectorAll('#star-input .star-btn').forEach(function (b) {
          b.classList.toggle('on', Number(b.getAttribute('data-star')) <= n);
        });
        return;
      }
      var tag = e.target.closest('.tag-chip');
      if (tag) { tag.classList.toggle('on'); return; }
      if (e.target.closest('#pour-add')) {
        q('#pour-rows').insertAdjacentHTML('beforeend', pourRow(null));
        return;
      }
      var del = e.target.closest('.pour-del');
      if (del) {
        var rows = root.querySelectorAll('.pour-row');
        if (rows.length > 1) del.closest('.pour-row').remove();
        else { del.closest('.pour-row').querySelectorAll('input').forEach(function (i) { i.value = ''; }); }
        return;
      }
      if (e.target.closest('#btn-del') && editBrew) {
        if (confirm('确定删除这条记录？')) {
          store.deleteBrew(editBrew.id);
          if (window.CoffeePhotos) CoffeePhotos.deleteByBrew(editBrew.id);   /* 同步清理照片 */
          CoffeeApp.go('#/brews');
        }
      }
    });

    q('#brew-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var slidersRaw = {};
      sliders.forEach(function (sl) { var el = q('#s-' + sl.key); slidersRaw[sl.key] = el ? el.value : ''; });
      var g = function (id) { var el = q(id); return el ? el.value : ''; };
      /* 冷萃表单按小时输入，保存前换算为秒 */
      var timeRaw = g('#f-time');
      if (isCold && timeRaw !== '') timeRaw = String(Math.round(Number(timeRaw) * 3600));
      var raw = {
        method: method,
        date: g('#f-date'),
        beanId: (g('#f-bean') || '').trim(),
        beanName: q('#bean-manual').hidden ? '' : g('#f-bean-name'),
        roastLevel: q('#bean-manual').hidden ? '' : g('#f-roast'),
        roastDate: q('#bean-manual').hidden ? '' : g('#f-roast-date'),
        saveBean: !q('#bean-manual').hidden && q('#f-save-bean').checked,
        dose: g('#f-dose'), water: g('#f-water'), time: timeRaw, temp: g('#f-temp'),
        grind: g('#f-grind'), dripper: g('#f-dripper'),
        advanced: {
          espresso: { pressure: g('#a-pressure'), preinfusionTime: g('#a-preinfusion-time'), preinfusionType: g('#a-preinfusion-type'), firstDrip: g('#a-first-drip'), puckPrep: g('#a-puck-prep'), drinkType: g('#a-drink-type'), observation: g('#a-observation') },
          pourOver: { bloomWater: g('#a-bloom-water'), bloomTime: g('#a-bloom-time'), beverageWeight: g('#a-beverage'), technique: g('#a-technique'), drainTime: g('#a-drain'),
            pours: Array.prototype.map.call(root.querySelectorAll('.pour-row'), function (r) {
              return { target: r.querySelector('.pour-g').value, at: r.querySelector('.pour-t').value };
            }) },
          coldBrew: { container: g('#a-container'), beverageWeight: g('#a-cold-beverage') }
        },
        waterQuality: g('#a-water'), env: g('#a-env'), tds: g('#a-tds'),
        sliders: slidersRaw,
        stars: Number(g('#f-stars')) || 0,
        tags: Array.prototype.map.call(root.querySelectorAll('#tag-chips .tag-chip.on'), function (t) { return t.getAttribute('data-tag'); }),
        notes: g('#f-notes'), nextStep: g('#f-next'),
        favorite: q('#f-favorite').checked,
        drink: g('#f-drink'),
        photos: photos.map(function (p) { return p.id; }),   /* id 在选图时已生成，保存记录不再依赖照片库 */
        id: editBrew ? editBrew.id : undefined,
        createdAt: editBrew ? editBrew.createdAt : undefined
      };
      var res = C.parseBrewForm(raw, { beans: store.get().beans, gear: store.get().gear, now: new Date().toISOString() });
      if (!res.ok) {
        q('#form-errors').innerHTML = Object.keys(res.errors).map(function (k) { return '<div>• ' + C.esc(res.errors[k]) + '</div>'; }).join('');
        q('#form-errors').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      /* 记录同步先存、先跳转——照片库慢/挂起/失败都不影响记录本身（夸克等内核曾因此丢记录） */
      if (res.newBean) store.addBean(res.newBean);
      if (editBrew) store.updateBrew(editBrew.id, res.brew);
      else store.addBrew(res.brew);
      draft = null;                                /* 已提交，切换草稿作废 */
      store.setSettings({ lastMethod: method });   /* 下次记一杯默认沿用本次方式 */
      CoffeeApp.go('#/brew/' + res.brew.id);
      /* 照片后台落库：逐张压缩（失败用原图）、单张失败不影响其余，仅提示 */
      if (window.CoffeePhotos) {
        CoffeePhotos.persist(res.brew.id, photos, removedPhotoIds).then(function (r) {
          if (r && r.failed > 0) appToast('⚠️ 有 ' + r.failed + ' 张照片未能保存，记录本身已保存', true);
        });
      } else if (photos.some(function (p) { return p.blob; })) {
        appToast('⚠️ 此浏览器不支持照片保存，记录已保存（不含照片）', true);
      }
    });
  }

  function unique(arr) {
    var seen = {}, out = [];
    (arr || []).forEach(function (v) { if (v && !seen[v]) { seen[v] = true; out.push(v); } });
    return out;
  }

  window.Pages = window.Pages || {};
  Pages.brews = {
    render: function (root, route) {
      if (route.parts[0] === 'brew') {
        /* Task 6 阶段 Pages.brew 尚未注册时的兜底；Task 8 注册 Pages.brew 后不会走到这里 */
        root.innerHTML = '<div class="empty">记录页建设中</div>';
        return;
      }
      renderList(root);
    }
  };

  Pages.brew = {
    render: function (root, route) {
      if (route.parts[1] === 'new') {
        renderForm(root, { method: route.query.method, fromId: route.query.from });
      } else if (route.parts[2] === 'edit') {
        renderForm(root, { editId: route.parts[1] });
      } else {
        renderDetail(root, route.parts[1]);
      }
    }
  };
})();
