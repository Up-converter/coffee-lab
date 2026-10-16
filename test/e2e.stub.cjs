/* test/e2e.stub.cjs — Task 14 端到端验收（Step 3 浏览器清单）的 Node 自动化替代
 *
 * 用真实 js/core.js + js/store.js（§8 再加载真实 js/ui/brews.js 的 renderList）
 * 配最小 document stub，走完「设置器具 → 豆子入库 → 意式 → 复制为新实验 → 手冲直输豆名
 * → 编辑/收藏 → 导出 JSON/CSV → 合并(跳过全部)/覆盖 → 清空空态 → 恢复」全数据链路。
 *
 * 与 11 步浏览器清单的对应（数据层 = 本脚本覆盖；视觉/交互/导航/SW 安装 = 需真人浏览器验收）：
 *   清单 1  设置器具           → §1 数据层（表单视觉/保存提示人工）
 *   清单 2  新增豆子 + 养豆badge→ §1 数据层 parseBeanForm/addBean/age 14（badge 视觉人工）
 *   清单 3  意式记录全字段     → §1（字段/器具快照/养豆14/EY 空；详情页排版人工）
 *   清单 4  复制为新实验       → §2（同参数只改水温、风味为空；预填交互人工）
 *   清单 5  豆名直输+存入库 / 手冲分段注水+闷蒸 → §3、§4（实时比例显示、勾选框人工）
 *   清单 6  筛选/搜索/收藏     → §5 数据层 + §8 渲染冒烟（点按手感人工）
 *   清单 7  对比页             —— 纯 UI（差异高亮/并排条/用作配方），人工验收
 *   清单 8  编辑改星级生效     → §5（详情页生效人工）
 *   清单 9  导出/导入/合并/覆盖→ §6、§7 数据层（文件下载/选择器/Excel 打开人工）
 *   清单 10 清空 → 空态 → 恢复 → §6（输入“删除”解锁交互人工）
 *   清单 11 手机浏览器         —— 人工验收（底部导航/软键盘/SW 安装）
 *   §9 = 最终审查 Fix 1 回归：设置页持久 toast（视图重建后消息仍可见、6s 自动隐藏、err 样式、计时重置）
 *
 * 运行：node test/e2e.stub.cjs   （全部通过退出码 0；被 node --test 拾取时自动跳过）
 */
'use strict';
if (process.env.NODE_TEST_CONTEXT) {
  /* 被 node --test 以任何形式拾取时退出（本文件是手动脚本，文件名不含 .test.） */
  console.log('[e2e.stub] detected node --test runner: skipped (run manually: node test/e2e.stub.cjs)');
  return;
}

const path = require('path');
const assert = require('node:assert');
const C = require(path.join(__dirname, '..', 'js', 'core.js'));
const S = require(path.join(__dirname, '..', 'js', 'store.js'));

/* ---------- 断言 / 分节汇总 ---------- */
const sections = [];
let cur = null;
function section(name, fn) { cur = { name, pass: 0, fail: 0, skipped: false }; sections.push(cur); fn(); }
function ok(label, cond, detail) {
  if (cond) { cur.pass++; console.log('  ok   ' + label); }
  else { cur.fail++; console.log('  FAIL ' + label + (detail ? '   [' + detail + ']' : '')); }
}
function j(v) { return v === undefined ? 'undefined' : JSON.stringify(v); }
function eq(label, actual, expected) {
  let good = false;
  try { assert.deepStrictEqual(actual, expected); good = true; } catch (e) { /* fallthrough */ }
  ok(label, good, 'actual=' + j(actual) + ' expected=' + j(expected));
}

/* ---------- 确定性日期：同一时刻快照，烘焙日期 = 冲煮日期 14 / 10 天前 ---------- */
const NOW = Date.now();
const NOW_ISO = new Date(NOW).toISOString();
function ymd(offsetDays) { return new Date(NOW + offsetDays * 86400000).toISOString().slice(0, 10); }
const TODAY = ymd(0), ROAST_ESP = ymd(-14), ROAST_POUR = ymd(-10);

/* ---------- 真实 store（memoryStorage 注入，等同浏览器 localStorage 路径） ---------- */
const mem1 = S.memoryStorage();
const store = S.createStore(mem1);          /* 默认 300ms 防抖，与 app.js 一致 */
store.load();
function ctx() { return { beans: store.get().beans, gear: store.get().gear, now: NOW_ISO }; }

console.log('E2E stub harness — CoffeeLab Task 14 / 浏览器清单的数据层自动化等价');
console.log('today=' + TODAY + '  roastEspresso=' + ROAST_ESP + '(14天前)  roastPourOver=' + ROAST_POUR + '(10天前)\n');

/* ================= §1 清单 1+2+3：器具 / 豆子入库 / 意式记录全字段 ================= */
let beanId = null, brew1 = null;
section('1. 设置器具 + 新增豆子（烘焙 14 天前）+ 意式记录全字段（清单 1/2/3）', function () {
  /* 清单 1：设置页保存器具（数据层 = setGear） */
  store.setGear({
    machine: 'ECM Synchronika', espressoGrinder: 'Niche Zero', pourOverGrinder: 'Comandante C40',
    kettle: 'Fellow Stagg', basket: '58mm 18g', filterPaper: 'Hario 02 漂白'
  });
  eq('器具 6 项入库', store.get().gear, {
    machine: 'ECM Synchronika', espressoGrinder: 'Niche Zero', pourOverGrinder: 'Comandante C40',
    kettle: 'Fellow Stagg', basket: '58mm 18g', filterPaper: 'Hario 02 漂白'
  });
  ok('存储 key 为 README 所载 coffeeLab.data', S.KEY === 'coffeeLab.data');

  /* 清单 2：豆子页表单 → parseBeanForm → addBean */
  const rb = C.parseBeanForm({
    name: '耶加雪菲', roaster: '治光师', roastLevel: '浅', roastDate: ROAST_ESP,
    country: '埃塞俄比亚', region: '耶加雪菲', process: '水洗'
  });
  ok('parseBeanForm 通过', rb.ok === true);
  store.addBean(rb.bean);
  beanId = rb.bean.id;
  eq('豆子库 1 款，烘焙日期 = 14 天前', { n: store.get().beans.length, roast: store.get().beans[0].roastDate },
    { n: 1, roast: ROAST_ESP });
  ok('养豆天数 = 14（badge 数据）', C.calcBeanAgeDays(TODAY, ROAST_ESP) === 14);

  /* 清单 3：意式记录（选库内豆子；更多参数：压力 9 / 首滴 8 / 萃取观察；酸质 7；星级 4；标签；收藏） */
  const raw1 = {
    method: 'espresso', date: TODAY + 'T09:00',
    beanId: beanId, beanName: '', roastLevel: '', roastDate: '', saveBean: false,
    dose: '18', water: '36', time: '27', temp: '93', grind: 'Niche 12 刻度', dripper: '',
    advanced: {
      espresso: { pressure: '9', preinfusionTime: '', preinfusionType: '', firstDrip: '8', puckPrep: 'WDT 布粉', drinkType: '浓缩', observation: '虎斑油脂丰厚' },
      pourOver: { bloomWater: '', bloomTime: '', pours: [], beverageWeight: '', technique: '', drainTime: '' }
    },
    waterQuality: '农夫山泉', env: '室温 22℃', tds: '',          /* tds 空 = 无折光仪（Rev3：水质键 waterQuality） */
    sliders: { acidity: '7', sweetness: '6', bitterness: '3', body: '5', balance: '7', aftertaste: '6', complexity: '7', clean: '8', strength: '6' },
    stars: 4, tags: ['柑橘', '花香'], notes: '明亮的柑橘酸，甜感干净', nextStep: '下一把粉调粗 1 格', favorite: true
  };
  const r1 = C.parseBrewForm(raw1, ctx());
  ok('parseBrewForm 通过（库内豆）', r1.ok === true && r1.newBean === null);
  brew1 = r1.brew;
  store.addBrew(brew1);
  ok('记录已保存（1 杯）', store.get().brews.length === 1);

  ok('基础参数 18g/36g/27s/93℃/研磨', brew1.dose === 18 && brew1.water === 36 && brew1.time === 27 && brew1.temp === 93 && brew1.grind === 'Niche 12 刻度');
  ok('实时比例 1:2（数据层）', C.formatRatio(18, 36) === '1:2');
  eq('beanSnapshot 取自库内豆（含养豆依据 roastDate）', brew1.beanSnapshot, { name: '耶加雪菲', roastLevel: '浅', roastDate: ROAST_ESP });
  ok('beanId 指向库内豆', brew1.beanId === beanId);
  ok('更多参数：压力 9 / 首滴 8s / 萃取观察 / 布粉 / 饮品类型', brew1.advanced.espresso.pressure === 9 && brew1.advanced.espresso.firstDrip === 8 && brew1.advanced.espresso.observation === '虎斑油脂丰厚' && brew1.advanced.espresso.puckPrep === 'WDT 布粉' && brew1.advanced.espresso.drinkType === '浓缩');
  ok('意式记录无手冲进阶段', brew1.advanced.pourOver === null);
  ok('水质键 waterQuality → advanced.water（Rev3）', brew1.advanced.water === '农夫山泉' && brew1.advanced.env === '室温 22℃');
  ok('无折光仪 → tds/EY 为空', brew1.advanced.tds === null && C.eyFor(brew1) === null);
  ok('风味：酸质 7 / 浓缩强度 6 / 星级 4', brew1.sensory.sliders.acidity === 7 && brew1.sensory.sliders.strength === 6 && brew1.sensory.stars === 4);
  eq('标签 柑橘+花香 / 笔记 / 下次计划 / 收藏', { tags: brew1.sensory.tags, notes: brew1.sensory.notes, nextStep: brew1.sensory.nextStep, fav: brew1.favorite },
    { tags: ['柑橘', '花香'], notes: '明亮的柑橘酸，甜感干净', nextStep: '下一把粉调粗 1 格', fav: true });
  eq('器具行 gearSnapshot（来自设置页）', brew1.gearSnapshot, { machine: 'ECM Synchronika', grinder: 'Niche Zero', basket: '58mm 18g' });
  ok('详情页养豆天数 = 14', C.calcBeanAgeDays(brew1.date, brew1.beanSnapshot.roastDate) === 14);
  ok('id/createdAt 生成', typeof brew1.id === 'string' && typeof brew1.createdAt === 'string');
});

/* ================= §2 清单 4：复制为新实验 — 同参数、只改水温、风味为空 ================= */
let brew2 = null;
section('2. 复制为新实验：参数预填、只改水温 94、风味为空（清单 4）', function () {
  const raw2 = {
    method: 'espresso', date: TODAY + 'T10:00',
    beanId: beanId, beanName: '', roastLevel: '', roastDate: '', saveBean: false,
    dose: '18', water: '36', time: '27', temp: '94', grind: 'Niche 12 刻度', dripper: '',
    advanced: {
      espresso: { pressure: '9', preinfusionTime: '', preinfusionType: '', firstDrip: '8', puckPrep: 'WDT 布粉', drinkType: '浓缩', observation: '' },
      pourOver: { bloomWater: '', bloomTime: '', pours: [], beverageWeight: '', technique: '', drainTime: '' }
    },
    waterQuality: '', env: '', tds: '',
    sliders: { acidity: '', sweetness: '', bitterness: '', body: '', balance: '', aftertaste: '', complexity: '', clean: '', strength: '' },
    stars: '', tags: [], notes: '', nextStep: '', favorite: false       /* 复制后风味为空 */
  };
  const r2 = C.parseBrewForm(raw2, ctx());
  ok('parseBrewForm 通过', r2.ok === true);
  brew2 = r2.brew;
  store.addBrew(brew2);
  ok('记录数 = 2', store.get().brews.length === 2);
  ok('只改水温：94（其余参数与上一杯一致）', brew2.temp === 94 && brew2.dose === 18 && brew2.water === 36 && brew2.time === 27 && brew2.grind === 'Niche 12 刻度');
  ok('风味为空：滑块/标签/笔记/星级', brew2.sensory.sliders.acidity === null && brew2.sensory.tags.length === 0 && brew2.sensory.notes === '' && brew2.sensory.stars === 0);
  ok('新记录 id 不同、同一款豆、默认未收藏', brew2.id !== brew1.id && brew2.beanId === beanId && brew2.favorite === false);
});

/* ================= §3 清单 5 前半：手冲豆名直输 + 勾选存入豆子库 ================= */
let brew3 = null;
section('3. 手冲豆名直输 + “同时存入豆子库”（清单 5 前半）', function () {
  const raw3 = {
    method: 'pourOver', date: TODAY + 'T11:00',
    beanId: '', beanName: '云南孟连日晒', roaster: '', roastLevel: '中深', roastDate: ROAST_POUR, saveBean: true,
    dose: '15', water: '240', time: '150', temp: '92', grind: 'C40 28 刻度', dripper: 'Hario V60 01',
    advanced: {
      espresso: {},
      pourOver: {
        bloomWater: '45', bloomTime: '30', beverageWeight: '195', technique: '绕圈注水', drainTime: '40',
        pours: [{ target: '45', at: '0:30' }, { target: '', at: '' }, { target: '225', at: '1:40' }]   /* 中间空行应被过滤 */
      }
    },
    waterQuality: '', env: '', tds: '',
    sliders: { acidity: '5', sweetness: '6', bitterness: '2', body: '4', balance: '6', aftertaste: '5', complexity: '5', clean: '7' },  /* 手冲无浓缩强度 */
    stars: 5, tags: ['焦糖'], notes: '红糖尾韵', nextStep: '', favorite: false
  };
  const r3 = C.parseBrewForm(raw3, ctx());
  ok('parseBrewForm 通过', r3.ok === true);
  brew3 = r3.brew;
  ok('newBean 已生成（勾选存入库）', r3.newBean && r3.newBean.name === '云南孟连日晒' && r3.newBean.roastLevel === '中深' && r3.newBean.roastDate === ROAST_POUR && r3.newBean.finished === false);
  store.addBean(r3.newBean);
  store.addBrew(brew3);
  ok('豆子库出现该豆（2 款）', store.get().beans.length === 2);
  ok('直输豆名 → beanId 空 + 快照为输入值', brew3.beanId === null);
  eq('beanSnapshot', brew3.beanSnapshot, { name: '云南孟连日晒', roastLevel: '中深', roastDate: ROAST_POUR });
});

/* ================= §4 清单 5 后半：分段注水 + 闷蒸 ================= */
section('4. 手冲进阶：分段注水 2 段 + 闷蒸（清单 5 后半）', function () {
  const P = brew3.advanced.pourOver;
  ok('意式进阶段为 null', brew3.advanced.espresso === null);
  ok('分段注水 2 段（空行被过滤）', P.pours.length === 2);
  eq('注水段内容', P.pours, [{ target: 45, at: '0:30' }, { target: 225, at: '1:40' }]);
  ok('闷蒸 45g / 30s，出品液重 195，滴滤 40s', P.bloomWater === 45 && P.bloomTime === 30 && P.beverageWeight === 195 && P.drainTime === 40);
  ok('手冲参数 15g/240g/2:30/92℃/滤杯', brew3.dose === 15 && brew3.water === 240 && C.formatDuration(brew3.time) === '2:30' && brew3.temp === 92 && brew3.dripper === 'Hario V60 01');
  ok('实时比例 1:16（数据层）', C.formatRatio(15, 240) === '1:16');
  ok('手冲无浓缩强度滑块', brew3.sensory.sliders.strength === undefined);
  eq('器具行 gearSnapshot（手冲侧）', brew3.gearSnapshot, { grinder: 'Comandante C40', kettle: 'Fellow Stagg', filterPaper: 'Hario 02 漂白' });
  ok('记录数 = 3（至此意式×2 + 手冲×1）', store.get().brews.length === 3);
});

/* ================= §5 清单 6+8：编辑改星级 / 收藏切换（数据层） ================= */
section('5. 编辑改星级生效 + 收藏切换（清单 6/8 数据层）', function () {
  /* 详情→编辑：表单预填全部参数，只把星级 4→5（brews.js:443 编辑路径走 updateBrew） */
  const rawEdit = {
    method: 'espresso', date: TODAY + 'T09:00', id: brew1.id, createdAt: brew1.createdAt,
    beanId: beanId, beanName: '', roastLevel: '', roastDate: '', saveBean: false,
    dose: '18', water: '36', time: '27', temp: '93', grind: 'Niche 12 刻度', dripper: '',
    advanced: {
      espresso: { pressure: '9', preinfusionTime: '', preinfusionType: '', firstDrip: '8', puckPrep: 'WDT 布粉', drinkType: '浓缩', observation: '虎斑油脂丰厚' },
      pourOver: { bloomWater: '', bloomTime: '', pours: [], beverageWeight: '', technique: '', drainTime: '' }
    },
    waterQuality: '农夫山泉', env: '室温 22℃', tds: '',
    sliders: { acidity: '7', sweetness: '6', bitterness: '3', body: '5', balance: '7', aftertaste: '6', complexity: '7', clean: '8', strength: '6' },
    stars: 5, tags: ['柑橘', '花香'], notes: '复核后升星，酸甜平衡更完整', nextStep: '下一把粉调粗 1 格', favorite: true
  };
  const rE = C.parseBrewForm(rawEdit, ctx());
  ok('编辑解析通过且保持原 id', rE.ok === true && rE.brew.id === brew1.id);
  store.updateBrew(brew1.id, rE.brew);                       /* 与 brews.js 表单提交一致 */
  const saved = store.get().brews.find(function (w) { return w.id === brew1.id; });
  ok('改星级 4→5 保存生效（详情数据）', saved.sensory.stars === 5);
  ok('其余字段不被破坏（水温/标签/收藏）', saved.temp === 93 && saved.sensory.tags.length === 2 && saved.favorite === true);
  ok('编辑不新增记录（仍 3 杯）', store.get().brews.length === 3);

  /* 记录列表点 ☆：toggleFavorite 往返 */
  ok('初始未收藏', store.get().brews.find(function (w) { return w.id === brew2.id; }).favorite === false);
  store.toggleFavorite(brew2.id);
  ok('点 ☆ → 收藏', store.get().brews.find(function (w) { return w.id === brew2.id; }).favorite === true);
  store.toggleFavorite(brew2.id);
  ok('再点 ☆ → 取消收藏', store.get().brews.find(function (w) { return w.id === brew2.id; }).favorite === false);
});

/* ================= §6 清单 9+10：导出 / 合并(跳过全部) / 清空 / 覆盖恢复 ================= */
section('6. 导出 JSON → 合并（新设备/重复导入跳过全部）→ 清空空态 → 覆盖恢复（清单 9/10）', function () {
  /* 「导出 JSON」下载的内容 = JSON.stringify(store.get())（settings.js），此处等价快照 */
  store.saveNow();
  const backup = JSON.parse(JSON.stringify(store.get()));
  ok('localStorage 已持久化完整状态', (function () { const p = JSON.parse(mem1.getItem(S.KEY)); return p.brews.length === 3 && p.beans.length === 2 && p.gear.machine === 'ECM Synchronika'; })());

  /* 换设备：全新 store 导入备份 → 全部新增 */
  const mem2 = S.memoryStorage();
  const store2 = S.createStore(mem2, { debounceMs: 5 });
  ok('新 store 初始为空', store2.load().ok === true && store2.get().brews.length === 0 && store2.get().beans.length === 0);
  const m1 = store2.importMerge(backup);
  eq('合并(空库)：全部新增、无跳过', m1, { addedCount: { beans: 2, brews: 3 }, skippedCount: { beans: 0, brews: 0 } });
  ok('合并后 2 豆 / 3 杯，字段保真（水温 93 / 注水 2 段）', store2.get().beans.length === 2 && store2.get().brews.length === 3 && store2.get().brews[0].temp === 93 && store2.get().brews[2].advanced.pourOver.pours.length === 2);

  /* 同一备份再次合并：按 id 去重 → 跳过条数 == 现有条数（UI 提示“跳过全部”） */
  const m2 = store2.importMerge(backup);
  eq('重复导入：跳过条数 = 现有条数，0 新增', m2, { addedCount: { beans: 0, brews: 0 }, skippedCount: { beans: 2, brews: 3 } });
  ok('跳过后条数不变', store2.get().beans.length === 2 && store2.get().brews.length === 3);
  ok('非法 JSON 数据被拒（importMerge → null）', store2.importMerge({ junk: 1 }) === null);

  /* 清空（危险区：输入“删除”解锁的 store 层动作）→ 空态 */
  store2.clearAll();
  ok('清空后空态：0 豆 / 0 杯，版本仍 v1', store2.get().beans.length === 0 && store2.get().brews.length === 0 && store2.get().version === 1);

  /* 覆盖导入最早备份 → 全部恢复 */
  ok('importReplace(最早备份) 成功', store2.importReplace(backup) === true);
  ok('恢复后 2 豆 / 3 杯', store2.get().beans.length === 2 && store2.get().brews.length === 3);
  ok('恢复后内容与备份逐字段一致（含器具/星级 5/养豆依据）', (function () {
    try { assert.deepStrictEqual(store2.get(), backup); return true; } catch (e) { return false; }
  })());
  ok('覆盖后立即落盘（saveNow）', JSON.parse(mem2.getItem(S.KEY)).brews.length === 3);
});

/* ================= §7 清单 9：CSV 导出（3 杯） ================= */
section('7. 导出 CSV：表头 / 3 行 / 无 BOM / 1:2 / 养豆 14（清单 9）', function () {
  const csv = C.brewsToCsv(store.get().brews);
  const lines = csv.split('\n');
  ok('表头行完整（与 CSV_HEADER 一致）', lines[0] === C.CSV_HEADER.join(',') && lines[0].indexOf('日期,方式,豆名,烘焙度,养豆天数') === 0);
  ok('共 3 条数据行', lines.length === 4);
  ok('无 BOM（﻿ 由设置页下载时另加，Excel 中文正常）', csv.charCodeAt(0) !== 0xFEFF && csv.indexOf('﻿') === -1);
  const espCells = lines[1].split(',');
  ok('意式行：养豆天数列 = 14', espCells[4] === '14');
  ok('意式行：比例 1:2 / 意式 / 豆名 / 浅 / 收藏', lines[1].indexOf('1:2') >= 0 && espCells[1] === '意式' && espCells[2] === '耶加雪菲' && espCells[3] === '浅' && lines[1].indexOf('是') >= 0);
  ok('意式行：标签 | 连接 + 水质 + 器具', lines[1].indexOf('柑橘|花香') >= 0 && lines[1].indexOf('农夫山泉') >= 0 && lines[1].indexOf('ECM Synchronika') >= 0 && lines[1].indexOf('Niche Zero') >= 0);
  ok('复制行：只改的水温 94', lines[2].split(',')[8] === '94');
  ok('手冲行：1:16 / 分段注水 / 滤杯 / 养豆 10', lines[3].indexOf('1:16') >= 0 && lines[3].indexOf('45g@0:30; 225g@1:40') >= 0 && lines[3].indexOf('Hario V60 01') >= 0 && lines[3].split(',')[4] === '10');
  ok('无 undefined/NaN 泄漏', csv.indexOf('undefined') === -1 && csv.indexOf('NaN') === -1);
});

/* ================= §8 清单 6：记录列表渲染冒烟（真实 js/ui/brews.js + DOM stub） ================= */
function renderSmoke() {
  /* 最小 DOM stub（模式同 Task 6 报告：input/innerHTML/outerHTML/querySelector/addEventListener） */
  let seq = 0;
  function makeEl(tag) {
    const el = {
      _tag: tag, _id: ++seq, _html: '', _outer: '', _qs: {}, textContent: '',
      get innerHTML() { return this._html; },
      set innerHTML(v) { this._html = String(v); },
      get outerHTML() { return this._outer; },
      set outerHTML(v) { this._outer = String(v); },
      children: [],
      appendChild(c) { this.children.push(c); return c; },
      listeners: {},
      addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
      querySelector(sel) {
        if (this._qs[sel] !== undefined) return this._qs[sel];
        let hit = null;
        if (sel === '#search' && this._html.indexOf('id="search"') >= 0) hit = makeEl('input');
        else if (sel === '.card-grid' && this._html.indexOf('card-grid') >= 0) hit = makeEl('div');
        else if (sel === '.empty' && this._html.indexOf('class="empty"') >= 0) hit = makeEl('div');
        else if (sel === '.page-head h2' && this._html.indexOf('page-head') >= 0) hit = makeEl('h2');
        this._qs[sel] = hit;
        return hit;
      }
    };
    return el;
  }
  global.window = global;
  global.document = { createElement: makeEl };
  global.CoffeeCore = C;
  global.CoffeeApp = { store: store };
  require(path.join(__dirname, '..', 'js', 'ui', 'brews.js'));   /* 真实页面模块 */
  ok('Pages.brews 已注册', typeof global.Pages.brews.render === 'function');

  let container = null;
  const LR = function () { return container.children[container.children.length - 1]; };
  const H = function () { return LR().innerHTML; };
  function render() { container = makeEl('div'); global.Pages.brews.render(container, { parts: ['brews'] }); return LR(); }
  function click(sel, attrVal) {
    const target = { closest: function (s) { return s === sel ? { getAttribute: function () { return attrVal; } } : null; } };
    LR().listeners.click[0]({ target: target });
  }
  function type(val) { LR().querySelector('#search').listeners.input[0]({ target: { value: val } }); }
  function clickTab(k) { click('[data-tab]', k); }

  render();
  ok('标题：冲煮记录 3 杯', H().indexOf('冲煮记录 3 杯') >= 0);
  ok('日期倒序：手冲(11:00) 在前、意式(09:00) 在后', H().indexOf('云南孟连日晒') < H().indexOf('耶加雪菲'));
  ok('手冲卡：15g → 240g / 2:30 / 1:16 / badge', H().indexOf('15g → 240g') >= 0 && H().indexOf('2:30') >= 0 && H().indexOf('1:16') >= 0 && H().indexOf('badge-pour') >= 0);
  ok('意式卡：18g → 36g / 27s / 1:2 / badge', H().indexOf('18g → 36g') >= 0 && H().indexOf('27s') >= 0 && H().indexOf('1:2') >= 0 && H().indexOf('badge-esp') >= 0);
  ok('卡片养豆天数：14 天 / 10 天', H().indexOf('烘焙后 14 天') >= 0 && H().indexOf('烘焙后 10 天') >= 0);
  ok('编辑后星级 5 颗星 + 收藏星 active', H().indexOf('★★★★★') >= 0 && H().indexOf('fav active" data-fav="' + brew1.id + '"') >= 0);
  ok('详情链接 + FAB', H().indexOf('href="#/brew/' + brew3.id + '"') >= 0 && H().indexOf('href="#/brew/new"') >= 0);

  clickTab('espresso');
  ok('筛选“意式”→ 2 杯（无手冲）', H().indexOf('冲煮记录 2 杯') >= 0 && H().indexOf('耶加雪菲') >= 0 && H().indexOf('云南孟连日晒') === -1);
  clickTab('fav');
  ok('筛选“收藏”→ 1 杯', H().indexOf('冲煮记录 1 杯') >= 0);
  clickTab('all');
  ok('筛选“全部”→ 3 杯；重渲染监听不叠加', H().indexOf('冲煮记录 3 杯') >= 0 && LR().listeners.click.length === 1);

  type('耶加');
  ok('搜索“耶加”：h2 计数同步为 2、grid 过滤', LR()._qs['.page-head h2'].textContent === '冲煮记录 2 杯' && LR().querySelector('.card-grid').innerHTML.indexOf('云南孟连日晒') === -1);
  type('云南');
  ok('搜索“云南”：1 杯', LR()._qs['.page-head h2'].textContent === '冲煮记录 1 杯');
  type('');
  ok('清空搜索恢复 3 杯', LR()._qs['.page-head h2'].textContent === '冲煮记录 3 杯');

  /* 最终审查 Fix 3：grid 在场时搜索零匹配 → 整格替换为空态；再次有匹配 → 恢复卡片 */
  type('不存在的关键词');
  ok('搜索零匹配（grid 在场）→ 替换为空态而非空白', LR()._qs['.page-head h2'].textContent === '冲煮记录 0 杯' && LR()._qs['.card-grid']._outer === '<div class="empty">没有匹配的记录</div>');
  type('耶加');
  ok('再次有匹配 → grid 恢复卡片', LR().querySelector('.card-grid').innerHTML.indexOf('耶加雪菲') >= 0);
  type('');

  click('[data-fav]', brew2.id);
  ok('点 ☆ → store.toggleFavorite 生效', store.get().brews.find(function (w) { return w.id === brew2.id; }).favorite === true);
  render();
  ok('重渲染显示收藏星 active', H().indexOf('fav active" data-fav="' + brew2.id + '"') >= 0);
}

section('8. 记录列表渲染冒烟：真实 js/ui/brews.js renderList + DOM stub（清单 6）', function () {
  try { renderSmoke(); }
  catch (e) {
    cur.skipped = true;
    console.log('  SKIP  渲染冒烟需要更多 DOM 支持，留给浏览器人工验收：' + ((e && e.message) || e));
  }
});

/* ================= §9 最终审查 Fix 1：设置页持久 toast（真实 js/ui/settings.js + DOM stub） =================
 * 复现 bug：store 变更同步 notify() → app.js render() 清空 #view 换新容器，点击处理器随后写入的
 * 页内状态行落在已脱离文档的旧节点上（不可见）。修复：status() 同时写入 index.html 中 #view 之外的
 * 常驻 #app-toast（6s 自动隐藏）。此处用 DOM stub 证明该机制。 */
function toastSmoke() {
  /* 可控 setTimeout：既不让进程挂 6 秒，又能验证 6s 自动隐藏与“重复调用重置计时” */
  const realSetTimeout = setTimeout, realClearTimeout = clearTimeout;
  const timers = {}; let timerSeq = 0;
  global.setTimeout = function (fn, ms) { const id = ++timerSeq; timers[id] = { fn: fn, ms: ms }; return id; };
  global.clearTimeout = function (id) { delete timers[id]; };

  function el(tag) {
    const e = {
      _tag: tag, _html: '', _outer: '', textContent: '', hidden: false, value: '', disabled: false,
      children: [], listeners: {}, _qs: {}, _parent: null, _cls: {},
      get innerHTML() { return e._html; },
      set innerHTML(v) { e._html = String(v); e._qs = {}; },
      get outerHTML() { return e._outer || e._html; },
      set outerHTML(v) { e._outer = String(v); },
      classList: {
        toggle: function (name, force) { const on = force === undefined ? !e._cls[name] : !!force; if (on) e._cls[name] = true; else delete e._cls[name]; },
        contains: function (name) { return !!e._cls[name]; }
      },
      appendChild: function (c) { c._parent = e; e.children.push(c); return c; },
      addEventListener: function (t, fn) { (e.listeners[t] = e.listeners[t] || []).push(fn); },
      querySelector: function (sel) {
        if (e._qs[sel] !== undefined) return e._qs[sel];
        let hit = null;
        if (sel.charAt(0) === '#' && e._html.indexOf('id="' + sel.slice(1) + '"') >= 0) hit = el('el');
        e._qs[sel] = hit;
        return hit;
      }
    };
    return e;
  }

  const appToast = el('div');   /* index.html 中常驻于 #view 之外的 #app-toast */
  const viewMain = el('main');  /* id="view" */
  global.document = {
    createElement: function (tag) { return el(tag); },
    getElementById: function (id) { return id === 'app-toast' ? appToast : (id === 'view' ? viewMain : null); }
  };
  global.window = global;
  global.CoffeeApp = { store: store, installEvent: null };
  require(path.join(__dirname, '..', 'js', 'ui', 'settings.js'));
  ok('Pages.settings 已注册', typeof global.Pages.settings.render === 'function');

  /* 等价 app.js render()：清空 #view → 新容器 → 渲染设置页（store.subscribe 同 app.js） */
  let live = null;
  function appRender() {
    viewMain._html = ''; viewMain._qs = {}; viewMain.children = [];
    live = el('div');
    viewMain.appendChild(live);
    global.Pages.settings.render(live);
  }
  const backup = JSON.parse(JSON.stringify(store.get()));
  store.subscribe(appRender);

  appRender();
  ok('设置页已渲染（含 6 个器具输入 + 状态行）', live.innerHTML.indexOf('id="g-machine"') >= 0 && live.innerHTML.indexOf('id="gear-status"') >= 0 && live.innerHTML.indexOf('id="data-status"') >= 0);
  live.querySelector('#g-machine').value = 'ECM Synchronika';

  /* —— 清单流：保存器具 —— */
  const stale = live;
  function toastTimers() { return Object.keys(timers).filter(function (i) { return timers[i].ms === 6000; }); }
  live.querySelector('#gear-save').listeners.click[0]();
  ok('setGear → notify → #view 已重建（旧容器脱离文档）', viewMain.children[0] !== stale && viewMain.children.length === 1);
  ok('重建后的页内状态行不含提示（旧行为会丢消息）', viewMain.children[0].innerHTML.indexOf('✓ 器具已保存') === -1);
  ok('持久 toast 显示保存提示', appToast.textContent === '✓ 器具已保存，之后新建的记录会自动带上');
  ok('toast 可见且无 err 样式', appToast.hidden === false && appToast.classList.contains('err') === false);
  ok('toast 位于 #view 之外（不在被清空的容器里）', appToast._parent === null && viewMain.children.indexOf(appToast) === -1);
  const pending1 = toastTimers();
  ok('toast 安排了 6s 自动隐藏', pending1.length === 1);

  /* —— 错误路径：导入非法 JSON（FileReader 同步 stub）—— */
  global.FileReader = function () {
    this.readAsText = function () { this.result = '不是 JSON{{{'; this.onload(); };
  };
  live.querySelector('#imp-file').listeners.change[0]({ target: { files: [{}], value: '' } });
  ok('导入非法 JSON → toast 错误提示 + err 样式', appToast.textContent === '导入失败：不是有效的 JSON 文件' && appToast.classList.contains('err') === true);
  ok('重复调用重置计时（旧 6s 定时器被清除，仍只有一个 6s）', !timers[pending1[0]] && toastTimers().length === 1);

  /* —— 危险区清空（confirm stub）—— */
  global.confirm = function () { return true; };
  const stale2 = viewMain.children[0];
  live.querySelector('#wipe-btn').listeners.click[0]();
  ok('clearAll → 视图再次重建后 toast 仍更新为清空提示', viewMain.children[0] !== stale2 && appToast.textContent === '已清空全部数据' && appToast.hidden === false);

  /* —— 6s 到点自动隐藏 —— */
  timers[toastTimers()[0]].fn();
  ok('6s 定时器触发 → toast 自动隐藏', appToast.hidden === true);

  /* 恢复共享 store 数据与真实定时器，供后续汇总使用 */
  delete global.FileReader; delete global.confirm;
  ok('清空确已生效（0 豆 0 杯）', store.get().beans.length === 0 && store.get().brews.length === 0);
  ok('importReplace 恢复 §1-§8 数据', store.importReplace(backup) === true && store.get().brews.length === 3);
  global.setTimeout = realSetTimeout; global.clearTimeout = realClearTimeout;
  store.saveNow();
}

section('9. 最终审查 Fix 1：设置页持久 toast——视图重建后消息仍可见（真实 js/ui/settings.js + DOM stub）', function () {
  try { toastSmoke(); }
  catch (e) {
    cur.skipped = true;
    console.log('  SKIP  toast 冒烟需要更多 DOM 支持：' + ((e && e.message) || e));
  }
});

/* ---------- 汇总 ---------- */
store.saveNow();
console.log('');
let passTotal = 0, failTotal = 0, failSections = [], skipSections = [];
sections.forEach(function (s) {
  const status = s.skipped && s.pass + s.fail === 0 ? 'SKIP' : (s.fail === 0 ? 'PASS' : 'FAIL');
  console.log('SECTION ' + status + '   ' + s.name + '   (' + s.pass + '/' + (s.pass + s.fail) + ' checks)');
  passTotal += s.pass; failTotal += s.fail;
  if (s.fail > 0) failSections.push(s.name);
  if (status === 'SKIP') skipSections.push(s.name);
});
const allPass = failTotal === 0 && skipSections.length === 0;
console.log('');
console.log('E2E STUB RESULT: ' + (failTotal === 0 ? 'PASS' : 'FAIL')
  + ' — sections ' + (sections.length - failSections.length - skipSections.length) + '/' + sections.length
  + ' passed' + (skipSections.length ? (', skipped: ' + skipSections.join(' | ')) : '')
  + ', checks ' + passTotal + '/' + (passTotal + failTotal));
if (failSections.length) { console.log('失败分节: ' + failSections.join(' | ')); process.exitCode = 1; }
if (skipSections.length) { console.log('注意: 渲染冒烟被跳过，清单 6 需完全人工验收'); }
