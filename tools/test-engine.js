// 引擎自测：已知盘面的求解正确性 + 技巧探测 + 性能
const E = require('../js/engine.js');

// 经典简单盘（Naked/Hidden Single 即可解）
const easy = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
// 中等盘
const mid = '000000907000420180000705026100904000050000040000507009920108000034059000507000000';
// AI Escargot（公认超难）
const escargot = '1....7.9..3..2...8..96..5....53..9...1..8...26....4...3......1..4......7..7...3..';

function check(str, label, expectSolved) {
  const g = E.parsePuzzle(str);
  const t0 = Date.now();
  const r = E.solveByTechniques(g);
  const ms = Date.now() - t0;
  const sol = E.solveGrid(g);
  console.log(`[${label}] ${ms}ms solved=${r.solved} guess=${r.usedGuess} max=${r.maxScore} sum=${r.sumScore} steps=${r.steps.length} 唯一解=${E.countSolutions(g,2)===1} backtrack一致=${sol ? E.gridToString(r.grid) === E.gridToString(sol) : 'N/A'}`);
  const techCount = {};
  r.steps.forEach(s => techCount[s.tech] = (techCount[s.tech] || 0) + 1);
  console.log('   技巧分布:', JSON.stringify(techCount));
  return r;
}

check(easy, '入门盘');
check(mid, '中等盘');
check(escargot, 'AI Escargot');

// 生成性能：10 个完整盘 + 挖洞 + 评级
const t0 = Date.now();
for (let i = 0; i < 10; i++) {
  const rng = E.mulberry32(1000 + i);
  const full = E.generateFull(rng);
  const p = E.digHoles(full, rng, 26);
  const r = E.solveByTechniques(p);
  console.log(`gen#${i} clues=${81 - p.reduce((a, v) => a + (v ? 0 : 1), 0)} max=${r.maxScore} sum=${r.sumScore} guess=${r.usedGuess}`);
}
console.log('生成10关耗时:', Date.now() - t0, 'ms');
