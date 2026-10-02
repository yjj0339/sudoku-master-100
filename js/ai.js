/* AI 大师「玄机」· 解说文案生成
 * 把技巧求解器的每一步翻译成中文讲解。 */
(function (global) {
  'use strict';
  var E = global.SudokuEngine;

  var BOX_NAMES = ['左上宫', '中上宫', '右上宫', '左中宫', '正中宫', '右中宫', '左下宫', '中下宫', '右下宫'];

  function cellName(i) {
    return '第' + (E.cellRow[i] + 1) + '行第' + (E.cellCol[i] + 1) + '列';
  }
  function cellShort(i) {
    return '<b>R' + (E.cellRow[i] + 1) + 'C' + (E.cellCol[i] + 1) + '</b>';
  }
  function unitName(u) {
    if (u < 9) return '<b>第' + (u + 1) + '行</b>';
    if (u < 18) return '<b>第' + (u - 8) + '列</b>';
    return '<b>' + BOX_NAMES[u - 18] + '</b>';
  }
  function boxName(b) { return '<b>' + BOX_NAMES[b] + '</b>'; }
  function cellsShort(arr) {
    return arr.map(cellShort).join(' 和 ');
  }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // 生成一步的解说（HTML）
  function explain(step) {
    var info = step.info || {};
    switch (step.tech) {
      case 'nakedSingle':
        return pick([
          cellShort(info.cell) + ' 所在的行、列和宫已经占满其他 8 个数字，唯一余数只有 <b>' + step.fills[0].digit + '</b>，直接落子。',
          '看 ' + cellShort(info.cell) + '：它的同行、同列、同宫凑齐了其余 8 个数字，这格只能填 <b>' + step.fills[0].digit + '</b>。'
        ]);
      case 'hiddenSingle': {
        var un = info.unit < 9 ? unitName(info.unit) : (info.unit < 18 ? unitName(info.unit) : unitName(info.unit));
        return pick([
          '在 ' + un + ' 里，数字 <b>' + step.fills[0].digit + '</b> 的落脚点只剩 ' + cellShort(info.cell) + ' 一处——其他位置都被排除了。',
          un + ' 中数字 <b>' + step.fills[0].digit + '</b> 只能有一个家，就是 ' + cellShort(info.cell) + '。'
        ]);
      }
      case 'pointing':
        return '聚焦' + boxName(info.box) + '：数字 <b>' + info.digit + '</b> 的候选全部挤在' + (info.line < 9 ? '第' + (info.line + 1) + '行' : '第' + (info.line - 8) + '列') +
          '上，所以这条线在宫外的 ' + '<b>' + info.digit + '</b> 都可以划掉（' + info.elims.length + ' 处）。';
      case 'claiming':
        return (info.unit < 9 ? '第' + (info.unit + 1) + '行' : '第' + (info.unit - 8) + '列') + '里数字 <b>' + info.digit + '</b> 的候选全落在' + boxName(info.box) +
          '内，宫里其他格的 <b>' + info.digit + '</b> 全部排除（' + info.elims.length + ' 处）。';
      case 'nakedPair':
        return cellsShort(info.cells) + ' 构成显性数对 <b>' + info.digits.join('/') + '</b>，这两个数字被它俩包场了——' + unitName(info.unit) + '其余格子的 ' + info.digits.join(' 和 ') + ' 全部划掉。';
      case 'hiddenPair':
        return '在 ' + unitName(info.unit) + '里，数字 <b>' + info.digits.join('</b> 和 <b>') + '</b> 只可能出现在 ' + cellsShort(info.cells) +
          '，锁定隐性数对！这两格的其他候选全部清除。';
      case 'nakedTriple':
        return cellsShort(info.cells) + ' 构成显性三链数 <b>' + info.digits.join('/') + '</b>，' + unitName(info.unit) + '其余格子可以排除这三个数字。';
      case 'hiddenTriple':
        return unitName(info.unit) + '里 <b>' + info.digits.join('</b>/') + '</b> 三个数字锁死在 ' + cellsShort(info.cells) + '，隐性三链数成立，多余候选清除。';
      case 'nakedQuad':
        return cellsShort(info.cells) + ' 占据 <b>' + info.digits.join('/') + '</b> 四个数字（显性四链数），' + unitName(info.unit) + '其余格子的这些候选全部排除。';
      case 'xWing': {
        var a = info.orient === 0 ? '第' + (info.lines[0] + 1) + '行与第' + (info.lines[1] + 1) + '行' : '第' + (info.lines[0] + 1) + '列与第' + (info.lines[1] + 1) + '列';
        var b2 = info.orient === 0 ? '列' : '行';
        var cs = info.cross.map(function (n) { return (info.orient === 0 ? '第' + (n + 1) + '列' : '第' + (n + 1) + '行'); }).join('和');
        return '经典 <b>X-Wing</b>！数字 <b>' + info.digit + '</b> 在' + a + '中的候选都锁定在同两条' + cs + '上，四角构成矩形——矩形' + b2 + '延伸线上的其他 <b>' + info.digit + '</b> 全部排除。';
      }
      case 'swordfish': {
        var dir = info.orient === 0 ? '行' : '列';
        var crossDir = info.orient === 0 ? '列' : '行';
        var ls = info.lines.map(function (n) { return '第' + (n + 1) + dir; }).join('、');
        var cs2 = info.cross.map(function (n) { return '第' + (n + 1) + crossDir; }).join('、');
        return '进阶剑鱼 <b>Swordfish</b>：数字 <b>' + info.digit + '</b> 在' + ls + '的候选都被约束在' + cs2 + '内，三条线夹三线——交叉线上的其余 <b>' + info.digit + '</b> 全部排除。';
      }
      case 'coloring':
        if (info.rule === 2) {
          return '<b>链染法</b>：沿数字 <b>' + info.digit + '</b> 的共轭链染色后，发现两个<span class="hl">同色</span>格互相冲突——该色整条链作废，' +
            info.cells.map(cellShort).join('、') + ' 的 <b>' + info.digit + '</b> 全部删除。';
        }
        return '<b>链染法</b>：' + cellShort(info.cells[0]) + ' 同时看见两条链上<span class="hl">异色</span>的两个 <b>' + info.digit + '</b>——两色必有一真，这格放谁都冲突，删除 <b>' + info.digit + '</b>。';
      case 'xyWing':
        return '<b>XY-Wing</b> 起飞！枢轴 ' + cellShort(info.pivot) + '（<b>' + info.x + '/' + info.y + '</b>），两翼 ' + cellShort(info.wingA) + '（' + info.x + '/' + info.z + '）和 ' +
          cellShort(info.wingB) + '（' + info.y + '/' + info.z + '）。无论枢轴取哪个，两翼必有一个逼出 <b>' + info.z + '</b>——能同时看见两翼的格子都放不下 <b>' + info.z + '</b>。';
      case 'deepReasoning':
        return pick([
          '<span class="hl">到这里，常规技巧已经用尽。</span>需要连续多步假设与验证（涉及 ' + info.count + ' 格联动）才能推进——这是地狱终局的深度。让我来示范。',
          '普通手段全部失效了。接下来只能靠<span class="hl">深层推理</span>：假设某格，推演全局，矛盾即回溯。看我的。'
        ]);
      default:
        return '这一步用到了 ' + step.name + '。';
    }
  }

  // AI 台词库
  var LINES = {
    open: [
      '我看过这盘棋了。有我在，别慌。',
      '嗯，不错的盘面。要指点还是看我把整盘拆完？',
      '这盘的筋骨我已经摸透了。'
    ],
    hellOpen: [
      '这是终局之局——常规技巧会在这里失效，连我也要动用深层推理。准备好了吗？',
      '仅 {given} 个提示。此局之下，人类与 AI 都没有退路。'
    ],
    stuck: [
      '嗯……盘面里有一处矛盾，先把它揪出来（我已标红）。',
      '等一下，这局已经无解了——某处填错了，看我标红的地方。'
    ],
    done: [
      '清盘！这局你打的根基不错，我只是收了个尾。',
      '漂亮，收官。记住这一步的感觉。'
    ],
    noStep: [
      '暂时没有新进展，等你的落子打开局面。',
      '思路暂时断了，先检查一下已有的填数。'
    ]
  };

  function openLine(level) {
    if (level === 100) return LINES.hellOpen[0];
    return pick(LINES.open);
  }

  global.SudokuAI = {
    explain: explain,
    cellName: cellName,
    cellShort: cellShort,
    unitName: unitName,
    boxName: boxName,
    LINES: LINES,
    openLine: openLine
  };
})(typeof window !== 'undefined' ? window : globalThis);
