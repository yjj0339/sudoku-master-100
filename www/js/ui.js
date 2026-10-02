/* 数独大师 100 · 游戏主逻辑 */
(function () {
  'use strict';
  var E = window.SudokuEngine;
  var AI = window.SudokuAI;
  var LEVELS = window.SUDOKU_LEVELS;

  // ---------------- 存档 ----------------
  var K = { progress: 'sm100_progress', current: 'sm100_current', settings: 'sm100_settings' };
  function loadJSON(key, def) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  }
  function saveJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  var settings = Object.assign({ sound: true, vibrate: true, autoCheck: true, highlightSame: true }, loadJSON(K.settings, {}));
  var progress = Object.assign({ unlocked: 1, stars: {}, bestTime: {}, achs: [], totalWins: 0, totalHints: 0 }, loadJSON(K.progress, {}));

  function saveSettings() { saveJSON(K.settings, settings); }
  function saveProgress() { saveJSON(K.progress, progress); }

  // ---------------- 音效 / 震动 ----------------
  var actx = null;
  function ensureAudio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (actx && actx.state === 'suspended') actx.resume();
  }
  function beep(freq, dur, type, gain, delay) {
    if (!settings.sound || !actx) return;
    try {
      var t = actx.currentTime + (delay || 0);
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(gain || 0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  var SFX = {
    fill: function () { beep(680, 0.09, 'sine', 0.05); },
    note: function () { beep(460, 0.06, 'sine', 0.03); },
    error: function () { beep(170, 0.16, 'square', 0.04); },
    hint: function () { beep(880, 0.1, 'sine', 0.04); beep(1174, 0.12, 'sine', 0.04, 0.09); },
    win: function () { [523, 659, 784, 1046].forEach(function (f, i) { beep(f, 0.22, 'sine', 0.06, i * 0.12); }); },
    ach: function () { beep(1046, 0.12, 'triangle', 0.05); beep(1568, 0.2, 'triangle', 0.05, 0.12); }
  };
  function buzz(pat) { if (settings.vibrate && navigator.vibrate) try { navigator.vibrate(pat); } catch (e) {} }

  // ---------------- 屏幕 ----------------
  var screens = { home: document.getElementById('screen-home'), levels: document.getElementById('screen-levels'), game: document.getElementById('screen-game') };
  function showScreen(name) {
    Object.keys(screens).forEach(function (k) { screens[k].classList.toggle('active', k === name); });
    if (name === 'home') renderHome();
    if (name === 'levels') renderLevels();
  }

  // ---------------- Toast / 模态 ----------------
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  function toast(msg, ms) {
    toastEl.innerHTML = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.add('hidden'); }, ms || 2200);
  }

  var modalRoot = document.getElementById('modal-root');
  var modalOpenedAt = 0;
  function openModal(html) {
    modalOpenedAt = Date.now();
    modalRoot.innerHTML = '<div class="modal">' + html + '</div>';
    modalRoot.classList.remove('hidden');
  }
  function closeModal() { modalRoot.classList.add('hidden'); modalRoot.innerHTML = ''; }
  // 点击遮罩关闭（打开后 350ms 内忽略，防止落子弹窗被同一次点击的合成 click 误关）
  modalRoot.addEventListener('click', function (e) {
    if (e.target === modalRoot && Date.now() - modalOpenedAt > 350) closeModal();
  });

  // ---------------- 成就 ----------------
  var ACHS = [
    { id: 'first', name: '初露锋芒', desc: '通关第 1 关', test: function () { return clearedCount() >= 1; } },
    { id: 'lv25', name: '渐入佳境', desc: '通关 25 关', test: function () { return clearedCount() >= 25; } },
    { id: 'lv50', name: '行家里手', desc: '通关 50 关', test: function () { return clearedCount() >= 50; } },
    { id: 'lv75', name: '登堂入室', desc: '通关 75 关', test: function () { return clearedCount() >= 75; } },
    { id: 'lv100', name: '超越地狱', desc: '通关第 100 关·地狱终局', test: function () { return !!progress.stars[100]; } },
    { id: 'star50', name: '摘星者', desc: '累计 50 颗星', test: function () { return totalStars() >= 50; } },
    { id: 'star150', name: '星河收藏家', desc: '累计 150 颗星', test: function () { return totalStars() >= 150; } },
    { id: 'star300', name: '满天星', desc: '300 星全收集', test: function () { return totalStars() >= 300; } },
    { id: 'perfect', name: '完美一步', desc: '首次三星通关', test: function () { return Object.keys(progress.stars).some(function (k) { return progress.stars[k] === 3; }); } },
    { id: 'nohint_master', name: '不借东风', desc: '无提示通关大师档（66 关+）', test: function () { return Object.keys(progress.stars).some(function (k) { return +k >= 66 && progress.stars[k] >= 2; }); } }
  ];
  function clearedCount() { return Object.keys(progress.stars).length; }
  function totalStars() { return Object.keys(progress.stars).reduce(function (a, k) { return a + progress.stars[k]; }, 0); }
  function checkAchs() {
    ACHS.forEach(function (a) {
      if (progress.achs.indexOf(a.id) < 0 && a.test()) {
        progress.achs.push(a.id);
        setTimeout(function () { SFX.ach(); toast('🏆 成就解锁：<b>' + a.name + '</b> · ' + a.desc, 3000); }, 600);
      }
    });
    saveProgress();
  }

  // ---------------- 游戏状态 ----------------
  var cur = null; // { lv, given, grid, notes, selected, noteMode, history, time, hintsUsed, paused, hintPending }
  var timerId = null;
  var PAR = { 1: 300, 2: 480, 3: 720, 3.5: 900, 4: 1200, 5: 1800 };

  function fmtTime(s) {
    var m = Math.floor(s / 60), ss = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
  }

  function newGame(lv, resumeData) {
    stopDemo();
    var L = LEVELS[lv - 1];
    cur = {
      lv: lv,
      given: E.parsePuzzle(L.p),
      solution: E.parsePuzzle(L.s),
      grid: E.parsePuzzle(L.p),
      notes: new Array(81).fill(0),
      selected: -1,
      noteMode: false,
      history: [],
      time: 0,
      hintsUsed: 0,
      paused: false,
      hintPending: null
    };
    if (resumeData) {
      cur.grid = resumeData.grid.slice();
      cur.notes = resumeData.notes.slice();
      cur.time = resumeData.time || 0;
      cur.hintsUsed = resumeData.hintsUsed || 0;
      cur.noteMode = !!resumeData.noteMode;
    }
    document.getElementById('game-lv').innerHTML = '第 ' + lv + ' 关 <span class="game-tier">' + L.tier + (lv === 100 ? '👑' : '') + '</span>';
    updateHintBadge();
    buildBoard();
    renderAll();
    startTimer();
    showScreen('game');
    saveCurrent();
  }

  function saveCurrent() {
    if (!cur) return;
    saveJSON(K.current, {
      lv: cur.lv,
      grid: Array.from(cur.grid),
      notes: cur.notes.slice(),
      time: cur.time,
      hintsUsed: cur.hintsUsed,
      noteMode: cur.noteMode
    });
  }
  function clearCurrent() { localStorage.removeItem(K.current); }

  // ---------------- 计时 ----------------
  function startTimer() {
    stopTimer();
    timerId = setInterval(function () {
      if (cur && !cur.paused && screens.game.classList.contains('active')) {
        cur.time++;
        document.getElementById('game-time').textContent = fmtTime(cur.time);
        if (cur.time % 15 === 0) saveCurrent();
      }
    }, 1000);
  }
  function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }

  // ---------------- 棋盘渲染 ----------------
  var boardEl = document.getElementById('board');
  var cellEls = [];
  function buildBoard() {
    boardEl.innerHTML = '';
    cellEls = [];
    for (var i = 0; i < 81; i++) {
      (function (i) {
        var d = document.createElement('div');
        d.className = 'cell';
        var r = Math.floor(i / 9), c = i % 9;
        if (c === 2 || c === 5) d.classList.add('b-right');
        if (r === 2 || r === 5) d.classList.add('b-bottom');
        if ((Math.floor(r / 3) + Math.floor(c / 3)) % 2 === 1) d.classList.add('alt');
        d.addEventListener('pointerdown', function (ev) { ev.preventDefault(); ensureAudio(); onCellTap(i); });
        boardEl.appendChild(d);
        cellEls.push(d);
      })(i);
    }
  }

  function renderAll() { renderBoard(); updateNumpad(); updateToolState(); }

  function renderBoard() {
    var sel = cur.selected, selVal = sel >= 0 ? cur.grid[sel] : 0;
    var errors = {};
    if (settings.autoCheck) {
      for (var u = 0; u < 27; u++) {
        var seen = {};
        for (var k = 0; k < 9; k++) {
          var i2 = E.units[u][k], v = cur.grid[i2];
          if (!v) continue;
          if (seen[v] !== undefined) { errors[i2] = 1; errors[seen[v]] = 1; }
          else seen[v] = v;
        }
      }
    }
    for (var i = 0; i < 81; i++) {
      var el = cellEls[i];
      var v = cur.grid[i];
      var isGiven = cur.given[i] > 0;
      var html = '';
      if (v) html = '<span>' + v + '</span>';
      else if (cur.notes[i]) {
        html += '<span class="notes">';
        for (var d = 1; d <= 9; d++) html += '<span>' + (cur.notes[i] & E.bit(d) ? d : '') + '</span>';
        html += '</span>';
      }
      el.innerHTML = html;
      el.classList.toggle('given', isGiven);
      el.classList.toggle('user', !isGiven && !!v);
      el.classList.toggle('selected', i === sel);
      el.classList.toggle('peer', sel >= 0 && i !== sel && E.peers[sel].indexOf(i) >= 0);
      el.classList.toggle('same', settings.highlightSame && !!selVal && v === selVal && i !== sel);
      el.classList.toggle('error', !!errors[i]);
      if (cur.hintPending && i === cur.hintPending.cell && !cur.grid[i]) el.classList.add('hint-flash');
      else el.classList.remove('hint-flash');
    }
  }

  function updateNumpad() {
    for (var d = 1; d <= 9; d++) {
      var btn = numBtns[d - 1];
      var n = 0;
      for (var i = 0; i < 81; i++) if (cur.grid[i] === d && cur.solution[i] === d) n++;
      btn.classList.toggle('done', n >= 9);
      btn.querySelector('.cnt').textContent = Math.max(0, 9 - n);
    }
  }

  function updateToolState() {
    document.getElementById('tool-note').classList.toggle('on', cur.noteMode);
  }

  function updateHintBadge() {
    document.getElementById('game-hints').textContent = '💡' + cur.hintsUsed;
  }

  // ---------------- 输入 ----------------
  function onCellTap(i) {
    if (!cur || cur.paused || demoing) return;
    cur.selected = i;
    renderBoard();
  }

  function pushHistory(i) {
    cur.history.push({ cell: i, val: cur.grid[i], notes: cur.notes[i] });
    if (cur.history.length > 300) cur.history.shift();
  }

  function inputDigit(d) {
    if (!cur || cur.paused || demoing) return;
    var i = cur.selected;
    if (i < 0) { toast('先点选一个格子'); return; }
    if (cur.given[i]) { toast('这是题目给的数字'); return; }
    if (cur.noteMode && !cur.grid[i]) {
      pushHistory(i);
      cur.notes[i] ^= E.bit(d);
      SFX.note();
      renderAll(); saveCurrent();
      return;
    }
    pushHistory(i);
    cur.grid[i] = d;
    cur.notes[i] = 0;
    cur.hintPending = null;
    if (d === cur.solution[i]) {
      SFX.fill(); buzz(10);
      // 自动清理 peers 笔记
      E.peers[i].forEach(function (j) { cur.notes[j] &= ~E.bit(d); });
      cellEls[i].classList.add('pop');
      setTimeout(function () { cellEls[i].classList.remove('pop'); }, 200);
    } else {
      SFX.error(); buzz([40, 40, 40]);
      cellEls[i].classList.add('wrong-flash');
      setTimeout(function () { cellEls[i].classList.remove('wrong-flash'); }, 450);
    }
    cur.selected = i;
    renderAll();
    saveCurrent();
    checkWin();
  }

  function eraseCell() {
    if (!cur || cur.paused || demoing) return;
    var i = cur.selected;
    if (i < 0 || cur.given[i]) return;
    if (!cur.grid[i] && !cur.notes[i]) return;
    pushHistory(i);
    cur.grid[i] = 0; cur.notes[i] = 0; cur.hintPending = null;
    renderAll(); saveCurrent();
  }

  function undo() {
    if (!cur || cur.paused || demoing) return;
    var h = cur.history.pop();
    if (!h) { toast('没有可撤销的操作'); return; }
    cur.grid[h.cell] = h.val;
    cur.notes[h.cell] = h.notes;
    cur.hintPending = null;
    renderAll(); saveCurrent();
  }

  // ---------------- 提示（两级） ----------------
  function validateBoard() {
    if (E.hasConflict(cur.grid)) return false;
    return E.countSolutions(cur.grid, 1) >= 1;
  }
  function firstWrongCell() {
    for (var i = 0; i < 81; i++) {
      if (!cur.given[i] && cur.grid[i] && cur.grid[i] !== cur.solution[i]) return i;
    }
    return -1;
  }

  function computeHintStep() {
    var r = E.solveByTechniques(cur.grid);
    if (!r.solved || r.steps.length === 0) return null;
    return r.steps[0];
  }

  function doHint() {
    if (!cur || cur.paused || demoing) return;
    ensureAudio();
    // 盘面有问题 → 指出错误
    if (!validateBoard()) {
      var w = firstWrongCell();
      if (w >= 0) {
        cellEls[w].classList.add('error', 'wrong-flash');
        setTimeout(function () { cellEls[w].classList.remove('wrong-flash'); }, 500);
      }
      SFX.error();
      toast('AI：盘面有矛盾，已标红错误的格子，先改正它');
      return;
    }
    // 已有待填提示 → 直接填入
    if (cur.hintPending) {
      var hp = cur.hintPending;
      cur.hintPending = null;
      applyHintFill(hp.cell, hp.digit, hp.techName);
      return;
    }
    // 计算一步
    var step = computeHintStep();
    var cell, digit, techName;
    if (step && step.fills && step.fills.length) {
      cell = step.fills[0].cell; digit = step.fills[0].digit; techName = step.name;
    } else {
      // 深层推理：直接从答案取一格提示
      for (var i = 0; i < 81; i++) if (!cur.grid[i]) { cell = i; digit = cur.solution[i]; techName = '深层推理'; break; }
      if (cell === undefined) return;
    }
    cur.hintPending = { cell: cell, digit: digit, techName: techName };
    cur.hintsUsed++; updateHintBadge();
    cur.selected = cell;
    SFX.hint();
    renderBoard();
    var explainHtml = step ? AI.explain(step) : (AI.cellShort(cell) + ' 需要深层推理才能确定，这里应填 <b>' + digit + '</b>。再点一次提示即可填入。');
    openModal(
      '<h2>💡 大师指点</h2><div class="m-body">' + explainHtml + '</div>' +
      '<button class="btn btn-primary" id="m-apply">填入 ' + digit + '</button>' +
      '<button class="btn btn-ghost" id="m-justlook">再看看</button>'
    );
    document.getElementById('m-apply').onclick = function () {
      closeModal();
      cur.hintPending = null;
      applyHintFill(cell, digit, techName);
    };
    document.getElementById('m-justlook').onclick = function () {
      closeModal(); // 保留 hintPending，下次直接填
    };
  }

  function applyHintFill(cell, digit, techName) {
    pushHistory(cell);
    cur.grid[cell] = digit;
    cur.notes[cell] = 0;
    E.peers[cell].forEach(function (j) { cur.notes[j] &= ~E.bit(digit); });
    cur.hintsUsed++; updateHintBadge();
    SFX.fill();
    cellEls[cell].classList.add('pop');
    setTimeout(function () { cellEls[cell].classList.remove('pop'); }, 200);
    renderAll(); saveCurrent();
    checkWin();
  }

  // ---------------- 胜利 ----------------
  function checkWin() {
    if (!cur) return;
    for (var i = 0; i < 81; i++) if (cur.grid[i] !== cur.solution[i]) return;
    win();
  }

  function win() {
    stopTimer();
    stopDemo();
    var L = LEVELS[cur.lv - 1];
    var par = PAR[L.st] || 900;
    var stars = 1;
    if (cur.hintsUsed === 0 && cur.time <= par) stars = 3;
    else if (cur.hintsUsed === 0 || cur.time <= par * 1.5) stars = 2;
    var prev = progress.stars[cur.lv] || 0;
    if (stars > prev) progress.stars[cur.lv] = stars;
    if (!progress.bestTime[cur.lv] || cur.time < progress.bestTime[cur.lv]) progress.bestTime[cur.lv] = cur.time;
    progress.totalWins++;
    progress.totalHints += cur.hintsUsed;
    if (cur.lv + 1 > progress.unlocked && cur.lv < 100) progress.unlocked = cur.lv + 1;
    saveProgress();
    clearCurrent();
    cur.paused = true;
    SFX.win(); buzz([30, 60, 30, 60, 80]);
    checkAchs();

    var starHtml = '';
    for (var s = 1; s <= 3; s++) starHtml += '<span class="' + (s <= stars ? '' : 'dim') + '">⭐</span>';
    var isHell = cur.lv === 100;
    var isLast = cur.lv === 100;
    var title = isLast ? '🏆 终局征服！' : '通关！';
    var hellNote = isHell ? '<p style="color:#f5a623;font-weight:700;margin-bottom:8px">你战胜了 23 提示的地狱终局 —— 了不起！</p>' : '';
    var nextBtn = isLast ? '' : '<button class="btn btn-primary" id="m-next">下一关 →</button>';
    openModal(
      '<h2>' + title + '</h2>' + hellNote +
      '<div class="win-stars">' + starHtml + '</div>' +
      '<div class="win-info"><div><b>' + fmtTime(cur.time) + '</b>用时</div>' +
      '<div><b>' + cur.hintsUsed + '</b>提示</div>' +
      '<div><b>' + L.c + '</b>提示数</div></div>' +
      (stars < 3 ? '<p class="m-sub">三星条件：零提示且 ' + fmtTime(par) + ' 内完成</p>' : '<p class="m-sub">完美通关！</p>') +
      nextBtn +
      '<button class="btn btn-ghost" id="m-replay">再玩一次</button>' +
      '<button class="btn btn-ghost" id="m-back">回到关卡页</button>'
    );
    if (!isLast) document.getElementById('m-next').onclick = function () { closeModal(); newGame(cur.lv + 1); };
    document.getElementById('m-replay').onclick = function () { closeModal(); newGame(cur.lv); };
    document.getElementById('m-back').onclick = function () { closeModal(); showScreen('levels'); };
    if (cur.lv < 100 && progress.unlocked === cur.lv + 1) setTimeout(function () { toast('🎉 解锁第 ' + (cur.lv + 1) + ' 关'); }, 800);
  }

  // ---------------- 暂停 ----------------
  function pauseGame() {
    if (!cur) return;
    cur.paused = true;
    document.getElementById('pause-mask').classList.remove('hidden');
  }
  function resumeGame() {
    if (!cur) return;
    cur.paused = false;
    document.getElementById('pause-mask').classList.add('hidden');
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && cur && screens.game.classList.contains('active')) pauseGame();
  });

  // ---------------- AI 大师 ----------------
  var aiDrawer = document.getElementById('ai-drawer');
  var aiChat = document.getElementById('ai-chat');
  var demoing = false, demoTimer = null;

  function aiSay(html, me) {
    var div = document.createElement('div');
    div.className = 'ai-msg' + (me ? ' me' : '');
    aiChat.appendChild(div);
    div.innerHTML = html;
    aiChat.scrollTop = aiChat.scrollHeight;
  }
  function aiType(html, done) {
    var div = document.createElement('div');
    div.className = 'ai-msg';
    aiChat.appendChild(div);
    var i = 0, plain = html;
    // 打字机：按 HTML 原样逐段显示（简化：每 30ms 增加 6 个字符）
    var timer = setInterval(function () {
      i += 7;
      if (i >= plain.length) { div.innerHTML = plain; clearInterval(timer); aiChat.scrollTop = aiChat.scrollHeight; if (done) done(); return; }
      var slice = plain.slice(0, i);
      // 防止截断标签
      var lastOpen = slice.lastIndexOf('<'), lastClose = slice.lastIndexOf('>');
      if (lastOpen > lastClose) slice = slice.slice(0, lastOpen);
      div.innerHTML = slice;
      aiChat.scrollTop = aiChat.scrollHeight;
    }, 24);
  }

  function openAI() {
    if (!cur || demoing) return;
    aiDrawer.classList.remove('hidden');
    aiChat.innerHTML = '';
    aiType(AI.openLine(cur.lv));
  }
  function closeAI() {
    if (demoing) stopDemo();
    aiDrawer.classList.add('hidden');
  }

  // 基于当前盘面取一步（含合法性防护）
  function aiNextMove() {
    if (!validateBoard()) {
      var w = firstWrongCell();
      return { error: true, cell: w };
    }
    var r = E.solveByTechniques(cur.grid);
    if (!r.solved) return { error: true, cell: firstWrongCell() };
    if (!r.steps.length) return { done: true };
    var step = r.steps[0];
    // deepReasoning 的 fills 是全部剩余，一次只演示一格
    if (step.tech === 'deepReasoning') {
      var f = step.fills[0];
      return { step: { tech: 'deepReasoning', name: step.name, score: step.score, fills: [f], elims: [], info: { count: step.info.count } } };
    }
    return { step: step };
  }

  function aiExplain() {
    if (!cur || demoing) return;
    var mv = aiNextMove();
    if (mv.error) { aiType(AI.LINES.stuck[Math.floor(Math.random() * 2)]); highlightWrong(mv.cell); return; }
    if (mv.done) { aiType('盘面已经完成了呀？'); return; }
    aiType(AI.explain(mv.step));
    flashCells(mv.step);
  }

  function aiStep() {
    if (!cur || demoing) return;
    var mv = aiNextMove();
    if (mv.error) { aiType(AI.LINES.stuck[Math.floor(Math.random() * 2)]); highlightWrong(mv.cell); return; }
    if (mv.done) { return; }
    var f = mv.step.fills[0];
    pushHistory(f.cell);
    cur.grid[f.cell] = f.digit;
    cur.notes[f.cell] = 0;
    E.peers[f.cell].forEach(function (j) { cur.notes[j] &= ~E.bit(f.digit); });
    cur.hintsUsed++; updateHintBadge();
    SFX.fill();
    aiType(AI.explain(mv.step));
    renderAll(); saveCurrent(); checkWin();
  }

  function aiAuto() {
    if (!cur || demoing) return;
    if (!validateBoard()) { aiType(AI.LINES.stuck[0]); return; }
    demoing = true;
    document.getElementById('ai-auto').classList.add('hidden');
    document.getElementById('ai-stop').classList.remove('hidden');
    disableInput(true);
    aiSay('好，看好了——我从当前盘面开始，逐步演示到终局。');
    demoTimer = setInterval(function () {
      var mv = aiNextMove();
      if (mv.error || mv.done || !mv.step) { stopDemo(); return; }
      var f = mv.step.fills[0];
      pushHistory(f.cell);
      cur.grid[f.cell] = f.digit;
      cur.notes[f.cell] = 0;
      E.peers[f.cell].forEach(function (j) { cur.notes[j] &= ~E.bit(f.digit); });
      cur.hintsUsed++; updateHintBadge();
      aiType(AI.explain(mv.step));
      renderBoard(); updateNumpad();
      if (cur.grid.every(function (v, i) { return v === cur.solution[i]; })) {
        stopDemo();
        SFX.win();
        setTimeout(win, 600);
      }
    }, 850);
  }

  function stopDemo() {
    if (demoTimer) clearInterval(demoTimer);
    demoTimer = null;
    if (demoing) {
      demoing = false;
      aiSay('演示暂停。剩下的交给你？');
    }
    document.getElementById('ai-auto').classList.remove('hidden');
    document.getElementById('ai-stop').classList.add('hidden');
    disableInput(false);
  }

  function disableInput(on) {
    document.querySelectorAll('.tool-btn').forEach(function (b) { b.disabled = on; });
    numBtns.forEach(function (b) { b.disabled = on; });
  }

  function highlightWrong(cell) {
    if (cell >= 0) {
      cellEls[cell].classList.add('error', 'wrong-flash');
      setTimeout(function () { cellEls[cell].classList.remove('wrong-flash'); }, 600);
    }
  }
  function flashCells(step) {
    var cells = [];
    (step.fills || []).forEach(function (f) { cells.push(f.cell); });
    (step.info && step.info.cells || []).forEach(function (c) { cells.push(c); });
    (step.info && step.info.spots || []).forEach(function (c) { cells.push(c); });
    cells.forEach(function (c) {
      if (cellEls[c]) {
        cellEls[c].classList.add('hint-flash');
        setTimeout(function () { cellEls[c].classList.remove('hint-flash'); }, 1800);
      }
    });
  }

  // ---------------- 主页 / 关卡页 ----------------
  function renderHome() {
    var nextLv = Math.min(progress.unlocked, 100);
    var saved = loadJSON(K.current, null);
    if (saved && saved.lv && !progress.stars[saved.lv]) nextLv = saved.lv;
    document.getElementById('continue-lv').textContent = nextLv;
    document.getElementById('stat-cleared').textContent = clearedCount();
    document.getElementById('stat-stars').innerHTML = totalStars() + '<small>/300</small>';
    document.getElementById('stat-achs').textContent = progress.achs.length + '/' + ACHS.length;
    document.getElementById('btn-continue').onclick = function () { ensureAudio(); startLevel(nextLv); };
  }

  var TIER_RANGES = [
    ['入门 · 1-10', 1, 10], ['新手 · 11-25', 11, 25], ['进阶 · 26-45', 26, 45],
    ['高手 · 46-65', 46, 65], ['大师 · 66-85', 66, 85], ['宗师 · 86-99', 86, 99], ['地狱终局', 100, 100]
  ];
  function renderLevels() {
    var grid = document.getElementById('levels-grid');
    grid.innerHTML = '';
    document.getElementById('levels-star-count').textContent = '⭐ ' + totalStars() + '/300';
    TIER_RANGES.forEach(function (tr) {
      var div = document.createElement('div');
      div.className = 'tier-divider';
      div.textContent = tr[0];
      grid.appendChild(div);
      for (var lv = tr[1]; lv <= tr[2]; lv++) {
        (function (lv) {
          var c = document.createElement('button');
          c.className = 'lv-cell';
          var stars = progress.stars[lv] || 0;
          var starTxt = '';
          for (var s = 1; s <= 3; s++) starTxt += s <= stars ? '★' : '☆';
          var locked = lv > progress.unlocked;
          if (locked) c.classList.add('locked');
          if (lv === progress.unlocked && !progress.stars[lv]) c.classList.add('current');
          if (lv === 100) c.classList.add('hell');
          c.innerHTML = (lv === 100 ? '<span class="lv-badge">👑</span>' : '') +
            '<span>' + (locked ? '🔒' : lv === 100 ? '终' : lv) + '</span>' +
            '<span class="lv-stars">' + (locked ? '' : starTxt) + '</span>';
          c.onclick = function () { ensureAudio(); startLevel(lv); };
          grid.appendChild(c);
        })(lv);
      }
    });
  }

  function startLevel(lv) {
    var saved = loadJSON(K.current, null);
    if (saved && saved.lv === lv && !progress.stars[lv]) {
      newGame(lv, saved);
      return;
    }
    if (lv === 100 && !progress.stars[100]) {
      openModal(
        '<h2>👑 地狱终局</h2>' +
        '<div class="m-body"><p>第 100 关：<b>仅 23 个提示</b>，技巧链长达 134 分。</p>' +
        '<p>常规技巧在这里会失效，<b>连 AI 大师也要动用深层推理</b>。</p>' +
        '<p>确认挑战吗？</p></div>' +
        '<button class="btn btn-primary" id="m-go">开始终局挑战</button>' +
        '<button class="btn btn-ghost" id="m-cancel">再练练</button>'
      );
      document.getElementById('m-go').onclick = function () { closeModal(); newGame(100); };
      document.getElementById('m-cancel').onclick = closeModal;
      return;
    }
    newGame(lv);
  }

  // ---------------- 帮助 / 设置 ----------------
  function openHelp() {
    openModal(
      '<h2>📖 玩法说明</h2><div class="m-body">' +
      '<h4>目标</h4><p>每行、每列、每个 3×3 宫，数字 1-9 各出现一次。</p>' +
      '<h4>操作</h4><p>点格子 → 点数字填入；✏️笔记模式可在格内记候选小数字；填入的数字会自动清掉同行列宫的笔记。</p>' +
      '<h4>提示 💡</h4><p>第一次点：指出该填哪格并讲解原理；再点一次：直接填入。卡住时 AI 会先帮你标红错误。</p>' +
      '<h4>AI 大师 🧙</h4><p>「玄机」会用人类的解题技巧逐步讲解：唯一余数、隐性唯一、区块摒除、数对、X-Wing、剑鱼、链染、XY-Wing……地狱关他会展示「深层推理」。</p>' +
      '<h4>星级</h4><p>⭐通关 · ⭐⭐零提示或快速 · ⭐⭐⭐零提示且达标。通关解锁下一关。</p>' +
      '<h4>难度阶梯（100 关）</h4><p>入门(1-10) → 新手(11-25) → 进阶(26-45) → 高手(46-65) → 大师(66-85) → 宗师(86-99) → 👑地狱终局(100)。</p>' +
      '</div><button class="btn btn-primary" onclick="document.getElementById(\'modal-root\').classList.add(\'hidden\')">知道了</button>'
    );
  }

  function openSettings() {
    var rows = [
      ['sound', '🔊 音效'], ['vibrate', '📳 震动反馈'],
      ['autoCheck', '🚨 即时纠错'], ['highlightSame', '🔆 高亮相同数字']
    ];
    var html = '<h2>⚙️ 设置</h2><div class="m-body">';
    rows.forEach(function (r) {
      html += '<div class="set-row"><span>' + r[1] + '</span><div class="switch ' + (settings[r[0]] ? 'on' : '') + '" data-set="' + r[0] + '"></div></div>';
    });
    html += '<div class="set-row"><span>🗑️ 清空全部进度</span><button class="btn btn-sm btn-ghost" id="m-reset">重置</button></div>';
    html += '</div><button class="btn btn-primary" id="m-close-set">完成</button>';
    openModal(html);
    modalRoot.querySelectorAll('.switch').forEach(function (sw) {
      sw.onclick = function () {
        var key = sw.getAttribute('data-set');
        settings[key] = !settings[key];
        sw.classList.toggle('on', settings[key]);
        saveSettings();
      };
    });
    document.getElementById('m-close-set').onclick = closeModal;
    document.getElementById('m-reset').onclick = function () {
      openModal('<h2>确定清空？</h2><p class="m-sub">所有进度、星级、成就都会消失。</p>' +
        '<button class="btn btn-primary" id="m-reset-yes">清空</button>' +
        '<button class="btn btn-ghost" id="m-reset-no">手滑了</button>');
      document.getElementById('m-reset-yes').onclick = function () {
        progress = { unlocked: 1, stars: {}, bestTime: {}, achs: [], totalWins: 0, totalHints: 0 };
        saveProgress(); clearCurrent(); closeModal(); renderHome(); toast('已重置');
      };
      document.getElementById('m-reset-no').onclick = closeModal;
    };
  }

  // ---------------- 数字键盘 ----------------
  var numBtns = [];
  (function buildNumpad() {
    var pad = document.getElementById('numpad');
    for (var d = 1; d <= 9; d++) {
      (function (d) {
        var b = document.createElement('button');
        b.className = 'num-btn';
        b.innerHTML = d + '<span class="cnt">9</span>';
        b.addEventListener('pointerdown', function (ev) { ev.preventDefault(); ensureAudio(); inputDigit(d); });
        pad.appendChild(b);
        numBtns.push(b);
      })(d);
    }
  })();

  // ---------------- 事件绑定 ----------------
  document.querySelectorAll('[data-back]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.getAttribute('data-back') === 'home' && cur) stopTimer();
      showScreen(b.getAttribute('data-back'));
    });
  });
  document.getElementById('btn-levels').addEventListener('click', function () { showScreen('levels'); });
  document.getElementById('btn-help').addEventListener('click', openHelp);
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('btn-pause').addEventListener('click', pauseGame);
  document.getElementById('btn-resume').addEventListener('click', resumeGame);
  document.getElementById('btn-restart').addEventListener('click', function () {
    if (!cur) return;
    openModal('<h2>重开本关？</h2><p class="m-sub">当前进度与用时将清零。</p>' +
      '<button class="btn btn-primary" id="m-rs">重开</button><button class="btn btn-ghost" id="m-rs-no">取消</button>');
    document.getElementById('m-rs').onclick = function () { var lv = cur.lv; closeModal(); newGame(lv); };
    document.getElementById('m-rs-no').onclick = closeModal;
  });
  document.getElementById('tool-undo').addEventListener('click', undo);
  document.getElementById('tool-erase').addEventListener('click', eraseCell);
  document.getElementById('tool-note').addEventListener('click', function () {
    if (!cur) return;
    cur.noteMode = !cur.noteMode;
    updateToolState();
    toast(cur.noteMode ? '✏️ 笔记模式：写入候选小数字' : '已切回填写模式', 1400);
  });
  document.getElementById('tool-hint').addEventListener('click', doHint);
  document.getElementById('tool-ai').addEventListener('click', openAI);
  document.getElementById('ai-close').addEventListener('click', closeAI);
  document.getElementById('ai-explain').addEventListener('click', aiExplain);
  document.getElementById('ai-step').addEventListener('click', aiStep);
  document.getElementById('ai-auto').addEventListener('click', aiAuto);
  document.getElementById('ai-stop').addEventListener('click', stopDemo);
  document.addEventListener('pointerdown', ensureAudio, { once: true });

  // 键盘输入（桌面友好）
  document.addEventListener('keydown', function (e) {
    if (!cur || !screens.game.classList.contains('active')) return;
    if (e.key >= '1' && e.key <= '9') inputDigit(+e.key);
    else if (e.key === 'Backspace' || e.key === 'Delete') eraseCell();
    else if (e.key === 'n' || e.key === 'N') { cur.noteMode = !cur.noteMode; updateToolState(); }
    else if (e.key === 'z' || e.key === 'Z') undo();
    else if (e.key === 'h' || e.key === 'H') doHint();
  });

  // ---------------- 启动 ----------------
  // 自动化测试钩子（不用于玩家）
  window.__startLevel = function (lv) { startLevel(lv); };
  window.__getCur = function () { return cur; };
  window.__win = function () { win(); };
  renderHome();
})();
