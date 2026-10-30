(function () {
  'use strict';

  /* ---------- 标签页 ---------- */
  var tabCalc = document.getElementById('tab-calc'), tabGuide = document.getElementById('tab-guide');
  var pageCalc = document.getElementById('page-calc'), pageGuide = document.getElementById('page-guide');
  function showTab(calc) {
    tabCalc.classList.toggle('on', calc);
    tabGuide.classList.toggle('on', !calc);
    pageCalc.hidden = !calc;
    pageGuide.hidden = calc;
  }
  tabCalc.addEventListener('click', function () { showTab(true); });
  tabGuide.addEventListener('click', function () { showTab(false); });

  /* ---------- 冲煮计算器 ---------- */
  var METHODS = [
    { key: 'espresso', label: '☕ 意式浓缩', min: 15, max: 30, def: 20, water: '液重', hint: '常规比例 1:1.5~1:3。偏快偏酸往比例小调（1:1.5），偏苦往比例大调（1:2.5）；研磨永远是第一阀门。' },
    { key: 'pour', label: '🫖 手冲', min: 140, max: 180, def: 150, water: '注水总量', hint: '常规比例 1:14~1:18。想浓收比例（1:15），想淡放比例（1:16~1:17），别只加水量。' },
    { key: 'cold', label: '🧊 冷萃', min: 80, max: 120, def: 100, water: '加水总量', hint: '原液常用 1:8~1:12，喝时兑水/兑奶。冷藏 12~16 小时，超过 24 小时易出杂味。' }
  ];
  var curMethod = 1;   /* 默认手冲 */
  var inDose = document.getElementById('in-dose');
  var inWater = document.getElementById('in-water');
  var ratioSlider = document.getElementById('ratio');

  function renderChips() {
    var box = document.getElementById('method-chips');
    box.innerHTML = '';
    METHODS.forEach(function (m, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (i === curMethod ? ' on' : '');
      b.textContent = m.label;
      b.addEventListener('click', function () {
        curMethod = i;
        renderChips();
        var M = METHODS[curMethod];
        document.getElementById('water-label').textContent = M.water;
        document.getElementById('method-hint').textContent = M.hint;
        ratioSlider.min = M.min; ratioSlider.max = M.max; ratioSlider.value = M.def;
        recalcFromDose();
      });
      box.appendChild(b);
    });
  }

  function fmtRatio(r) {
    var v = Math.round(r * 10) / 10;
    return '1:' + (Math.round(v) === v ? String(v) : v.toFixed(1));
  }
  function feelOf(r) {
    if (r < 12) return '很浓';
    if (r < 15) return '偏浓';
    if (r <= 17) return '均衡';
    if (r <= 20) return '偏淡';
    return '很淡';
  }
  function recalcFromDose() {
    var d = parseFloat(inDose.value);
    var r = parseInt(ratioSlider.value, 10);
    document.getElementById('ratio-label').textContent = '1 : ' + (r / 10);
    document.getElementById('out-ratio').textContent = fmtRatio(r / 10);
    document.getElementById('out-feel').textContent = feelOf(r / 10);
    if (isFinite(d) && d > 0) inWater.value = Math.round(d * r / 10 * 10) / 10;
  }
  function recalcFromWater() {
    var w = parseFloat(inWater.value);
    var r = parseInt(ratioSlider.value, 10);
    document.getElementById('ratio-label').textContent = '1 : ' + (r / 10);
    document.getElementById('out-ratio').textContent = fmtRatio(r / 10);
    document.getElementById('out-feel').textContent = feelOf(r / 10);
    if (isFinite(w) && w > 0) inDose.value = Math.round(w / (r / 10) * 10) / 10;
  }
  inDose.addEventListener('input', recalcFromDose);
  ratioSlider.addEventListener('input', recalcFromDose);
  inWater.addEventListener('input', recalcFromWater);

  /* ---------- 萃取率估算 ---------- */
  var inBev = document.getElementById('in-bev'), inTds = document.getElementById('in-tds');
  function calcEy() {
    var bv = parseFloat(inBev.value), t = parseFloat(inTds.value), d = parseFloat(inDose.value);
    var outEy = document.getElementById('out-ey'), judge = document.getElementById('out-ey-judge');
    if (!(isFinite(bv) && isFinite(t) && isFinite(d)) || bv <= 0 || d <= 0 || t < 0) {
      outEy.textContent = '–'; judge.textContent = '–'; return;
    }
    var ey = Math.round(bv * t / d * 10) / 10;
    outEy.textContent = ey + '%';
    judge.textContent = ey < 16 ? '不足·偏酸' : (ey < 18 ? '略欠' : (ey <= 22 ? '金杯区间' : (ey <= 24 ? '略过' : '过度·偏苦')));
  }
  inBev.addEventListener('input', calcEy);
  inTds.addEventListener('input', calcEy);

  /* ---------- 萃取指导 ---------- */
  var GUIDE = [
    { title: '☕ 意式浓缩', items: [
      { s: '流速过快：25 秒内出满杯，口味尖酸、水感', tips: ['研磨调细 1~2 格（最主要的阀门）', '粉量 +0.5~1g，别超出粉碗规格上限', '检查布粉是否均匀、压粉是否水平，排除通道效应', '养豆不足 7 天或烘焙过浅也会偏快'] },
      { s: '流速过慢：超过 35 秒仍不足量，苦涩、焦味', tips: ['研磨调粗 1~2 格', '粉量 -0.5g 左右', '压粉力度稳定即可，避免过用力或重复压粉', '确认粉量与粉碗规格匹配'] },
      { s: '酸质刺口、余韵短（萃取不足）', tips: ['水温提高 1~2℃', '比例拉长：1:2 → 1:2.5', '研磨微调细；浅烘豆更需要足够水温', '刚烘完的豆子酸感尖锐是正常的，先养豆'] },
      { s: '苦涩发干、烟焦味（萃取过度）', tips: ['水温降低 1~2℃（深烘尤其明显）', '研磨调粗或缩短萃取时间', '粉碗、分水网积粉积油会带来焦苦味，彻底清洁'] },
      { s: '喷溅、乱流、通道效应', tips: ['布粉用 WDT（针式分布器），消除结块与密度差', '压粉保持水平，力度均匀即可', '检查粉锤与粉碗的贴合度', '扣上手柄动作要轻，避免粉饼震裂'] },
      { s: '油脂稀薄、颜色浅', tips: ['看烘焙日期：太新鲜或太陈油脂都差', '换烘焙度深一些的豆子对比', '保证粉量足、布粉均匀', '水质太软（TDS 过低）也会让油脂松散'] }
    ]},
    { title: '🫖 手冲', items: [
      { s: '太苦、发涩（深烘豆常见）', tips: ['研磨调粗', '水温降：深烘 85~88℃，浅烘 92~96℃', '减少搅拌、降低注水高度与水流冲击', '尾段水位低时提前移开滤杯'] },
      { s: '太酸、尖锐（浅烘豆常见）', tips: ['水温提高至 92~96℃', '研磨调细半格到 1 格', '闷蒸延长到 30~45 秒', '增加分段注水，拉长粉水接触时间'] },
      { s: '寡淡、水感', tips: ['比例收紧：1:16 → 1:15 或 1:14', '确认研磨没有过粗（总时间远超 3 分钟且寡淡，多半是太粗）', '注水总量要到位，分段均匀覆盖粉层'] },
      { s: '涩感明显、喉咙发干', tips: ['细粉过多：调整研磨器或过筛', '避免持续搅拌到粉床底部，最后一段注水放轻', '换一张优质滤纸对比'] },
      { s: '滤杯堵塞、滴漏极慢', tips: ['研磨调粗', '注水更轻、沿外圈绕，避免直冲粉床中心', '等水位下降再注下一段'] },
      { s: '每杯味道不稳定', tips: ['固定豆子、水和比例，只动一个变量', '闷蒸 30~45 秒，总时间 2:00~3:00 视研磨而定', '绕圈由中心向外再回中，水流稳定', '把每次参数记录下来对比找规律'] }
    ]},
    { title: '🧊 冷萃', items: [
      { s: '太浓', tips: ['原液兑水或加奶稀释即可', '浸泡缩短：16h → 8~12h', '粉量减少或研磨调粗'] },
      { s: '太淡', tips: ['粉量增加或研磨调细', '延长浸泡至 16~18 小时', '确认全程冷藏，温度波动会降低萃取'] },
      { s: '杂味、发酵味过重', tips: ['容器密封并保持清洁', '喝前用滤纸再过滤一遍更干净', '总时长不要超过 24 小时'] }
    ]},
    { title: '🧰 通用经验', items: [
      { s: '养豆期（排气）', tips: ['意式 7~21 天；手冲浅烘 5~14 天', '刚烘完的豆子二氧化碳多，萃取不稳'] },
      { s: '水质', tips: ['TDS 75~150mg/L 较合适：太纯寡淡，太硬发涩', '固定一种水，便于复现'] },
      { s: '清洁', tips: ['粉碗、分水网、手柄定期除油', '滤杯、分享壶、冷萃罐无残留异味'] }
    ]}
  ];
  var list = document.getElementById('guide-list');
  list.innerHTML = GUIDE.map(function (g) {
    return '<div class="g-sec"><h4>' + g.title + '</h4>' + g.items.map(function (it) {
      return '<details class="g-item"><summary>' + it.s + '</summary><ul>'
        + it.tips.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul></details>';
    }).join('') + '</div>';
  }).join('');

  /* ---------- 初始化 ---------- */
  renderChips();
  document.getElementById('method-hint').textContent = METHODS[curMethod].hint;
  recalcFromDose();
})();