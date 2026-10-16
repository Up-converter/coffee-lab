const { test } = require('node:test');
const assert = require('node:assert');
const C = require('../js/core.js');

test('常量与标签', () => {
  assert.equal(C.DATA_VERSION, 1);
  assert.equal(C.METHOD_LABEL.espresso, '意式');
  assert.equal(C.METHOD_LABEL.pourOver, '手冲');
  assert.equal(C.ROAST_LEVELS.length, 6);
  assert.ok(C.FLAVOR_TAGS.includes('柑橘'));
  assert.equal(C.SENSORY_SLIDERS.length, 8);
  assert.equal(C.ESPRESSO_EXTRA_SLIDER.key, 'strength');
});

test('newId 唯一且为字符串', () => {
  const a = C.newId(), b = C.newId();
  assert.notEqual(a, b);
  assert.equal(typeof a, 'string');
});

test('esc 转义 HTML', () => {
  assert.equal(C.esc('<a>&"\''), '&lt;a&gt;&amp;&quot;&#39;');
  assert.equal(C.esc(null), '');
});

test('calcRatio / formatRatio', () => {
  assert.equal(C.calcRatio(18, 36), 2);
  assert.equal(C.calcRatio(15, 240), 16);
  assert.equal(C.calcRatio(17, 42.5), 2.5);
  assert.equal(C.calcRatio(0, 36), null);
  assert.equal(C.calcRatio(null, 36), null);
  assert.equal(C.formatRatio(18, 36), '1:2');
  assert.equal(C.formatRatio(15, 240), '1:16');
  assert.equal(C.formatRatio(17, 42.5), '1:2.5');
  assert.equal(C.formatRatio(18, null), '');
});

test('calcBeanAgeDays', () => {
  assert.equal(C.calcBeanAgeDays('2026-10-15T09:00', '2026-10-01'), 14);
  assert.equal(C.calcBeanAgeDays('2026-10-01', '2026-10-04'), -3);
  assert.equal(C.calcBeanAgeDays('2026-10-15', null), null);
  assert.equal(C.calcBeanAgeDays('bad', '2026-10-01'), null);
});

test('calcExtractionYield', () => {
  assert.equal(C.calcExtractionYield(36, 9, 18), 18);
  assert.equal(C.calcExtractionYield(240, 1.35, 15), 21.6);
  assert.equal(C.calcExtractionYield(36, 9, 0), null);
});

test('formatDuration', () => {
  assert.equal(C.formatDuration(27), '27s');
  assert.equal(C.formatDuration(150), '2:30');
  assert.equal(C.formatDuration(null), '');
});

test('formatPours', () => {
  assert.equal(C.formatPours([{ target: 45, at: '0:30' }, { target: 135, at: '1:15' }]), '45g@0:30; 135g@1:15');
  assert.equal(C.formatPours([]), '');
});

test('emptyState 结构', () => {
  var s = C.emptyState();
  assert.equal(s.version, 1);
  assert.deepEqual(s.beans, []);
  assert.deepEqual(s.brews, []);
  assert.equal(s.gear.espressoGrinder, '');
  assert.equal(s.gear.pourOverGrinder, '');
});

test('validateData 合法与非法', () => {
  var ok = C.validateData(C.emptyState());
  assert.equal(ok.ok, true);
  assert.ok(!C.validateData(null).ok);
  assert.ok(!C.validateData({ version: 2 }).ok);
  assert.ok(!C.validateData({ version: 1, beans: 'x' }).ok);
  var bad = C.validateData({ version: 1, beans: [{ name: 'x' }], brews: [] });
  assert.ok(!bad.ok);
  var badBrew = C.validateData({ version: 1, beans: [], brews: [{ id: 'a', method: 'espresso' }] });
  assert.ok(!badBrew.ok);
});

test('migrate v1 直通', () => {
  var s = C.emptyState();
  assert.equal(C.migrate(s).ok, true);
  assert.ok(!C.migrate({ junk: 1 }).ok);
});

test('mergeImport 按 id 去重', () => {
  var local = C.emptyState();
  local.beans = [{ id: 'b1', name: '豆A' }];
  local.brews = [{ id: 'w1', method: 'espresso', date: '2026-10-15T08:00' }];
  var imp = C.emptyState();
  imp.beans = [{ id: 'b1', name: '豆A' }, { id: 'b2', name: '豆B' }];
  imp.brews = [{ id: 'w1', method: 'espresso', date: '2026-10-15T09:00' }, { id: 'w2', method: 'pourOver', date: '2026-10-15T10:00' }];
  var m = C.mergeImport(local, imp);
  assert.equal(m.addedCount.beans, 1);
  assert.equal(m.skippedCount.beans, 1);
  assert.equal(m.addedCount.brews, 1);
  assert.equal(m.skippedCount.brews, 1);
  assert.equal(m.data.beans.length, 2);
  assert.equal(m.data.brews.length, 2);
});

test('beanSnapshot / gearSnapshot', () => {
  var bean = { name: '豆A', roastLevel: '浅', roastDate: '2026-10-01' };
  assert.deepEqual(C.beanSnapshot(bean), { name: '豆A', roastLevel: '浅', roastDate: '2026-10-01' });
  var gear = { machine: 'ECM', espressoGrinder: 'Niche', pourOverGrinder: 'C40', kettle: 'Fellow', basket: '18g', filterPaper: 'Hario' };
  assert.deepEqual(C.gearSnapshot(gear, 'espresso'), { machine: 'ECM', grinder: 'Niche', basket: '18g' });
  assert.deepEqual(C.gearSnapshot(gear, 'pourOver'), { grinder: 'C40', kettle: 'Fellow', filterPaper: 'Hario' });
});

function sampleBrew() {
  return {
    id: 'w1', method: 'espresso', date: '2026-10-15T08:30',
    beanId: 'b1', beanSnapshot: { name: '豆A, 耶加', roastLevel: '浅', roastDate: '2026-10-01' },
    dose: 18, water: 36, time: 27, temp: 93, grind: 'Niche 12', dripper: null,
    advanced: {
      espresso: { pressure: 9, preinfusionTime: 5, preinfusionType: '渐进', firstDrip: 8, puckPrep: 'WDT', drinkType: '浓缩', observation: '虎斑' },
      pourOver: null, water: '农夫山泉', env: null, tds: 9
    },
    sensory: {
      sliders: { acidity: 7, sweetness: 6, bitterness: 3, body: 5, balance: 7, aftertaste: 6, complexity: 7, clean: 8, strength: 6 },
      stars: 4, tags: ['柑橘', '花香'], notes: '明亮的柑橘酸', nextStep: '调粗1格'
    },
    favorite: true,
    gearSnapshot: { machine: 'ECM', grinder: 'Niche', basket: '18g' },
    createdAt: '2026-10-15T08:31:00.000Z'
  };
}

test('eyFor', () => {
  assert.equal(C.eyFor(sampleBrew()), 18);
  var b = sampleBrew(); b.advanced.tds = null;
  assert.equal(C.eyFor(b), null);
});

test('brewsToCsv 表头与转义', () => {
  var csv = C.brewsToCsv([sampleBrew()]);
  var lines = csv.split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith('日期,方式,豆名,烘焙度,养豆天数'));
  assert.ok(lines[1].includes('"豆A, 耶加"'));        // 含逗号的豆名被引号包裹
  assert.ok(lines[1].includes('1:2'));                 // 比例
  assert.ok(lines[1].includes('14'));                  // 养豆天数
  assert.ok(lines[1].includes('柑橘|花香'));           // 标签 | 连接
  assert.ok(lines[1].includes('18'));                  // EY
  assert.ok(lines[1].includes('是'));                  // 收藏
  assert.ok(!csv.includes('undefined'));
  assert.equal(C.brewsToCsv([]), C.CSV_HEADER.join(',') + '\n');
});

test('brewsToCsv 手冲行', () => {
  var w = sampleBrew();
  w.method = 'pourOver';
  w.advanced = { espresso: null, pourOver: { bloomWater: 45, bloomTime: 30, pours: [{ target: 45, at: '0:30' }, { target: 225, at: '1:40' }], beverageWeight: 195, technique: '绕圈', drainTime: 40 }, water: null, env: null, tds: null };
  w.gearSnapshot = { grinder: 'C40', kettle: 'Fellow', filterPaper: 'Hario' };
  var row = C.brewsToCsv([w]).split('\n')[1];
  assert.ok(row.includes('45g@0:30; 225g@1:40'));
  assert.ok(row.includes('C40'));
});

const S = require('../js/store.js');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

test('store: 空 load 与 CRUD', () => {
  var st = S.createStore(S.memoryStorage());
  assert.equal(st.load().ok, true);
  assert.equal(st.get().brews.length, 0);
  var called = 0;
  st.subscribe(() => called++);
  st.addBrew({ id: 'w1', method: 'espresso', date: '2026-10-15T08:00' });
  assert.equal(called, 1);
  assert.equal(st.get().brews.length, 1);
  st.updateBrew('w1', { dose: 18 });
  assert.equal(st.get().brews[0].dose, 18);
  st.toggleFavorite('w1');
  assert.equal(st.get().brews[0].favorite, true);
  st.deleteBrew('w1');
  assert.equal(st.get().brews.length, 0);
});

test('store: 防抖持久化', async () => {
  var mem = S.memoryStorage();
  var st = S.createStore(mem, { debounceMs: 5 });
  st.load();
  st.addBean({ id: 'b1', name: '豆A' });
  assert.equal(mem.getItem(S.KEY), null); // 未到防抖窗口
  await sleep(30);
  var saved = JSON.parse(mem.getItem(S.KEY));
  assert.equal(saved.beans.length, 1);
});

test('store: 写入失败置 saveError', () => {
  var boom = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
  var st = S.createStore(boom, { debounceMs: 0 });
  st.load();
  st.saveNow();
  assert.equal(st.saveError, true);
});

test('store: 载入损坏数据回退空态', () => {
  var mem = S.memoryStorage();
  mem.setItem(S.KEY, '{{{not json');
  var st = S.createStore(mem);
  var r = st.load();
  assert.equal(r.ok, false);
  assert.equal(st.get().version, 1);
  assert.equal(st.get().brews.length, 0);
});

test('store: importMerge / importReplace / clearAll', () => {
  var mem = S.memoryStorage();
  var st = S.createStore(mem, { debounceMs: 5 });
  st.load();
  st.addBrew({ id: 'w1', method: 'espresso', date: '2026-10-15T08:00' });
  var imp = C.emptyState();
  imp.brews = [{ id: 'w1', method: 'espresso', date: 'x' }, { id: 'w2', method: 'pourOver', date: 'y' }];
  var m = st.importMerge(imp);
  assert.deepEqual(m, { addedCount: { beans: 0, brews: 1 }, skippedCount: { beans: 0, brews: 1 } });
  assert.equal(st.get().brews.length, 2);
  assert.equal(st.importMerge({ junk: 1 }), null);   // 非法数据被拒
  assert.equal(st.importReplace(C.emptyState()), true);
  assert.equal(st.get().brews.length, 0);
  st.addBrew({ id: 'w9', method: 'espresso', date: 'z' });
  st.clearAll();
  assert.equal(st.get().brews.length, 0);
});

var GEARS = { machine: 'ECM', espressoGrinder: 'Niche', pourOverGrinder: 'C40', kettle: 'Fellow', basket: '18g', filterPaper: 'Hario' };
var BEANS = [{ id: 'b1', name: '豆A', roastLevel: '浅', roastDate: '2026-10-01' }];

function baseRaw() {
  return {
    method: 'espresso', date: '2026-10-15T09:00',
    beanId: 'b1', beanName: '', roastLevel: '', roastDate: '', saveBean: false,
    dose: '18', water: '36', time: '27', temp: '93', grind: 'Niche 12', dripper: '',
    advanced: {
      espresso: { pressure: '9', preinfusionTime: '', preinfusionType: '', firstDrip: '8', puckPrep: '', drinkType: '', observation: '' },
      pourOver: { bloomWater: '', bloomTime: '', beverageWeight: '', technique: '', drainTime: '', pours: [] }
    },
    // 水质用独立键 waterQuality：不能与液重 water 同名（对象字面量重复键后者覆盖前者，计划原稿缺陷）
    waterQuality: '', env: '', tds: '',
    sliders: { acidity: '7', sweetness: '', bitterness: '', body: '', balance: '', aftertaste: '', complexity: '', clean: '', strength: '5' },
    stars: 4, tags: ['柑橘'], notes: '好喝', nextStep: '调粗1格', favorite: true
  };
}

test('parseBrewForm: 选库内豆子的意式记录', () => {
  var r = C.parseBrewForm(baseRaw(), { beans: BEANS, gear: GEARS, now: '2026-10-15T09:01:00.000Z' });
  assert.equal(r.ok, true);
  var w = r.brew;
  assert.equal(w.beanId, 'b1');
  assert.deepEqual(w.beanSnapshot, { name: '豆A', roastLevel: '浅', roastDate: '2026-10-01' });
  assert.equal(w.dose, 18); assert.equal(w.water, 36); assert.equal(w.time, 27); assert.equal(w.temp, 93);
  assert.equal(w.advanced.espresso.pressure, 9);
  assert.equal(w.advanced.espresso.preinfusionTime, null);
  assert.equal(w.sensory.sliders.acidity, 7);
  assert.equal(w.sensory.sliders.sweetness, null);
  assert.equal(w.sensory.sliders.strength, 5);   // 意式含浓缩强度
  assert.equal(w.sensory.stars, 4);
  assert.deepEqual(w.sensory.tags, ['柑橘']);
  assert.equal(w.sensory.nextStep, '调粗1格');
  assert.equal(w.favorite, true);
  assert.deepEqual(w.gearSnapshot, { machine: 'ECM', grinder: 'Niche', basket: '18g' });
  assert.equal(w.createdAt, '2026-10-15T09:01:00.000Z');
  assert.equal(r.newBean, null);
  assert.equal(typeof w.id, 'string');
});

test('parseBrewForm: 直接输入豆名 + 存入库', () => {
  var raw = baseRaw();
  raw.beanId = ''; raw.beanName = '新豆X'; raw.roastLevel = '中浅'; raw.roastDate = '2026-10-10'; raw.saveBean = true;
  var r = C.parseBrewForm(raw, { beans: BEANS, gear: GEARS });
  assert.equal(r.ok, true);
  assert.equal(r.brew.beanId, null);
  assert.deepEqual(r.brew.beanSnapshot, { name: '新豆X', roastLevel: '中浅', roastDate: '2026-10-10' });
  assert.equal(r.newBean.name, '新豆X');
  assert.equal(r.newBean.finished, false);
  assert.equal(typeof r.newBean.id, 'string');
});

test('parseBrewForm: 手冲 pours 过滤空行', () => {
  var raw = baseRaw();
  raw.method = 'pourOver'; raw.beanId = ''; raw.beanName = '豆B';
  raw.advanced.pourOver = { bloomWater: '45', bloomTime: '30', beverageWeight: '195', technique: '绕圈', drainTime: '40',
    pours: [{ target: '45', at: '0:30' }, { target: '', at: '' }, { target: '225', at: '1:40' }] };
  raw.sliders.strength = '';
  var r = C.parseBrewForm(raw, { beans: BEANS, gear: GEARS });
  assert.equal(r.ok, true);
  assert.equal(r.brew.advanced.espresso, null);
  assert.equal(r.brew.advanced.pourOver.pours.length, 2);
  assert.deepEqual(r.brew.advanced.pourOver.pours[0], { target: 45, at: '0:30' });
  assert.deepEqual(r.brew.gearSnapshot, { grinder: 'C40', kettle: 'Fellow', filterPaper: 'Hario' });
  assert.equal(r.brew.sensory.sliders.strength, undefined);
});

test('parseBrewForm: 校验错误', () => {
  var raw = baseRaw(); raw.beanId = ''; raw.beanName = '';
  var r = C.parseBrewForm(raw, { beans: BEANS, gear: GEARS });
  assert.equal(r.ok, false);
  assert.ok(r.errors.beanName);
  var raw2 = baseRaw(); raw2.date = '';
  assert.ok(!C.parseBrewForm(raw2, { beans: BEANS, gear: GEARS }).ok);
  var raw3 = baseRaw(); raw3.stars = 9;
  assert.equal(C.parseBrewForm(raw3, { beans: BEANS, gear: GEARS }).brew.sensory.stars, 5);
});

test('parseBeanForm', () => {
  var r = C.parseBeanForm({ name: '豆A', roaster: '治光师', roastLevel: '浅', roastDate: '2026-10-01',
    country: '埃塞俄比亚', region: '耶加雪菲', process: '水洗', variety: '', elevation: '',
    aromatics: '草莓·花香', finished: false, note: '' });
  assert.equal(r.ok, true);
  assert.equal(r.bean.name, '豆A');
  assert.equal(r.bean.country, '埃塞俄比亚');
  assert.equal(r.bean.createdAt !== undefined, true);
  var bad = C.parseBeanForm({ name: '' });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.name);
});
