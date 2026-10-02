/* 数独大师 100 关 · 核心引擎
 * 同时用于 Node（离线生成关卡）与浏览器（提示 / AI 大师解说）。
 * 技巧求解器按人类解题技巧由弱到强逐步推进，每一步都可解释。
 */
(function (global) {
  'use strict';

  var N = 81;
  var ALL = 0x1FF; // 9 位候选掩码

  // ---------- 拓扑预计算 ----------
  var cellRow = new Uint8Array(N), cellCol = new Uint8Array(N), cellBox = new Uint8Array(N);
  var units = [];        // 27 个单元（9行+9列+9宫），每个是 9 格索引数组
  var unitsOf = [];      // 每格所属的 3 个单元号
  var peers = [];        // 每格 20 个同伴

  (function buildTopology() {
    for (var r = 0; r < 9; r++) for (var c = 0; c < 9; c++) {
      var i = r * 9 + c;
      cellRow[i] = r; cellCol[i] = c; cellBox[i] = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    }
    for (var u = 0; u < 27; u++) {
      var cells = [];
      for (var i2 = 0; i2 < 81; i2++) {
        var t = Math.floor(u / 9); // 0行 1列 2宫
        if (t === 0 && cellRow[i2] === u % 9) cells.push(i2);
        if (t === 1 && cellCol[i2] === u % 9) cells.push(i2);
        if (t === 2 && cellBox[i2] === u % 9) cells.push(i2);
      }
      units.push(cells);
    }
    for (var i3 = 0; i3 < 81; i3++) {
      var rowU = cellRow[i3], colU = 9 + cellCol[i3], boxU = 18 + cellBox[i3];
      unitsOf.push([rowU, colU, boxU]);
      var set = {};
      [rowU, colU, boxU].forEach(function (un) {
        units[un].forEach(function (j) { if (j !== i3) set[j] = 1; });
      });
      peers.push(Object.keys(set).map(Number));
    }
  })();

  // ---------- 位工具 ----------
  function popcount(x) { var n = 0; while (x) { x &= x - 1; n++; } return n; }
  function bitsOf(mask) { var out = []; for (var d = 1; d <= 9; d++) if (mask & (1 << (d - 1))) out.push(d); return out; }
  function bit(d) { return 1 << (d - 1); }

  // ---------- 基础操作 ----------
  function parsePuzzle(str) {
    var g = new Uint8Array(81);
    for (var i = 0; i < 81; i++) {
      var ch = str[i];
      g[i] = (ch >= '1' && ch <= '9') ? (ch.charCodeAt(0) - 48) : 0;
    }
    return g;
  }
  function gridToString(g) { var s = ''; for (var i = 0; i < 81; i++) s += g[i] ? String(g[i]) : '.'; return s; }
  function cloneGrid(g) { return new Uint8Array(g); }

  function computeCandidates(grid) {
    var c = new Uint16Array(81);
    for (var i = 0; i < 81; i++) c[i] = grid[i] ? 0 : ALL;
    for (var i2 = 0; i2 < 81; i2++) {
      if (!grid[i2]) continue;
      peers[i2].forEach(function (j) {
        c[j] &= ~bit(grid[i2]);
      });
    }
    return c;
  }

  function isSolved(grid) {
    for (var i = 0; i < 81; i++) if (!grid[i]) return false;
    return true;
  }

  function hasConflict(grid) {
    for (var u = 0; u < 27; u++) {
      var seen = {};
      for (var k = 0; k < 9; k++) {
        var v = grid[units[u][k]];
        if (!v) continue;
        if (seen[v]) return true;
        seen[v] = 1;
      }
    }
    return false;
  }

  // ---------- 回溯求解（MRV，掩码版） ----------
  // 返回解数组；uniqueCount 模式下只数解的个数（上限 limit）。
  function makeSearcher(grid) {
    var cands = computeCandidates(grid);
    var g = cloneGrid(grid);
    var solution = null, count = 0;

    function assign(i, d) {
      g[i] = d; cands[i] = 0;
      for (var k = 0; k < 20; k++) {
        var j = peers[i][k];
        cands[j] &= ~bit(d);
        if (!g[j] && cands[j] === 0) return false; // 死格
      }
      return true;
    }

    function search(limit) {
      // 找候选最少的空格
      var best = -1, bestN = 10;
      for (var i = 0; i < 81; i++) {
        if (g[i]) continue;
        var n = popcount(cands[i]);
        if (n === 0) return;
        if (n < bestN) { bestN = n; best = i; if (n === 1) break; }
      }
      if (best === -1) { count++; if (!solution) solution = cloneGrid(g); return; }
      var digits = bitsOf(cands[best]);
      for (var k = 0; k < digits.length; k++) {
        var snapshotG = cloneGrid(g), snapshotC = new Uint16Array(cands);
        if (assign(best, digits[k])) {
          search(limit);
          if (count >= limit) { /* 提前结束由外层判断 */ }
        }
        g = snapshotG; cands = snapshotC;
        if (count >= limit) return;
      }
    }

    return {
      run: function (limit) { search(limit || 2); },
      get count() { return count; },
      get solution() { return solution; }
    };
  }

  function countSolutions(grid, limit) { var s = makeSearcher(grid); s.run(limit || 2); return s.count; }
  function solveGrid(grid) { var s = makeSearcher(grid); s.run(1); return s.solution; }

  // ---------- 技巧求解器 ----------
  var TECHS = {
    nakedSingle:   { score: 1,  name: '唯一余数法' },
    hiddenSingle:  { score: 2,  name: '隐性唯一法' },
    pointing:      { score: 4,  name: '区块摒除·指向' },
    claiming:      { score: 4,  name: '区块摒除·占位' },
    nakedPair:     { score: 6,  name: '显性数对' },
    hiddenPair:    { score: 6,  name: '隐性数对' },
    nakedTriple:   { score: 8,  name: '显性三链数' },
    hiddenTriple:  { score: 8,  name: '隐性三链数' },
    nakedQuad:     { score: 8,  name: '显性四链数' },
    xWing:         { score: 9,  name: 'X-Wing（交叉飞翼）' },
    swordfish:     { score: 10, name: 'Swordfish（剑鱼）' },
    coloring:      { score: 11, name: '链染法' },
    xyWing:        { score: 12, name: 'XY-Wing（双翼飞碟）' },
    deepReasoning: { score: 15, name: '深层推理（多步假设）' }
  };

  // 每个技巧探测函数：返回 step 或 null
  // step = { tech, fills:[{cell,digit}], elims:[{cell,digit}], info:{...} }

  function findNakedSingle(cands) {
    for (var i = 0; i < 81; i++) {
      if (popcount(cands[i]) === 1) {
        return { tech: 'nakedSingle', fills: [{ cell: i, digit: bitsOf(cands[i])[0] }], elims: [], info: { cell: i } };
      }
    }
    return null;
  }

  function findHiddenSingle(cands) {
    for (var u = 0; u < 27; u++) {
      for (var d = 1; d <= 9; d++) {
        var spots = [];
        for (var k = 0; k < 9; k++) {
          var i = units[u][k];
          if (cands[i] & bit(d)) spots.push(i);
        }
        if (spots.length === 1) {
          return { tech: 'hiddenSingle', fills: [{ cell: spots[0], digit: d }], elims: [], info: { unit: u, cell: spots[0] } };
        }
      }
    }
    return null;
  }

  // claiming：行/列内 d 候选都落在同一宫
  function findClaiming(cands) {
    for (var u = 0; u < 18; u++) {
      for (var d = 1; d <= 9; d++) {
        var spots = [];
        for (var k = 0; k < 9; k++) { var i = units[u][k]; if (cands[i] & bit(d)) spots.push(i); }
        if (spots.length < 2) continue;
        var sameBox = spots.every(function (i) { return cellBox[i] === cellBox[spots[0]]; });
        if (!sameBox) continue;
        var b = cellBox[spots[0]];
        var elims = [];
        for (var k2 = 0; k2 < 9; k2++) {
          var j = units[18 + b][k2];
          if (unitsOf[j].indexOf(u) >= 0) continue;
          if (cands[j] & bit(d)) elims.push({ cell: j, digit: d });
        }
        if (elims.length) return { tech: 'claiming', fills: [], elims: elims, info: { unit: u, box: b, digit: d, spots: spots } };
      }
    }
    return null;
  }

  // 显性子集（naked subset）：unit 内 k 格候选并集恰 k 个数字
  function findNakedSubset(cands, k, techName, score) {
    function comb(arr, m, cb) {
      var buf = [];
      function go(start) {
        if (buf.length === m) { if (cb(buf) === true) return true; return false; }
        for (var i = start; i < arr.length; i++) { buf.push(arr[i]); if (go(i + 1)) return true; buf.pop(); }
        return false;
      }
      go(0);
    }
    for (var u = 0; u < 27; u++) {
      var free = [];
      for (var kk = 0; kk < 9; kk++) { var i = units[u][kk]; if (popcount(cands[i]) >= 2) free.push(i); }
      if (free.length <= k) continue;
      var hit = null;
      comb(free, k, function (cells) {
        var mask = 0;
        cells.forEach(function (i) { mask |= cands[i]; });
        if (popcount(mask) !== k) return false;
        var elims = [];
        var freeSet = {};
        cells.forEach(function (i) { freeSet[i] = 1; });
        for (var k2 = 0; k2 < 9; k2++) {
          var j = units[u][k2];
          if (freeSet[j]) continue;
          var m2 = cands[j] & mask;
          if (m2) { for (var d = 1; d <= 9; d++) if (m2 & bit(d)) elims.push({ cell: j, digit: d }); }
        }
        if (elims.length) { hit = { tech: techName, fills: [], elims: elims, info: { unit: u, cells: cells, digits: bitsOf(mask) } }; return true; }
        return false;
      });
      if (hit) return hit;
    }
    return null;
  }

  // 隐性子集（hidden subset）：unit 内 k 个数字的候选位置并集恰 k 格
  function findHiddenSubset(cands, k, techName, score) {
    function comb(arr, m, cb) {
      var buf = [];
      function go(start) {
        if (buf.length === m) { if (cb(buf) === true) return true; return false; }
        for (var i = start; i < arr.length; i++) { buf.push(arr[i]); if (go(i + 1)) return true; buf.pop(); }
        return false;
      }
      go(0);
    }
    for (var u = 0; u < 27; u++) {
      var present = [];
      for (var d = 1; d <= 9; d++) {
        var n = 0;
        for (var kk = 0; kk < 9; kk++) if (cands[units[u][kk]] & bit(d)) n++;
        if (n >= 2 && n <= k) present.push(d);
      }
      if (present.length < k) continue;
      var hit = null;
      comb(present, k, function (digits) {
        var cellMask = {};
        var cellList = [];
        digits.forEach(function (d) {
          for (var kk = 0; kk < 9; kk++) { var i = units[u][kk]; if (cands[i] & bit(d)) { if (!cellMask[i]) { cellMask[i] = 1; cellList.push(i); } } }
        });
        if (cellList.length !== k) return false;
        var mask = 0;
        digits.forEach(function (d) { mask |= bit(d); });
        var elims = [];
        cellList.forEach(function (i) {
          var m2 = cands[i] & ~mask;
          if (m2) { for (var d2 = 1; d2 <= 9; d2++) if (m2 & bit(d2)) elims.push({ cell: i, digit: d2 }); }
        });
        if (elims.length) { hit = { tech: techName, fills: [], elims: elims, info: { unit: u, cells: cellList, digits: digits } }; return true; }
        return false;
      });
      if (hit) return hit;
    }
    return null;
  }

  // fish：rows/cols 基础数字集合，size=2 即 X-Wing，size=3 即 Swordfish
  function findFish(cands, size, techName, score) {
    for (var d = 1; d <= 9; d++) {
      for (var orient = 0; orient < 2; orient++) { // 0: 行基 → 删列；1: 列基 → 删行
        var lineCands = []; // 每条基线的候选交叉位置掩码
        for (var li = 0; li < 9; li++) {
          var mask = 0;
          for (var k = 0; k < 9; k++) {
            var i = orient === 0 ? li * 9 + k : k * 9 + li;
            if (cands[i] & bit(d)) mask |= 1 << k;
          }
          var n = popcount(mask);
          lineCands.push(n >= 2 && n <= size ? mask : 0);
        }
        // 枚举 size 条线组合
        var idx = [0, 1, 2, 3, 4, 5, 6, 7, 8];
        function comb(start, buf) {
          if (buf.length === size) {
            var union = 0, ok = true;
            buf.forEach(function (li) { union |= lineCands[li]; });
            if (popcount(union) !== size) return;
            var elims = [];
            for (var c2 = 0; c2 < 9; c2++) {
              if (!(union & (1 << c2))) continue;
              for (var r2 = 0; r2 < 9; r2++) {
                if (buf.indexOf(r2) >= 0) continue;
                var i2 = orient === 0 ? r2 * 9 + c2 : c2 * 9 + r2;
                if (cands[i2] & bit(d)) elims.push({ cell: i2, digit: d });
              }
            }
            if (elims.length) {
              return { tech: techName, fills: [], elims: elims, info: { digit: d, lines: buf.slice(), cross: bitsOf(union), orient: orient } };
            }
            return;
          }
          for (var i3 = start; i3 < idx.length; i3++) {
            if (!lineCands[i3]) continue;
            buf.push(i3);
            var r = comb(i3 + 1, buf);
            if (r) return r;
            buf.pop();
          }
          return null;
        }
        var res = comb(0, []);
        if (res) return res;
      }
    }
    return null;
  }

  // 链染法（单色链 simple coloring）
  function findColoring(cands) {
    for (var d = 1; d <= 9; d++) {
      // 构建共轭边
      var adj = {}; // cell -> [cell]
      for (var u = 0; u < 27; u++) {
        var spots = [];
        for (var k = 0; k < 9; k++) { var i = units[u][k]; if (cands[i] & bit(d)) spots.push(i); }
        if (spots.length === 2) {
          (adj[spots[0]] = adj[spots[0]] || []).push(spots[1]);
          (adj[spots[1]] = adj[spots[1]] || []).push(spots[0]);
        }
      }
      // 连通分量双色（链染只对同一分量内的颜色关系有效）
      var color = {}; // cell -> 0/1
      var compOf = {};
      var compId = 0;
      var comps = [];
      var compValid = [];
      for (var key in adj) {
        var start = +key;
        if (color[start] !== undefined) continue;
        var queue = [start]; color[start] = 0; compOf[start] = compId;
        var members = [start];
        var valid = true;
        while (queue.length) {
          var x = queue.shift();
          (adj[x] || []).forEach(function (y) {
            if (color[y] === undefined) { color[y] = 1 - color[x]; compOf[y] = compId; queue.push(y); members.push(y); }
            else if (color[y] === color[x]) valid = false; // 奇圈，色链失效
          });
        }
        comps.push(members);
        compValid.push(valid);
        compId++;
      }
      // Rule 2：同色互见 → 该色全删
      for (var ci = 0; ci < comps.length; ci++) {
        if (!compValid[ci]) continue;
        var bad = -1;
        outer:
        for (var a = 0; a < comps[ci].length; a++) for (var b2 = a + 1; b2 < comps[ci].length; b2++) {
          var x1 = comps[ci][a], x2 = comps[ci][b2];
          if (color[x1] !== color[x2]) continue;
          if (cellRow[x1] === cellRow[x2] || cellCol[x1] === cellCol[x2] || cellBox[x1] === cellBox[x2]) { bad = color[x1]; break outer; }
        }
        if (bad >= 0) {
          var elims = [];
          comps[ci].forEach(function (i) {
            if (color[i] === bad && (cands[i] & bit(d))) elims.push({ cell: i, digit: d });
          });
          if (elims.length) return { tech: 'coloring', fills: [], elims: elims, info: { digit: d, rule: 2, cells: elims.map(function (e) { return e.cell; }) } };
        }
      }
      // Rule 1：格 X（非链上）可见两色 → 删 X 的 d
      var inChain = {};
      Object.keys(adj).forEach(function (k2) { inChain[k2] = 1; });
      for (var i4 = 0; i4 < 81; i4++) {
        if (inChain[i4] || !(cands[i4] & bit(d))) continue;
        var seenA = null, seenB = null;
        for (var p = 0; p < 20; p++) {
          var j = peers[i4][p];
          if (color[j] === undefined || !(cands[j] & bit(d))) continue;
          if (color[j] === 0) { if (seenA === null) seenA = j; }
          else { if (seenB === null) seenB = j; }
        }
        if (seenA !== null && seenB !== null && compOf[seenA] === compOf[seenB] && compValid[compOf[seenA]]) {
          return { tech: 'coloring', fills: [], elims: [{ cell: i4, digit: d }], info: { digit: d, rule: 1, cells: [i4], witnessA: seenA, witnessB: seenB } };
        }
      }
    }
    return null;
  }

  // XY-Wing
  function findXYWing(cands) {
    var pivots = [];
    for (var i = 0; i < 81; i++) if (popcount(cands[i]) === 2) pivots.push(i);
    for (var a = 0; a < pivots.length; a++) {
      var p = pivots[a];
      var dp = bitsOf(cands[p]);
      for (var b = 0; b < peers[p].length; b++) {
        var q = peers[p][b];
        if (popcount(cands[q]) !== 2) continue;
        if (!(cands[q] & bit(dp[0])) || (cands[q] & bit(dp[1]))) continue;
        var x = dp[0], y = dp[1], zBits = cands[q] & ~bit(x);
        var z = bitsOf(zBits)[0];
        for (var c = 0; c < peers[p].length; c++) {
          var r = peers[p][c];
          if (r === q || popcount(cands[r]) !== 2) continue;
          if (!(cands[r] & bit(y)) || !(cands[r] & bit(z))) continue;
          if (cands[r] !== (bit(y) | bit(z))) continue;
          // 找 peers(q) ∩ peers(r) 中候选含 z 的格
          var setQ = {}; peers[q].forEach(function (j) { setQ[j] = 1; });
          var elims = [];
          peers[r].forEach(function (j) {
            if (j === p || j === q || j === r) return;
            if (setQ[j] && (cands[j] & bit(z)) && popcount(cands[j]) >= 2) elims.push({ cell: j, digit: z });
          });
          if (elims.length) {
            return { tech: 'xyWing', fills: [], elims: elims, info: { pivot: p, wingA: q, wingB: r, x: x, y: y, z: z } };
          }
        }
      }
    }
    return null;
  }

  function applyStep(grid, cands, step) {
    (step.fills || []).forEach(function (f) {
      grid[f.cell] = f.digit;
      cands[f.cell] = 0;
      peers[f.cell].forEach(function (j) { cands[j] &= ~bit(f.digit); });
    });
    (step.elims || []).forEach(function (e) {
      cands[e.cell] &= ~bit(e.digit);
    });
  }

  // 主求解：返回 steps（每步含 score/name），stuck 时可选回溯补完并记 deepReasoning
  function solveByTechniques(puzzle, opts) {
    opts = opts || {};
    var grid = cloneGrid(puzzle);
    var cands = computeCandidates(grid);
    var steps = [];
    var detectors = [
      function () { return findNakedSingle(cands); },
      function () { return findHiddenSingle(cands); },
      function () { return findLockedPointing(cands); },
      function () { return findClaiming(cands); },
      function () { return findNakedSubset(cands, 2, 'nakedPair', 6); },
      function () { return findHiddenSubset(cands, 2, 'hiddenPair', 6); },
      function () { return findNakedSubset(cands, 3, 'nakedTriple', 8); },
      function () { return findHiddenSubset(cands, 3, 'hiddenTriple', 8); },
      function () { return findNakedSubset(cands, 4, 'nakedQuad', 8); },
      function () { return findFish(cands, 2, 'xWing', 9); },
      function () { return findFish(cands, 3, 'swordfish', 10); },
      function () { return findColoring(cands); },
      function () { return findXYWing(cands); }
    ];
    var usedGuess = false;
    var guard = 0;
    while (!isSolved(grid)) {
      if (++guard > 500) break;
      var step = null;
      for (var di = 0; di < detectors.length; di++) {
        step = detectors[di]();
        if (step) break;
      }
      if (!step) {
        // 卡住：深层推理（回溯补完）
        usedGuess = true;
        var sol = solveGrid(grid);
        if (!sol) break; // 无解（不应发生）
        // 记录从当前状态到解的填数
        var fills = [];
        for (var i = 0; i < 81; i++) if (!grid[i] && sol[i]) fills.push({ cell: i, digit: sol[i] });
        steps.push({ tech: 'deepReasoning', score: TECHS.deepReasoning.score, name: TECHS.deepReasoning.name, fills: fills, elims: [], info: { count: fills.length } });
        for (var i2 = 0; i2 < 81; i2++) grid[i2] = sol[i2];
        break;
      }
      applyStep(grid, cands, step);
      steps.push({
        tech: step.tech,
        score: TECHS[step.tech].score,
        name: TECHS[step.tech].name,
        fills: step.fills,
        elims: step.elims,
        info: step.info
      });
    }
    var maxScore = 0, sumScore = 0;
    steps.forEach(function (s) { maxScore = Math.max(maxScore, s.score); sumScore += s.score; });
    return {
      solved: isSolved(grid) && !hasConflict(grid),
      grid: grid,
      steps: steps,
      usedGuess: usedGuess,
      maxScore: maxScore,
      sumScore: sumScore
    };
  }

  // findLocked 拆分：pointing 独立实现（原函数只处理宫→线）
  function findLockedPointing(cands) {
    for (var b = 0; b < 9; b++) {
      var boxU = 18 + b;
      for (var d = 1; d <= 9; d++) {
        var spots = [];
        for (var k = 0; k < 9; k++) { var i = units[boxU][k]; if (cands[i] & bit(d)) spots.push(i); }
        if (spots.length < 2) continue;
        var sameRow = spots.every(function (i) { return cellRow[i] === cellRow[spots[0]]; });
        var sameCol = spots.every(function (i) { return cellCol[i] === cellCol[spots[0]]; });
        var lineU = sameRow ? cellRow[spots[0]] : (sameCol ? 9 + cellCol[spots[0]] : -1);
        if (lineU < 0) continue;
        var elims = [];
        for (var k2 = 0; k2 < 9; k2++) {
          var j = units[lineU][k2];
          if (cellBox[j] === b) continue;
          if (cands[j] & bit(d)) elims.push({ cell: j, digit: d });
        }
        if (elims.length) return { tech: 'pointing', fills: [], elims: elims, info: { box: b, line: lineU, digit: d, spots: spots } };
      }
    }
    return null;
  }

  // ---------- 生成器 ----------
  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t = (t + 0x6D2B79F5) >>> 0;
      var x = Math.imul(t ^ (t >>> 15), 1 | t);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function generateFull(rng) {
    var g = new Uint8Array(81);
    function fill(pos) {
      if (pos === 81) return true;
      var digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
      for (var k = 0; k < 9; k++) {
        var d = digits[k], ok = true;
        for (var p = 0; p < 20; p++) { if (g[peers[pos][p]] === d) { ok = false; break; } }
        if (ok) {
          g[pos] = d;
          if (fill(pos + 1)) return true;
          g[pos] = 0;
        }
      }
      return false;
    }
    fill(0);
    return g;
  }

  // 挖洞至 targetClues（保持唯一解），返回谜题
  function digHoles(full, rng, targetClues) {
    var p = cloneGrid(full);
    var order = shuffle(Array.apply(null, Array(81)).map(function (_, i) { return i; }), rng);
    var clues = 81;
    for (var k = 0; k < 81 && clues > targetClues; k++) {
      var i = order[k];
      var keep = p[i];
      p[i] = 0;
      if (countSolutions(p, 2) > 1) { p[i] = keep; }
      else clues--;
    }
    return p;
  }

  // 多轮随机顺序挖洞取最空（同一盘面不同挖序结局不同，多轮显著更空更难）
  function digHolesDeep(full, rng, targetClues, rounds) {
    var best = null, bestHoles = -1;
    rounds = rounds || 4;
    for (var r = 0; r < rounds; r++) {
      var p = digHoles(full, rng, targetClues);
      var holes = 0;
      for (var i = 0; i < 81; i++) if (!p[i]) holes++;
      if (holes > bestHoles) { bestHoles = holes; best = p; }
    }
    return best;
  }

  // 盘面等价变换（数字置换 + 行列带内置换 + 转置），不改变难度
  function transform(p, rng) {
    var map = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
    var perm = new Uint8Array(10);
    for (var d = 1; d <= 9; d++) perm[d] = map[d - 1];
    var rowOrder = [];
    [0, 1, 2].forEach(function (b) { rowOrder.push.apply(rowOrder, shuffle([b * 3, b * 3 + 1, b * 3 + 2], rng)); });
    var colOrder = [];
    [0, 1, 2].forEach(function (b) { colOrder.push.apply(colOrder, shuffle([b * 3, b * 3 + 1, b * 3 + 2], rng)); });
    var out = new Uint8Array(81);
    for (var r = 0; r < 9; r++) for (var c = 0; c < 9; c++) {
      var v = p[rowOrder[r] * 9 + colOrder[c]];
      out[r * 9 + c] = v ? perm[v] : 0;
    }
    return out;
  }

  var API = {
    N: N, units: units, unitsOf: unitsOf, peers: peers,
    cellRow: cellRow, cellCol: cellCol, cellBox: cellBox,
    popcount: popcount, bitsOf: bitsOf, bit: bit,
    parsePuzzle: parsePuzzle, gridToString: gridToString, cloneGrid: cloneGrid,
    computeCandidates: computeCandidates, isSolved: isSolved, hasConflict: hasConflict,
    countSolutions: countSolutions, solveGrid: solveGrid,
    TECHS: TECHS,
    solveByTechniques: solveByTechniques,
    applyStep: applyStep,
    mulberry32: mulberry32, shuffle: shuffle,
    generateFull: generateFull, digHoles: digHoles, digHolesDeep: digHolesDeep, transform: transform
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (global) global.SudokuEngine = API;
})(typeof window !== 'undefined' ? window : globalThis);
