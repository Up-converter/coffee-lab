/* brews.js — 冲煮记录：列表 / 表单 / 详情 */
(function () {
  'use strict';
  var C = CoffeeCore;
  var listState = { tab: 'all', q: '' };

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
    var time = w.method === 'espresso' ? (w.time != null ? w.time + 's' : '-') : (C.formatDuration(w.time) || '-');
    var age = ageOf(w);
    var params = [(w.dose != null ? w.dose : '-') + 'g → ' + (w.water != null ? w.water : '-') + 'g', time, ratio || '-'];
    return '<article class="card brew-card">'
      + '<div class="card-top">'
      + '<span class="badge ' + (w.method === 'espresso' ? 'badge-esp' : 'badge-pour') + '">' + C.METHOD_LABEL[w.method] + '</span>'
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
    if (listState.tab === 'espresso' || listState.tab === 'pourOver') {
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

  var TABS = [{ k: 'all', t: '全部' }, { k: 'espresso', t: '意式' }, { k: 'pourOver', t: '手冲' }, { k: 'fav', t: '⭐收藏' }];

  /* 页面内部重渲染时也换新容器，事件监听不叠加 */
  function mount(rootEl) { rootEl.innerHTML = ''; var d = document.createElement('div'); rootEl.appendChild(d); return d; }

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
    var E = (w.advanced && w.advanced.espresso) || {}, P = (w.advanced && w.advanced.pourOver) || {};
    var G = w.gearSnapshot || {};
    var ey = C.eyFor(w);
    var isPour = w.method === 'pourOver';

    var cells = [
      { k: '粉量', v: w.dose != null ? w.dose + 'g' : '' },
      { k: isPour ? '注水总量' : '液重', v: w.water != null ? w.water + 'g' : '' },
      { k: '比例', v: C.formatRatio(w.dose, w.water) },
      { k: '时间', v: isPour ? C.formatDuration(w.time) : (w.time != null ? w.time + 's' : '') },
      { k: '水温', v: w.temp != null ? w.temp + '℃' : '' },
      { k: '研磨刻度', v: w.grind || '' }
    ];
    if (isPour) cells.push({ k: '滤杯', v: w.dripper || '' });
    if (ey != null) cells.push({ k: '萃取率 EY', v: ey + '%' });

    var gearBits = [];
    if (G.machine) gearBits.push('咖啡机 ' + G.machine);
    if (G.grinder) gearBits.push('磨豆机 ' + G.grinder);
    if (G.basket) gearBits.push('粉碗 ' + G.basket);
    if (G.kettle) gearBits.push('手冲壶 ' + G.kettle);
    if (G.filterPaper) gearBits.push('滤纸 ' + G.filterPaper);

    var advRows = '';
    if (!isPour) {
      advRows = dlRow('峰值压力', E.pressure != null ? E.pressure + ' bar' : '')
        + dlRow('预浸', (E.preinfusionTime != null ? E.preinfusionTime + 's' : '') + (E.preinfusionType ? ' · ' + E.preinfusionType : ''))
        + dlRow('首滴时间', E.firstDrip != null ? E.firstDrip + 's' : '')
        + dlRow('饮品类型', E.drinkType || '') + dlRow('布粉压粉', E.puckPrep || '')
        + dlRow('萃取观察', E.observation || '');
    } else {
      advRows = dlRow('闷蒸', (P.bloomWater != null ? P.bloomWater + 'g' : '') + (P.bloomTime != null ? ' · ' + P.bloomTime + 's' : ''))
        + dlRow('分段注水', C.formatPours(P.pours))
        + dlRow('出品液重', P.beverageWeight != null ? P.beverageWeight + 'g' : '')
        + dlRow('手法', P.technique || '')
        + dlRow('滴滤完成', P.drainTime != null ? P.drainTime + 's' : '');
    }
    advRows += dlRow('水质', w.advanced && w.advanced.water)
      + dlRow('环境', w.advanced && w.advanced.env)
      + dlRow('TDS', w.advanced && w.advanced.tds != null ? w.advanced.tds + '%' : '');

    var sliders = C.SENSORY_SLIDERS.concat(isPour ? [] : [C.ESPRESSO_EXTRA_SLIDER]);
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
      + '<div class="badges"><span class="badge ' + (isPour ? 'badge-pour' : 'badge-esp') + '">' + C.METHOD_LABEL[w.method] + '</span>'
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
      + (advRows ? '<div class="group-title">进阶参数</div><dl class="dl-fields">' + advRows + '</dl>' : '')
      + '<div class="group-title">风味 <span class="stars">' + starsHtml(w.sensory.stars) + '</span></div>'
      + '<div class="note-box">' + barsHtml + (tags ? '<div style="margin-top:10px">' + tags + '</div>' : '') + '</div>'
      + (w.sensory.notes ? '<div class="group-title">品鉴笔记</div><div class="note-box">' + C.esc(w.sensory.notes) + '</div>' : '')
      + (w.sensory.nextStep ? '<div class="group-title">下次调整计划</div><div class="next-step">→ ' + C.esc(w.sensory.nextStep) + '</div>' : '')
      + '<div class="footer-note">记录于 ' + C.esc((w.createdAt || '').slice(0, 10)) + '</div>';

    root.querySelector('#d-fav').addEventListener('click', function () { store.toggleFavorite(w.id); });
    root.querySelector('#d-del').addEventListener('click', function () {
      if (confirm('确定删除这条记录？')) { store.deleteBrew(w.id); CoffeeApp.go('#/brews'); }
    });
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
      method = opts.method === 'pourOver' ? 'pourOver' : 'espresso';
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
    var AD = (base && base.advanced) || {};
    function val(key) { return base && base[key] != null ? base[key] : ''; }
    function eval_(k) { return E && E[k] != null ? E[k] : ''; }
    function pval(k) { return P && P[k] != null ? P[k] : ''; }
    var isPour = method === 'pourOver';
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
    var datalistRoast = C.ROAST_LEVELS.map(function (r) { return '<option value="' + r + '">'; }).join('');
    var datalistDrippers = unique(s.brews.map(function (w) { return w.dripper; })).map(function (d) { return '<option value="' + C.esc(d) + '">'; }).join('');

    var sliders = C.SENSORY_SLIDERS.concat(isPour ? [] : [C.ESPRESSO_EXTRA_SLIDER]);
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
      + '<div class="field"><span class="label">饮品类型</span><select id="a-drink-type" class="input"><option value=""></option>'
      + C.DRINK_TYPES.map(function (d) { return '<option' + (eval_('drinkType') === d ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select></div>'
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

    root.innerHTML = '<form class="form-card" id="brew-form" novalidate>'
      + '<div class="page-head"><h2>' + (editBrew ? '编辑记录' : '记一杯') + '</h2></div>'
      + (editBrew ? '' : '<div class="method-toggle">'
        + '<a class="chip' + (isPour ? '' : ' on') + '" href="#/brew/new?method=espresso">☕ 意式浓缩</a>'
        + '<a class="chip' + (isPour ? ' on' : '') + '" href="#/brew/new?method=pourOver">🫖 手冲</a></div>')
      + '<div class="err-box" id="form-errors"></div>'

      + '<div class="form-section"><h4>① 咖啡豆</h4>'
      + '<div class="field-row">'
      + '<div class="field wide"><span class="label">豆子库</span><select id="f-bean" class="input"><option value="">➕ 直接输入豆名…</option>' + beanOptions + '</select></div>'
      + '</div>'
      + '<div class="field-row" id="bean-manual"' + (manualBean ? '' : ' hidden') + '>'
      + '<div class="field"><span class="label">豆名 <span class="req">*</span></span><input id="f-bean-name" class="input" list="bean-names" value="' + C.esc(manual ? manual.name : '') + '"></div>'
      + '<div class="field"><span class="label">烘焙度</span><input id="f-roast" class="input" list="roast-levels" value="' + C.esc(manual ? (manual.roastLevel || '') : '') + '"></div>'
      + '<div class="field"><span class="label">烘焙日期</span><input id="f-roast-date" class="input" type="date" value="' + C.esc(manual ? (manual.roastDate || '') : '') + '"></div>'
      + '<div class="field wide"><label class="hint"><input type="checkbox" id="f-save-bean"> 同时存入豆子库</label></div>'
      + '</div>'
      + '<div class="bean-age" id="bean-age-line"></div>'
      + '<datalist id="bean-names">' + datalistBeans + '</datalist>'
      + '<datalist id="roast-levels">' + datalistRoast + '</datalist>'
      + '</div>'

      + '<div class="form-section"><h4>② 核心参数</h4>'
      + '<div class="field-row">'
      + '<div class="field"><span class="label">日期时间</span><input id="f-date" class="input" type="datetime-local" value="' + C.esc(editBrew ? editBrew.date : nowLocal()) + '"></div>'
      + '<div class="field"><span class="label">粉量 (g)</span><input id="f-dose" class="input" type="number" inputmode="decimal" step="0.1" value="' + val('dose') + '"></div>'
      + '<div class="field"><span class="label">' + (isPour ? '注水总量 (g)' : '液重 (g)') + '</span><input id="f-water" class="input" type="number" inputmode="decimal" step="0.1" value="' + val('water') + '"></div>'
      + '<div class="field"><span class="label">萃取时间 (秒)</span><input id="f-time" class="input" type="number" inputmode="decimal" step="0.1" value="' + val('time') + '"></div>'
      + '<div class="field"><span class="label">水温 (℃)</span><input id="f-temp" class="input" type="number" inputmode="decimal" step="0.1" value="' + val('temp') + '"></div>'
      + '<div class="field"><span class="label">研磨刻度</span><input id="f-grind" class="input" value="' + C.esc(val('grind') || '') + '" placeholder="如 Niche 12 / C40 24格"></div>'
      + (isPour ? '<div class="field"><span class="label">滤杯</span><input id="f-dripper" class="input" list="drippers" value="' + C.esc(val('dripper') || '') + '" placeholder="V60-02 / Kalita 155"></div>' : '')
      + '<div class="field"><span class="label">比例（自动）</span><div class="ratio-live" id="ratio-out">–</div></div>'
      + '</div>'
      + '<datalist id="drippers">' + datalistDrippers + '</datalist>'
      + '</div>'

      + '<details class="adv form-section"><summary>③ 更多参数（选填）</summary>'
      + '<div class="field-row">' + (isPour ? advPour : advEsp) + advCommon + '</div>'
      + '</details>'

      + '<div class="form-section"><h4>④ 风味与计划</h4>'
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
    });
    root.addEventListener('input', function (e) {
      if (e.target.id === 'f-dose' || e.target.id === 'f-water') updateRatio();
      if (e.target.type === 'range') {
        var out = e.target.parentElement.querySelector('.slider-val');
        if (out) out.textContent = e.target.value === '' ? '-' : e.target.value;
      }
    });
    root.addEventListener('click', function (e) {
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
          CoffeeApp.go('#/brews');
        }
      }
    });

    q('#brew-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var slidersRaw = {};
      sliders.forEach(function (sl) { var el = q('#s-' + sl.key); slidersRaw[sl.key] = el ? el.value : ''; });
      var g = function (id) { var el = q(id); return el ? el.value : ''; };
      var raw = {
        method: method,
        date: g('#f-date'),
        beanId: (g('#f-bean') || '').trim(),
        beanName: q('#bean-manual').hidden ? '' : g('#f-bean-name'),
        roastLevel: q('#bean-manual').hidden ? '' : g('#f-roast'),
        roastDate: q('#bean-manual').hidden ? '' : g('#f-roast-date'),
        saveBean: !q('#bean-manual').hidden && q('#f-save-bean').checked,
        dose: g('#f-dose'), water: g('#f-water'), time: g('#f-time'), temp: g('#f-temp'),
        grind: g('#f-grind'), dripper: g('#f-dripper'),
        advanced: {
          espresso: { pressure: g('#a-pressure'), preinfusionTime: g('#a-preinfusion-time'), preinfusionType: g('#a-preinfusion-type'), firstDrip: g('#a-first-drip'), puckPrep: g('#a-puck-prep'), drinkType: g('#a-drink-type'), observation: g('#a-observation') },
          pourOver: { bloomWater: g('#a-bloom-water'), bloomTime: g('#a-bloom-time'), beverageWeight: g('#a-beverage'), technique: g('#a-technique'), drainTime: g('#a-drain'),
            pours: Array.prototype.map.call(root.querySelectorAll('.pour-row'), function (r) {
              return { target: r.querySelector('.pour-g').value, at: r.querySelector('.pour-t').value };
            }) }
        },
        waterQuality: g('#a-water'), env: g('#a-env'), tds: g('#a-tds'),
        sliders: slidersRaw,
        stars: Number(g('#f-stars')) || 0,
        tags: Array.prototype.map.call(root.querySelectorAll('#tag-chips .tag-chip.on'), function (t) { return t.getAttribute('data-tag'); }),
        notes: g('#f-notes'), nextStep: g('#f-next'),
        favorite: q('#f-favorite').checked,
        id: editBrew ? editBrew.id : undefined,
        createdAt: editBrew ? editBrew.createdAt : undefined
      };
      var res = C.parseBrewForm(raw, { beans: store.get().beans, gear: store.get().gear, now: new Date().toISOString() });
      if (!res.ok) {
        q('#form-errors').innerHTML = Object.keys(res.errors).map(function (k) { return '<div>• ' + C.esc(res.errors[k]) + '</div>'; }).join('');
        q('#form-errors').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (res.newBean) store.addBean(res.newBean);
      if (editBrew) store.updateBrew(editBrew.id, res.brew);
      else store.addBrew(res.brew);
      CoffeeApp.go('#/brew/' + res.brew.id);
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
