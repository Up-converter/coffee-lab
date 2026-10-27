/* compare.js — 并排对比：2-3 杯，第一杯为基准 */
(function () {
  'use strict';
  var C = CoffeeCore;
  var sel = [null, null, null];

  function fmt(v, suf) { return v != null && v !== '' ? v + (suf || '') : ''; }

  function fieldsOf(w) {
    var s = w.beanSnapshot || {};
    var E = (w.advanced && w.advanced.espresso) || {}, P = (w.advanced && w.advanced.pourOver) || {};
    var age = s.roastDate ? C.calcBeanAgeDays(w.date, s.roastDate) : null;
    return [
      ['日期', (w.date || '').replace('T', ' ')],
      ['方式', C.METHOD_LABEL[w.method]],
      ['做法', w.drink || E.drinkType || ''],
      ['豆名', s.name || ''],
      ['烘焙度', s.roastLevel || ''],
      ['养豆天数', age != null ? age + ' 天' : ''],
      ['粉量 (g)', fmt(w.dose)],
      ['液重/注水 (g)', fmt(w.water)],
      ['比例', C.formatRatio(w.dose, w.water)],
      ['时间', C.formatTimeFor(w.method, w.time)],
      ['水温 (℃)', fmt(w.temp)],
      ['研磨刻度', w.grind || ''],
      ['滤杯', w.dripper || ''],
      ['压力 (bar)', fmt(E.pressure)],
      ['预浸', fmt(E.preinfusionTime, 's') + (E.preinfusionType ? ' ' + E.preinfusionType : '')],
      ['首滴 (s)', fmt(E.firstDrip)],
      ['饮品类型', E.drinkType || ''],
      ['闷蒸', fmt(P.bloomWater, 'g') + (P.bloomTime != null ? ' ' + P.bloomTime + 's' : '')],
      ['分段注水', C.formatPours(P.pours)],
      ['出品液重 (g)', fmt(P.beverageWeight)],
      ['手法', P.technique || ''],
      ['滴滤完成 (s)', fmt(P.drainTime)],
      ['TDS (%)', fmt(w.advanced && w.advanced.tds)],
      ['EY (%)', C.eyFor(w) != null ? C.eyFor(w) : ''],
      ['总体星级', w.sensory && w.sensory.stars ? '★'.repeat(w.sensory.stars) : ''],
      ['风味标签', (w.sensory && w.sensory.tags || []).join(' | ')],
      ['品鉴笔记', w.sensory && w.sensory.notes || ''],
      ['下次计划', w.sensory && w.sensory.nextStep || '']
    ];
  }

  function brewLabel(w) {
    return (w.date || '').slice(5, 10).replace('-', '/') + ' ' + C.METHOD_LABEL[w.method] + ' · '
      + C.esc(w.beanSnapshot ? w.beanSnapshot.name : '未命名') + ' · ' + (C.formatRatio(w.dose, w.water) || '');
  }

  /* 页面内部重渲染时也换新容器，事件监听不叠加 */
  function mount(rootEl) { rootEl.innerHTML = ''; var d = document.createElement('div'); rootEl.appendChild(d); return d; }

  function render(rootEl) {
    var root = mount(rootEl);
    var store = CoffeeApp.store, s = store.get();
    var brews = s.brews.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    var chosen = sel.map(function (id) { return brews.filter(function (w) { return w.id === id; })[0] || null; })
      .filter(Boolean);

    if (!brews.length) {
      root.innerHTML = '<div class="page-head"><h2>并排对比</h2></div>'
        + '<div class="empty">先记录至少两杯，才能对比实验差异。</div>';
      return;
    }

    function options(i) {
      return '<option value="">— 选择第 ' + (i + 1) + ' 杯' + (i === 0 ? '（基准）' : '') + ' —</option>'
        + brews.map(function (w) {
          return '<option value="' + C.esc(w.id) + '"' + (sel[i] === w.id ? ' selected' : '') + '>' + brewLabel(w) + '</option>';
        }).join('');
    }

    var tableHtml = '';
    var barsHtml = '';
    if (chosen.length >= 2) {
      var cols = chosen.map(fieldsOf);
      var nRows = cols[0].length;
      var html = '<table class="cmp-table"><tr><th>参数</th>'
        + chosen.map(function (w, i) { return '<th>' + (i === 0 ? '基准 · ' : '') + C.METHOD_LABEL[w.method] + '</th>'; }).join('')
        + '</tr>';
      for (var r = 0; r < nRows; r++) {
        var vals = cols.map(function (c) { return c[r][1] == null ? '' : String(c[r][1]); });
        var uniq = {}; vals.forEach(function (v) { if (v !== '') uniq[v] = true; });
        var diff = Object.keys(uniq).length > 1;
        html += '<tr><td class="k">' + cols[0][r][0] + '</td>'
          + vals.map(function (v) { return '<td class="' + (diff ? 'diff' : '') + '">' + C.esc(v || '–') + '</td>'; }).join('') + '</tr>';
      }
      html += '</table>';
      tableHtml = '<div class="cmp-table-wrap">' + html + '</div>';

      var sliderSet = C.SENSORY_SLIDERS.concat(chosen.some(function (w) { return w.method === 'espresso'; }) ? [C.ESPRESSO_EXTRA_SLIDER] : []);
      barsHtml = '<div class="group-title">风味对比</div><div class="note-box">'
        + sliderSet.map(function (sl) {
          var row = chosen.map(function (w, i) {
            var v = (w.sensory.sliders || {})[sl.key];
            var pct = v != null && v > 0 ? (v / 10) * 100 : 0;
            return '<div class="fbar-row"><span class="fbar-label" style="font-size:11px">' + (i === 0 ? '基准' : '杯' + (i + 1)) + '</span>'
              + '<div class="fbar-track"><div class="fbar-fill c-' + sl.color + '" style="width:' + pct + '%"></div></div>'
              + '<span class="fbar-val">' + (v != null && v > 0 ? v : '-') + '</span></div>';
          }).join('');
          return '<div style="margin-bottom:10px"><div class="slider-label">' + sl.label + '</div>' + row + '</div>';
        }).join('') + '</div>';

      tableHtml += '<div class="cmp-col-actions">' + chosen.map(function (w) {
        return '<a class="btn btn-ghost" href="#/brew/new?from=' + C.esc(w.id) + '">用「' + C.esc(w.beanSnapshot ? w.beanSnapshot.name : '') + '」做配方</a>';
      }).join(' ') + '</div>';
    }

    root.innerHTML = '<div class="page-head"><h2>并排对比</h2></div>'
      + '<div class="compare-selects">' + [0, 1, 2].map(function (i) {
        return '<select class="input" data-sel="' + i + '">' + options(i) + '</select>';
      }).join('') + '</div>'
      + (chosen.length < 2 ? '<div class="empty">选择 2-3 杯进行对比；第一杯作为基准，差异参数会高亮。</div>' : tableHtml + barsHtml);

    root.querySelectorAll('[data-sel]').forEach(function (el) {
      el.addEventListener('change', function () {
        sel[Number(el.getAttribute('data-sel'))] = el.value || null;
        render(rootEl);
      });
    });
  }

  window.Pages = window.Pages || {};
  Pages.compare = { render: render };
})();
