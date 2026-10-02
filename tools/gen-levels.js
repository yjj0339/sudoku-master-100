// 离线生成 100 关：种子确定性、技巧评分筛选、难度递进、终关地狱级
// 提示数语义：given = 81 - 洞数（真正给玩家的数字个数）
const E = require('../js/engine.js');
const fs = require('fs');
const path = require('path');

// ---------- 关卡难度规格 ----------
// clues: [min, max] 目标提示数区间；maxTech: 允许的最高技巧分；cands: 命中候选收集数
function levelSpec(lv) {
  if (lv <= 5)   return { name: '入门', clues: [50, 55], maxTech: 1,  cands: 8,   pick: 'easiest', deep: 1 };
  if (lv <= 10)  return { name: '入门', clues: [46, 50], maxTech: 2,  cands: 8,   pick: 'easiest', deep: 1 };
  if (lv <= 25)  return { name: '新手', clues: [40, 46], maxTech: 2,  cands: 10,  pick: 'easiest', deep: 2 };
  if (lv <= 45)  return { name: '进阶', clues: [34, 40], maxTech: 4,  cands: 30,  pick: 'hardest', deep: 3 };
  if (lv <= 65)  return { name: '高手', clues: [30, 35], maxTech: 6,  cands: 50,  pick: 'hardest', deep: 4 };
  if (lv <= 85)  return { name: '大师', clues: [27, 31], maxTech: 9,  cands: 80,  pick: 'hardest', deep: 4 };
  if (lv <= 99)  return { name: '宗师', clues: [24, 28], maxTech: 13, cands: 100, pick: 'hardest', deep: 5 };
  return { name: '地狱', special: true };
}

// 生成一个候选谜题（含评级）
function makeCandidate(seed, targetGiven, deepRounds) {
  const rng = E.mulberry32(seed);
  const full = E.generateFull(rng);
  const p = E.digHolesDeep(full, rng, targetGiven, deepRounds);
  let holes = 0;
  for (let i = 0; i < 81; i++) if (!p[i]) holes++;
  const given = 81 - holes;
  const r = E.solveByTechniques(p);
  return { p, full, given, maxScore: r.maxScore, sumScore: r.sumScore, usedGuess: r.usedGuess };
}

// given 是否落在区间（允许略超上限）
function inRange(given, spec) { return given >= spec.clues[0] && given <= spec.clues[1] + 3; }

function betterPick(a, b, pick) {
  if (!a) return b;
  if (!b) return a;
  if (pick === 'easiest') {
    // 先比 maxScore（低者易），再比 given（多者易）
    if (a.maxScore !== b.maxScore) return a.maxScore < b.maxScore ? a : b;
    return a.given > b.given ? a : b;
  }
  // hardest：先 maxScore 高，再 sum 高（技巧链长=演示精彩），再 given 少
  if (a.maxScore !== b.maxScore) return a.maxScore > b.maxScore ? a : b;
  if (a.sumScore !== b.sumScore) return a.sumScore > b.sumScore ? a : b;
  return a.given < b.given ? a : b;
}

// ---------- 生成 1..99 ----------
const levels = [];
let seedBase = 20261002;
let relaxed = [];

for (let lv = 1; lv <= 99; lv++) {
  const spec = levelSpec(lv);
  const t0 = Date.now();
  let best = null, tries = 0, hits = 0, maxTechTolerated = spec.maxTech;
  const need = spec.cands;
  while (hits < need && tries < need * 8) {
    tries++;
    const c = makeCandidate(seedBase + lv * 1000 + tries, spec.clues[0], spec.deep);
    if (inRange(c.given, spec) && c.maxScore <= maxTechTolerated) {
      hits++;
      best = betterPick(best, c, spec.pick);
    }
    if (tries % 12 === 0 && Date.now() - t0 > 8000 && !best) { maxTechTolerated += 2; }
  }
  if (!best) { // 极端兜底：放宽提示数与技巧双限制
    for (let i = 0; i < 20 && !best; i++) {
      best = makeCandidate(seedBase + lv * 1000 + 9000 + i, spec.clues[0] + 6, spec.deep);
    }
    relaxed.push(lv);
  }
  levels.push(best);
  if (lv % 10 === 0 || lv <= 3) console.log(`L${lv} [${spec.name}] given=${best.given} max=${best.maxScore} sum=${best.sumScore} guess=${best.usedGuess} (${Date.now() - t0}ms, tries=${tries})`);
}

// ---------- 第 100 关：地狱终局 ----------
console.log('生成第 100 关（地狱终局）……');
const t100 = Date.now();
let hell = null;
const HELL_TRIES = 1500;
for (let i = 0; i < HELL_TRIES; i++) {
  const c = makeCandidate(seedBase + 100000 + i * 7, 23, 6); // 尽量挖空
  hell = betterPick(hell, c, 'hardest');
  if ((i & 255) === 0) console.log(`  候选 ${i}: 当前最优 given=${hell.given} max=${hell.maxScore} sum=${hell.sumScore}`);
}
// 与世界公认最难盘（Arto Inkala 2012）等价变换后同台竞争
const inkala = E.transform(E.parsePuzzle('8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4..'), E.mulberry32(999));
const inkalaSol = E.solveGrid(inkala);
const inkalaRate = E.solveByTechniques(inkala);
console.log(`Inkala 盘: given=${inkala.reduce((a, v) => a + (v ? 0 : 1), 0)} max=${inkalaRate.maxScore} sum=${inkalaRate.sumScore} guess=${inkalaRate.usedGuess}`);
if (inkalaSol && E.countSolutions(inkala, 2) === 1) {
  let given = 0; for (let i = 0; i < 81; i++) if (inkala[i]) given++;
  const c = { p: inkala, full: inkalaSol, given, maxScore: inkalaRate.maxScore, sumScore: inkalaRate.sumScore, usedGuess: inkalaRate.usedGuess };
  if (c.maxScore >= hell.maxScore && c.given <= hell.given + 2) hell = betterPick(hell, c, 'hardest');
}
console.log(`第100关定稿: given=${hell.given} max=${hell.maxScore} sum=${hell.sumScore} guess=${hell.usedGuess} (${Date.now() - t100}ms)`);

levels.push(hell);

// ---------- 校验与输出 ----------
let allOk = true;
levels.forEach((l, idx) => {
  const lv = idx + 1;
  const g = E.parsePuzzle(E.gridToString(l.p));
  if (E.countSolutions(g, 2) !== 1) { console.error(`!! L${lv} 解不唯一`); allOk = false; return; }
  const sol = E.solveGrid(g);
  const r2 = E.solveByTechniques(g);
  if (!r2.solved || E.gridToString(r2.grid) !== E.gridToString(sol)) { console.error(`!! L${lv} 求解不一致`); allOk = false; }
  if (!l.full || E.gridToString(sol) !== E.gridToString(l.full)) l.full = sol;
});

const data = levels.map((l, idx) => {
  const lv = idx + 1;
  const spec = levelSpec(lv);
  let stars = 1;
  if (lv > 10) stars = 2;
  if (lv > 25) stars = 3;
  if (lv > 45) stars = 3.5;
  if (lv > 65) stars = 4;
  if (lv > 85) stars = 5;
  return {
    p: E.gridToString(l.p),
    s: E.gridToString(l.full),
    c: l.given,
    mx: l.maxScore,
    sum: l.sumScore,
    g: l.usedGuess ? 1 : 0,
    tier: spec.name,
    st: stars
  };
});

const out = `/* 数独大师 100 关 · 预生成关卡数据（离线产出，勿手改）
 * p=谜题 s=唯一解 c=提示数 mx=最高技巧分 sum=技巧总分 g=需深层推理 tier=段位 st=难度星 */
(function (g) {
  var LEVELS = ${JSON.stringify(data)};
  g.SUDOKU_LEVELS = LEVELS;
  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;
})(typeof window !== 'undefined' ? window : globalThis);
`;
fs.writeFileSync(path.join(__dirname, '../js/levels-data.js'), out, 'utf8');

console.log('---');
console.log('全部关卡校验:', allOk ? '通过（唯一解 + 技巧解一致）' : '存在失败!');
console.log('放宽条件的关卡:', relaxed.length ? relaxed.join(',') : '无');
const dist = {};
levels.forEach(l => { const k = l.maxScore; dist[k] = (dist[k] || 0) + 1; });
console.log('maxScore 分布:', JSON.stringify(dist));
const givens = levels.map(l => l.given);
console.log('given 范围:', Math.min(...givens), '-', Math.max(...givens));
console.log('输出 -> js/levels-data.js (', data.length, '关 )');
