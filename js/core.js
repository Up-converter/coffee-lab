/* CoffeeCore — 纯逻辑库（UMD：浏览器挂 window.CoffeeCore，Node 可 require） */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.CoffeeCore = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DATA_VERSION = 1;
  var METHOD_LABEL = { espresso: '意式', pourOver: '手冲', coldBrew: '冷萃' };
  var METHODS = ['espresso', 'pourOver', 'coldBrew'];
  var ROAST_LEVELS = ['极浅', '浅', '中浅', '中', '中深', '深'];
  var PROCESSES = ['水洗', '日晒', '蜜处理', '厌氧发酵', '其他'];
  var DRINK_TYPES = ['浓缩', 'Ristretto', 'Lungo', '美式', '拿铁'];
  var FLAVOR_TAGS = ['柑橘', '莓果', '热带水果', '花香', '焦糖', '巧克力', '坚果', '红茶', '绿茶', '发酵感', '酒感', '香料', '谷物'];
  var SENSORY_SLIDERS = [
    { key: 'acidity', label: '酸质', color: 'amber' },
    { key: 'sweetness', label: '甜感', color: 'amber' },
    { key: 'bitterness', label: '苦感', color: 'brown' },
    { key: 'body', label: '醇厚度', color: 'brown' },
    { key: 'balance', label: '平衡感', color: 'green' },
    { key: 'aftertaste', label: '余韵', color: 'green' },
    { key: 'complexity', label: '风味复杂度', color: 'green' },
    { key: 'clean', label: '干净度', color: 'green' }
  ];
  var ESPRESSO_EXTRA_SLIDER = { key: 'strength', label: '浓缩强度', color: 'brown' };

  function newId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function num(v) {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function calcRatio(dose, water) {
    var d = num(dose), w = num(water);
    if (!d || d <= 0 || w === null || w < 0) return null;
    return Math.round((w / d) * 10) / 10;
  }

  function formatRatio(dose, water) {
    var r = calcRatio(dose, water);
    if (r === null) return '';
    return '1:' + (Math.round(r) === r ? String(r) : r.toFixed(1));
  }

  function parseYmd(s) {
    if (!s || typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
    var d = new Date(s.slice(0, 10) + 'T00:00:00Z');
    return isNaN(d.getTime()) ? null : d;
  }

  function calcBeanAgeDays(dateStr, roastDateStr) {
    var a = parseYmd(dateStr), b = parseYmd(roastDateStr);
    if (!a || !b) return null;
    return Math.round((a - b) / 86400000);
  }

  function calcExtractionYield(beverage, tdsPct, dose) {
    var bv = num(beverage), t = num(tdsPct), d = num(dose);
    if (bv === null || t === null || !d || d <= 0) return null;
    return Math.round((bv * t / d) * 10) / 10;
  }

  function formatDuration(sec) {
    var s = num(sec);
    if (s === null) return '';
    if (s < 60) return s + 's';
    var m = Math.floor(s / 60), r = Math.round(s % 60);
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  /* 按冲煮方式格式化时间：意式 27s / 手冲 2:30 / 冷萃 12h（内部一律存秒） */
  function formatTimeFor(method, sec) {
    var s = num(sec);
    if (s === null) return '';
    if (method === 'espresso') return s + 's';
    if (method === 'coldBrew') {
      var h = Math.round((s / 3600) * 10) / 10;
      return (Math.round(h) === h ? String(h) : h.toFixed(1)) + 'h';
    }
    return formatDuration(s);
  }

  function formatPours(pours) {
    if (!pours || !pours.length) return '';
    return pours.map(function (p) { return p.target + 'g@' + p.at; }).join('; ');
  }

  function emptyState() {
    return {
      version: DATA_VERSION,
      beans: [],
      brews: [],
      gear: { machine: '', espressoGrinder: '', pourOverGrinder: '', kettle: '', basket: '', filterPaper: '' },
      settings: {}
    };
  }

  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }

  function validateData(obj) {
    var errors = [];
    if (!isObj(obj)) return { ok: false, errors: ['根节点不是对象'] };
    if (obj.version !== DATA_VERSION) errors.push('版本不匹配：期望 ' + DATA_VERSION + '，实际 ' + obj.version);
    if (!Array.isArray(obj.beans)) errors.push('beans 不是数组');
    if (!Array.isArray(obj.brews)) errors.push('brews 不是数组');
    if (errors.length) return { ok: false, errors: errors };
    obj.beans.forEach(function (b, i) {
      if (!isObj(b) || typeof b.id !== 'string' || !b.id || typeof b.name !== 'string' || !b.name) {
        errors.push('beans[' + i + '] 缺少 id 或 name');
      }
    });
    obj.brews.forEach(function (w, i) {
      if (!isObj(w) || typeof w.id !== 'string' || !w.id ||
          METHODS.indexOf(w.method) < 0 || typeof w.date !== 'string' || !w.date) {
        errors.push('brews[' + i + '] 缺少 id/method/date');
      } else if (w.photos !== undefined && w.photos !== null) {
        /* 照片：可选，主数据里只存 IndexedDB 照片 id 引用 */
        var badPhoto = !Array.isArray(w.photos) || w.photos.some(function (p) { return typeof p !== 'string'; });
        if (badPhoto) errors.push('brews[' + i + '].photos 应为字符串数组');
      }
    });
    if (errors.length) return { ok: false, errors: errors };
    return {
      ok: true,
      data: {
        version: DATA_VERSION,
        beans: obj.beans,
        brews: obj.brews,
        gear: isObj(obj.gear) ? obj.gear : emptyState().gear,
        settings: isObj(obj.settings) ? obj.settings : {}
      }
    };
  }

  function migrate(obj) { return validateData(obj); }

  function mergeImport(local, imported) {
    var beanIds = {}, brewIds = {}, data = {
      version: DATA_VERSION,
      beans: local.beans.slice(),
      brews: local.brews.slice(),
      gear: local.gear, settings: local.settings
    };
    local.beans.forEach(function (b) { beanIds[b.id] = true; });
    local.brews.forEach(function (w) { brewIds[w.id] = true; });
    var added = { beans: 0, brews: 0 }, skipped = { beans: 0, brews: 0 };
    imported.beans.forEach(function (b) {
      if (beanIds[b.id]) { skipped.beans++; return; }
      beanIds[b.id] = true; data.beans.push(b); added.beans++;
    });
    imported.brews.forEach(function (w) {
      if (brewIds[w.id]) { skipped.brews++; return; }
      brewIds[w.id] = true; data.brews.push(w); added.brews++;
    });
    return { data: data, addedCount: added, skippedCount: skipped };
  }

  function beanSnapshot(bean) {
    if (!bean) return { name: '', roastLevel: null, roastDate: null };
    return { name: bean.name || '', roastLevel: bean.roastLevel || null, roastDate: bean.roastDate || null };
  }

  function gearSnapshot(gear, method) {
    gear = gear || {};
    if (method === 'espresso') {
      return { machine: gear.machine || '', grinder: gear.espressoGrinder || '', basket: gear.basket || '' };
    }
    if (method === 'coldBrew') {
      return { grinder: gear.pourOverGrinder || '', filterPaper: gear.filterPaper || '' };
    }
    return { grinder: gear.pourOverGrinder || '', kettle: gear.kettle || '', filterPaper: gear.filterPaper || '' };
  }

  var CSV_HEADER = ['日期', '方式', '豆名', '烘焙度', '养豆天数', '粉量(g)', '液重/注水(g)', '时间(秒)', '水温(℃)', '研磨刻度', '滤杯', '比例',
    '星级', '酸质', '甜感', '苦感', '醇厚度', '平衡感', '余韵', '风味复杂度', '干净度', '浓缩强度',
    '风味标签', '品鉴笔记', '下次调整计划', '收藏',
    '压力(bar)', '预浸(秒)', '预浸方式', '首滴(秒)', '饮品类型', '布粉压粉', '萃取观察',
    '闷蒸水量(g)', '闷蒸时间(秒)', '分段注水', '出品液重(g)', '手法', '滴滤完成(秒)',
    '水质', '环境', 'TDS(%)', 'EY(%)', '咖啡机', '磨豆机', '手冲壶', '粉碗', '滤纸', '冷萃容器'];

  function csvCell(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function eyFor(brew) {
    var adv = brew.advanced || {};
    var bv = brew.water;
    if (brew.method === 'pourOver' && adv.pourOver && adv.pourOver.beverageWeight != null) bv = adv.pourOver.beverageWeight;
    if (brew.method === 'coldBrew' && adv.coldBrew && adv.coldBrew.beverageWeight != null) bv = adv.coldBrew.beverageWeight;
    return calcExtractionYield(bv, adv.tds, brew.dose);
  }

  function brewsToCsv(brews) {
    var rows = brews.map(function (w) {
      var E = (w.advanced && w.advanced.espresso) || {}, P = (w.advanced && w.advanced.pourOver) || {},
          CB = (w.advanced && w.advanced.coldBrew) || {};
      var G = w.gearSnapshot || {};
      var age = w.beanSnapshot && w.beanSnapshot.roastDate ? calcBeanAgeDays(w.date, w.beanSnapshot.roastDate) : null;
      var s = (w.sensory && w.sensory.sliders) || {};
      var cells = [
        (w.date || '').replace('T', ' '), METHOD_LABEL[w.method] || w.method,
        w.beanSnapshot ? w.beanSnapshot.name : '', w.beanSnapshot ? w.beanSnapshot.roastLevel : '',
        age, w.dose, w.water, w.time, w.temp, w.grind, w.dripper, formatRatio(w.dose, w.water),
        w.sensory ? w.sensory.stars : '',
        s.acidity, s.sweetness, s.bitterness, s.body, s.balance, s.aftertaste, s.complexity, s.clean, s.strength,
        w.sensory && w.sensory.tags ? w.sensory.tags.join('|') : '',
        w.sensory ? w.sensory.notes : '', w.sensory ? w.sensory.nextStep : '',
        w.favorite ? '是' : '否',
        E.pressure, E.preinfusionTime, E.preinfusionType, E.firstDrip, E.drinkType, E.puckPrep, E.observation,
        P.bloomWater, P.bloomTime, formatPours(P.pours), P.beverageWeight != null ? P.beverageWeight : CB.beverageWeight, P.technique, P.drainTime,
        w.advanced ? w.advanced.water : '', w.advanced ? w.advanced.env : '',
        w.advanced ? w.advanced.tds : '', eyFor(w),
        G.machine || '', G.grinder || '', G.kettle || '', G.basket || '', G.filterPaper || '',
        CB.container || ''
      ];
      return cells.map(csvCell).join(',');
    });
    return CSV_HEADER.join(',') + '\n' + rows.join('\n');
  }

  function str(v) {
    var s = String(v == null ? '' : v).trim();
    return s === '' ? null : s;
  }

  function slidersFor(method) {
    return method === 'espresso' ? SENSORY_SLIDERS.concat([ESPRESSO_EXTRA_SLIDER]) : SENSORY_SLIDERS;
  }

  function parseBrewForm(raw, ctx) {
    raw = raw || {};
    ctx = ctx || {};
    var errors = {};
    var method = raw.method;
    if (METHODS.indexOf(method) < 0) errors.method = '请选择冲煮方式';
    var date = str(raw.date);
    if (!date) errors.date = '请填写日期';

    var bean = null, newBean = null;
    var beans = ctx.beans || [];
    if (raw.beanId) {
      bean = beans.filter(function (b) { return b.id === raw.beanId; })[0] || null;
      if (!bean) errors.beanId = '所选豆子不存在';
    }
    if (!bean && !errors.beanId) {
      var name = str(raw.beanName);
      if (!name) errors.beanName = '请选择豆子，或直接输入豆名';
      else {
        bean = { name: name, roastLevel: str(raw.roastLevel), roastDate: str(raw.roastDate) };
        if (raw.saveBean) {
          newBean = {
            id: newId(), name: name, roaster: str(raw.roaster) || '',
            roastLevel: bean.roastLevel || '', roastDate: bean.roastDate || '',
            country: '', region: '', process: '', variety: '', elevation: '',
            aromatics: '', finished: false, note: '',
            createdAt: ctx.now || new Date().toISOString()
          };
        }
      }
    }
    if (Object.keys(errors).length) return { ok: false, errors: errors };

    var A = raw.advanced || {}, E = A.espresso || {}, P = A.pourOver || {}, CB = A.coldBrew || {};
    var tds = num(raw.tds);
    var sliders = {};
    slidersFor(method).forEach(function (s) { sliders[s.key] = num((raw.sliders || {})[s.key]); });
    var starsRaw = num(raw.stars);
    /* 照片引用：只保留字符串 id，最多 3 张（上限由 UI 保证，此处兜底） */
    var photos = (Array.isArray(raw.photos) ? raw.photos : [])
      .filter(function (p) { return typeof p === 'string' && p; })
      .slice(0, 3);

    var brew = {
      id: raw.id || newId(),
      method: method, date: date,
      beanId: bean.id || null,
      beanSnapshot: beanSnapshot(bean),
      photos: photos,
      dose: num(raw.dose), water: num(raw.water),
      time: num(raw.time), temp: num(raw.temp),
      grind: str(raw.grind),
      dripper: method === 'pourOver' ? str(raw.dripper) : null,
      advanced: {
        espresso: method === 'espresso' ? {
          pressure: num(E.pressure), preinfusionTime: num(E.preinfusionTime),
          preinfusionType: str(E.preinfusionType), firstDrip: num(E.firstDrip),
          puckPrep: str(E.puckPrep), drinkType: str(E.drinkType), observation: str(E.observation)
        } : null,
        pourOver: method === 'pourOver' ? {
          bloomWater: num(P.bloomWater), bloomTime: num(P.bloomTime),
          pours: (P.pours || []).map(function (p) { return { target: num(p.target), at: str(p.at) }; })
            .filter(function (p) { return p.target !== null; }),
          beverageWeight: num(P.beverageWeight), technique: str(P.technique), drainTime: num(P.drainTime)
        } : null,
        coldBrew: method === 'coldBrew' ? {
          container: str(CB.container), beverageWeight: num(CB.beverageWeight)
        } : null,
        water: str(raw.waterQuality), env: str(raw.env), tds: tds
      },
      sensory: {
        sliders: sliders,
        stars: Math.max(0, Math.min(5, starsRaw === null ? 0 : Math.round(starsRaw))),
        tags: (raw.tags || []).filter(function (t) { return typeof t === 'string' && t.trim() !== ''; }),
        notes: str(raw.notes) || '', nextStep: str(raw.nextStep) || ''
      },
      favorite: !!raw.favorite,
      gearSnapshot: gearSnapshot(ctx.gear, method),
      createdAt: raw.createdAt || ctx.now || new Date().toISOString()
    };
    return { ok: true, brew: brew, newBean: newBean };
  }

  function parseBeanForm(raw) {
    raw = raw || {};
    var errors = {};
    var name = str(raw.name);
    if (!name) errors.name = '请填写豆子名称';
    if (Object.keys(errors).length) return { ok: false, errors: errors };
    return {
      ok: true,
      bean: {
        id: raw.id || newId(), name: name,
        roaster: str(raw.roaster) || '', roastLevel: str(raw.roastLevel) || '',
        roastDate: str(raw.roastDate) || '',
        country: str(raw.country) || '', region: str(raw.region) || '',
        process: str(raw.process) || '', variety: str(raw.variety) || '',
        elevation: str(raw.elevation) || '', aromatics: str(raw.aromatics) || '',
        finished: !!raw.finished, note: str(raw.note) || '',
        createdAt: raw.createdAt || new Date().toISOString()
      }
    };
  }

  var api = {
    DATA_VERSION: DATA_VERSION, METHOD_LABEL: METHOD_LABEL, METHODS: METHODS,
    ROAST_LEVELS: ROAST_LEVELS, PROCESSES: PROCESSES,
    DRINK_TYPES: DRINK_TYPES, FLAVOR_TAGS: FLAVOR_TAGS,
    SENSORY_SLIDERS: SENSORY_SLIDERS, ESPRESSO_EXTRA_SLIDER: ESPRESSO_EXTRA_SLIDER,
    newId: newId, esc: esc, num: num,
    calcRatio: calcRatio, formatRatio: formatRatio,
    calcBeanAgeDays: calcBeanAgeDays, calcExtractionYield: calcExtractionYield,
    formatDuration: formatDuration, formatTimeFor: formatTimeFor, formatPours: formatPours
    , emptyState: emptyState, validateData: validateData, migrate: migrate,
    mergeImport: mergeImport, beanSnapshot: beanSnapshot, gearSnapshot: gearSnapshot
    , CSV_HEADER: CSV_HEADER, eyFor: eyFor, brewsToCsv: brewsToCsv
    , parseBrewForm: parseBrewForm, parseBeanForm: parseBeanForm
  };
  return api;
});
