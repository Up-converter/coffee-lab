/* beans.js — 豆子库：列表 / 表单 */
(function () {
  'use strict';
  var C = CoffeeCore;

  function todayStr() { return new Date().toISOString().slice(0, 10); }

  function cardHtml(b, stats) {
    var st = stats[b.id] || { count: 0, avg: null };
    var age = b.roastDate ? C.calcBeanAgeDays(todayStr(), b.roastDate) : null;
    var loc = [b.country, b.region, b.process].filter(Boolean).join(' · ');
    return '<article class="card bean-card">'
      + '<div class="card-top"><h3 style="margin:0">' + C.esc(b.name) + '</h3>'
      + (b.roastLevel ? '<span class="badge badge-plain">' + C.esc(b.roastLevel) + '</span>' : '')
      + (age != null ? '<span class="age-badge">养豆 ' + age + ' 天</span>' : '') + '</div>'
      + (loc || b.roaster ? '<div class="sub">' + C.esc([b.roaster, loc].filter(Boolean).join(' · ')) + '</div>' : '')
      + (b.aromatics ? '<div class="sub">官方风味：' + C.esc(b.aromatics) + '</div>' : '')
      + '<div class="bean-stats">' + st.count + ' 杯' + (st.avg != null ? ' · 平均 ' + '★'.repeat(Math.round(st.avg)) : '') + '</div>'
      + '<div class="bean-actions">'
      + '<a class="btn btn-ghost" href="#/bean/' + C.esc(b.id) + '/edit">编辑</a>'
      + '<button class="btn btn-ghost" data-toggle="' + C.esc(b.id) + '">' + (b.finished ? '恢复在喝' : '标记喝完') + '</button>'
      + '<button class="btn btn-ghost" data-del="' + C.esc(b.id) + '">删除</button>'
      + '</div></article>';
  }

  function mount(rootEl) { rootEl.innerHTML = ''; var d = document.createElement('div'); rootEl.appendChild(d); return d; }

  function renderList(rootEl) {
    var root = mount(rootEl);
    var store = CoffeeApp.store, s = store.get();
    var stats = {};
    s.brews.forEach(function (w) {
      if (!w.beanId) return;
      stats[w.beanId] = stats[w.beanId] || { count: 0, sum: 0, n: 0 };
      stats[w.beanId].count++;
      if (w.sensory && w.sensory.stars) { stats[w.beanId].sum += w.sensory.stars; stats[w.beanId].n++; }
    });
    Object.keys(stats).forEach(function (k) {
      stats[k].avg = stats[k].n ? stats[k].sum / stats[k].n : null;
    });
    var open = s.beans.filter(function (b) { return !b.finished; });
    var done = s.beans.filter(function (b) { return b.finished; });

    root.innerHTML = '<div class="page-head"><h2>豆子库 ' + s.beans.length + ' 款</h2></div>'
      + (open.length ? '<div class="group-title">在喝</div><div class="bean-grid">' + open.map(function (b) { return cardHtml(b, stats); }).join('') + '</div>' : '')
      + (done.length ? '<div class="group-title">已喝完</div><div class="bean-grid">' + done.map(function (b) { return cardHtml(b, stats); }).join('') + '</div>' : '')
      + (s.beans.length ? '' : '<div class="empty">还没有豆子档案。可以在这里新建，也可以在记录一杯时勾选"同时存入豆子库"。</div>')
      + '<a class="fab" href="#/bean/new" title="新增豆子">＋</a>';

    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-toggle]');
      if (t) {
        var b = s.beans.filter(function (x) { return x.id === t.getAttribute('data-toggle'); })[0];
        if (b) store.updateBean(b.id, { finished: !b.finished });
        return;
      }
      var d = e.target.closest('[data-del]');
      if (d && confirm('删除这款豆子？历史记录会保留它的快照信息。')) {
        store.deleteBean(d.getAttribute('data-del'));
      }
    });
  }

  function renderForm(root, id) {
    var store = CoffeeApp.store, s = store.get();
    var bean = id ? s.beans.filter(function (b) { return b.id === id; })[0] : null;
    function v(k) { return bean ? (bean[k] != null ? bean[k] : '') : ''; }
    root.innerHTML = '<form class="form-card" id="bean-form" novalidate>'
      + '<div class="page-head"><h2>' + (bean ? '编辑豆子' : '新增豆子') + '</h2></div>'
      + '<div class="err-box" id="bean-errors"></div>'
      + '<div class="form-section"><h4>基本信息</h4><div class="field-row">'
      + '<div class="field"><span class="label">名称 <span class="req">*</span></span><input id="b-name" class="input" value="' + C.esc(v('name')) + '"></div>'
      + '<div class="field"><span class="label">烘焙商</span><input id="b-roaster" class="input" value="' + C.esc(v('roaster')) + '"></div>'
      + '<div class="field"><span class="label">烘焙度</span><input id="b-roast" class="input" list="roast-list" value="' + C.esc(v('roastLevel')) + '"></div>'
      + '<div class="field"><span class="label">烘焙日期</span><input id="b-roast-date" class="input" type="date" value="' + C.esc(v('roastDate')) + '"><span class="hint">用于自动计算养豆天数</span></div>'
      + '<datalist id="roast-list">' + C.ROAST_LEVELS.map(function (r) { return '<option value="' + r + '">'; }).join('') + '</datalist>'
      + '</div></div>'
      + '<div class="form-section"><h4>产地与处理</h4><div class="field-row">'
      + '<div class="field"><span class="label">产国</span><input id="b-country" class="input" value="' + C.esc(v('country')) + '"></div>'
      + '<div class="field"><span class="label">产区</span><input id="b-region" class="input" value="' + C.esc(v('region')) + '"></div>'
      + '<div class="field"><span class="label">处理法</span><input id="b-process" class="input" list="process-list" value="' + C.esc(v('process')) + '"></div>'
      + '<datalist id="process-list">' + C.PROCESSES.map(function (p) { return '<option value="' + p + '">'; }).join('') + '</datalist>'
      + '<div class="field"><span class="label">豆种</span><input id="b-variety" class="input" value="' + C.esc(v('variety')) + '" placeholder="Heirloom / Geisha…"></div>'
      + '<div class="field"><span class="label">海拔</span><input id="b-elevation" class="input" value="' + C.esc(v('elevation')) + '"></div>'
      + '</div></div>'
      + '<div class="form-section"><h4>其他</h4><div class="field-row">'
      + '<div class="field wide"><span class="label">官方风味描述</span><input id="b-aromatics" class="input" value="' + C.esc(v('aromatics')) + '"></div>'
      + '<div class="field wide"><span class="label">备注</span><textarea id="b-note" class="input">' + C.esc(v('note')) + '</textarea></div>'
      + '<div class="field wide"><label class="hint"><input type="checkbox" id="b-finished"' + (bean && bean.finished ? ' checked' : '') + '> 已喝完</label></div>'
      + '</div></div>'
      + '<div class="btn-row"><button type="submit" class="btn btn-primary">保存</button>'
      + '<a class="btn" href="#/beans">取消</a></div></form>';

    root.querySelector('#bean-form').addEventListener('submit', function (e) {
      e.preventDefault();
      function g(id) { return root.querySelector(id).value; }
      var res = C.parseBeanForm({
        id: bean ? bean.id : undefined,
        createdAt: bean ? bean.createdAt : undefined,
        name: g('#b-name'), roaster: g('#b-roaster'), roastLevel: g('#b-roast'), roastDate: g('#b-roast-date'),
        country: g('#b-country'), region: g('#b-region'), process: g('#b-process'),
        variety: g('#b-variety'), elevation: g('#b-elevation'), aromatics: g('#b-aromatics'),
        finished: root.querySelector('#b-finished').checked, note: g('#b-note')
      });
      if (!res.ok) {
        root.querySelector('#bean-errors').innerHTML = Object.keys(res.errors).map(function (k) { return '<div>• ' + C.esc(res.errors[k]) + '</div>'; }).join('');
        return;
      }
      if (bean) store.updateBean(bean.id, res.bean);
      else store.addBean(res.bean);
      CoffeeApp.go('#/beans');
    });
  }

  window.Pages = window.Pages || {};
  Pages.beans = { render: function (root) { renderList(root); } };
  Pages.bean = {
    render: function (root, route) {
      if (route.parts[1] === 'new' || route.parts[2] === 'edit') renderForm(root, route.parts[2] === 'edit' ? route.parts[1] : null);
      else CoffeeApp.go('#/beans');
    }
  };
})();
