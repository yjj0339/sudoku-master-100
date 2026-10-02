/* 数独大师 100 · v2 游戏主逻辑
 * 新增：iOS push 转场 / 连击 combo / 行宫完成波纹 / confetti / 每日挑战 / 三主题 / 桌面双栏 / 成就面板 */
(function () {
  'use strict';
  var E = window.SudokuEngine;
  var AI = window.SudokuAI;
  var LEVELS = window.SUDOKU_LEVELS;
  var $ = function (id) { return document.getElementById(id); };

  // ---------------- 存档 ----------------
  var K = { progress: 'sm100_progress', current: 'sm100_current', settings: 'sm100_settings' };
  function loadJSON(key, def) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  }
  function saveJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  var settings = Object.assign({ sound: true, vibrate: true, autoCheck: true, highlightSame: true, theme: 'cloud' }, loadJSON(K.settings, {}));
  var progress = Object.assign({ unlocked: 1, stars: {}, bestTime: {}, achs: [], totalWins: 0, totalHints: 0, daily: {} }, loadJSON(K.progress, {}));
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
    fill: function (combo) { beep(620 + Math.min(combo || 0, 12) * 36, 0.1, 'sine', 0.05); },
    note: function () { beep(460, 0.06, 'sine', 0.03); },
    error: function () { beep(170, 0.16, 'square', 0.04); },
    hint: function () { beep(880, 0.1, 'sine', 0.04); beep(1174, 0.12, 'sine', 0.04, 0.09); },
    wave: function () { [660, 830, 990, 1320].forEach(function (f, i) { beep(f, 0.16, 'sine', 0.045, i * 0.06); }); },
    win: function () { [523, 659, 784, 1046].forEach(function (f, i) { beep(f, 0.24, 'sine', 0.06, i * 0.13); }); },
    ach: function () { beep(1046, 0.12, 'triangle', 0.05); beep(1568, 0.2, 'triangle', 0.05, 0.12); }
  };
  function buzz(pat) { if (settings.vibrate && navigator.vibrate) try { navigator.vibrate(pat); } catch (e) {} }

  // ---------------- 屏幕切换（iOS push） ----------------
  var screens = { home: $('screen-home'), levels: $('screen-levels'), game: $('screen-game') };
  var currentScreen = 'home';
  var animLock = false;
  function goScreen(name, dir) {
    if (name === currentScreen) return;
    var from = screens[currentScreen], to = screens[name];
    animLock = true;
    to.classList.add('active');
    if (dir === 'back') {
      to.classList.add('anim-back-in'); from.classList.add('anim-back-out');
    } else {
      to.classList.add('anim-push-in'); from.classList.add('anim-push-out');
    }
    if (name === 'home') renderHome();
    if (name === 'levels') renderLevels();
    setTimeout(function () {
      from.classList.remove('active', 'anim-push-out', 'anim-back-out');
      to.classList.remove('anim-push-in', 'anim-back-in');
      currentScreen = name;
      animLock = false;
    }, 500);
  }

  // ---------------- Toast / 模态 ----------------
  var toastEl = $('toast');
  var toastTimer = null;
  function toast(msg, ms) {
    toastEl.innerHTML = msg;
    toastEl.classList.remove('hidden');
    toastEl.style.animation = 'none';
    void toastEl.offsetWidth;
    toastEl.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.add('hidden'); }, ms || 2200);
  }

  var modalRoot = $('modal-root');
  var modalOpenedAt = 0;
  function openModal(html) {
    modalOpenedAt = Date.now();
    modalRoot.innerHTML = '<div class="modal">' + html + '</div>';
    modalRoot.classList.remove('hidden');
  }
  function closeModal() { modalRoot.classList.add('hidden'); modalRoot.innerHTML = ''; }
  modalRoot.addEventListener('click', function (e) {
    if (e.target === modalRoot && Date.now() - modalOpenedAt > 350) closeModal();
  });

  // ---------------- confetti ----------------
  var confettiCanvas = $('confetti');
  function fireConfetti() {
    var ctx2 = confettiCanvas.getContext('2d');
    var W = confettiCanvas.width = window.innerWidth;
    var H = confettiCanvas.height = window.innerHeight;
    var colors = ['#5e5ce6', '#7d7aff', '#f2a93b', '#ff7a59', '#30b078', '#64b5f6', '#ff8fb1'];
    var parts = [];
    for (var i = 0; i < 130; i++) {
      parts.push({
        x: W / 2 + (Math.random() - .5) * W * .5,
        y: H * .32 + (Math.random() - .5) * 60,
        vx: (Math.random() - .5) * 13,
        vy: -Math.random() * 13 - 5,
        w: 6 + Math.random() * 7,
        h: 4 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - .5) * .3,
        c: colors[i % colors.length],
        life: 1
      });
    }
    var t0 = performance.now();
    (function frame(now) {
      var dt = (now - t0) / 1000;
      ctx2.clearRect(0, 0, W, H);
      var alive = 0;
      parts.forEach(function (p) {
        if (p.life <= 0) return;
        alive++;
        p.vy += .32; p.vx *= .992;
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        p.life = Math.max(0, 1 - dt / 2.8);
        ctx2.save();
        ctx2.globalAlpha = Math.min(1, p.life * 1.6);
        ctx2.translate(p.x, p.y);
        ctx2.rotate(p.rot);
        ctx2.fillStyle = p.c;
        ctx2.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx2.restore();
      });
      if (alive > 0 && dt < 3.2) requestAnimationFrame(frame);
      else ctx2.clearRect(0, 0, W, H);
    })(t0);
  }

  // ---------------- 成就 ----------------
  var ACHS = [
    { id: 'first', ico: '🌱', name: '初露锋芒', desc: '通关第 1 关', test: function () { return clearedCount() >= 1; } },
    { id: 'lv25', ico: '🌿', name: '渐入佳境', desc: '通关 25 关', test: function () { return clearedCount() >= 25; } },
    { id: 'lv50', ico: '🌳', name: '行家里手', desc: '通关 50 关', test: function () { return clearedCount() >= 50; } },
    { id: 'lv75', ico: '🏔️', name: '登堂入室', desc: '通关 75 关', test: function () { return clearedCount() >= 75; } },
    { id: 'lv100', ico: '👑', name: '超越地狱', desc: '通关第 100 关·地狱终局', test: function () { return !!progress.stars[100]; } },
    { id: 'star50', ico: '⭐', name: '摘星者', desc: '累计 50 颗星', test: function () { return totalStars() >= 50; } },
    { id: 'star150', ico: '🌌', name: '星河收藏家', desc: '累计 150 颗星', test: function () { return totalStars() >= 150; } },
    { id: 'star300', ico: '✨', name: '满天星', desc: '300 星全收集', test: function () { return totalStars() >= 300; } },
    { id: 'perfect', ico: '💎', name: '完美一步', desc: '首次三星通关', test: function () { return Object.keys(progress.stars).some(function (k) { return progress.stars[k] === 3; }); } },
    { id: 'daily1', ico: '🗓️', name: '初试身手', desc: '完成首次每日挑战', test: function () { return Object.keys(progress.daily).length >= 1; } },
    { id: 'daily7', ico: '🔥', name: '七日之约', desc: '每日挑战累计 7 天', test: function () { return Object.keys(progress.daily).length >= 7; } },
    { id: 'combo8', ico: '⚡', name: '行云流水', desc: '单局达成 8 连击', test: function () { return (progress.maxCombo || 0) >= 8; } }
  ];
  function clearedCount() { return Object.keys(progress.stars).length; }
  function totalStars() { return Object.keys(progress.stars).reduce(function (a, k) { return a + progress.stars[k]; }, 0); }
  function checkAchs() {
    ACHS.forEach(function (a) {
      if (progress.achs.indexOf(a.id) < 0 && a.test()) {
        progress.achs.push(a.id);
        setTimeout(function () { SFX.ach(); toast('🏆 成就解锁：<b>' + a.name + '</b> · ' + a.desc, 3000); }, 700);
      }
    });
    saveProgress();
  }

  // ---------------- 游戏状态 ----------------
  var cur = null;
  var timerId = null;
  var PAR = { 1: 300, 2: 480, 3: 720, 3.5: 900, 4: 1200, 5: 1800 };

  function fmtTime(s) {
    var m = Math.floor(s / 60), ss = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
  }

  function levelData(lv) { return LEVELS[lv - 1]; }

  function newGame(pz, opts) {
    opts = opts || {};
    stopDemo();
    cur = {
      lv: pz.lv, daily: !!pz.daily,
      given: E.parsePuzzle(pz.p),
      solution: E.parsePuzzle(pz.s),
      grid: E.parsePuzzle(pz.p),
      notes: new Array(81).fill(0),
      selected: -1,
      noteMode: false,
      history: [],
      time: 0, hintsUsed: 0,
      paused: false, hintPending: null,
      combo: 0, maxCombo: 0,
      tier: pz.tier, st: pz.st, given_count: pz.c
    };
    if (opts.resumeData) {
      var rd = opts.resumeData;
      cur.grid = rd.grid.slice();
      cur.notes = rd.notes.slice();
      cur.time = rd.time || 0;
      cur.hintsUsed = rd.hintsUsed || 0;
      cur.noteMode = !!rd.noteMode;
    }
    var label = cur.daily ? '每日挑战 🗓️' : '第 ' + cur.lv + ' 关';
    $('game-lv').innerHTML = label + ' <span class="game-tier">' + pz.tier + (cur.lv === 100 ? ' 👑' : '') + '</span>';
    $('side-lv').textContent = cur.daily ? '每日挑战' : '第 ' + cur.lv + ' 关';
    $('side-tier').textContent = pz.tier;
    updateHintBadge(); updateCombo();
    buildBoard();
    renderAll();
    startTimer();
    goScreen('game', 'forward');
    saveCurrent();
  }

  function saveCurrent() {
    if (!cur) return;
    saveJSON(K.current, {
      lv: cur.lv, daily: !!cur.daily, p: E.gridToString(cur.given), s: E.gridToString(cur.solution),
      c: cur.given_count, tier: cur.tier, st: cur.st,
      grid: Array.from(cur.grid), notes: cur.notes.slice(),
      time: cur.time, hintsUsed: cur.hintsUsed, noteMode: cur.noteMode
    });
  }
  function clearCurrent() { localStorage.removeItem(K.current); }

  // ---------------- 计时 ----------------
  function startTimer() {
    stopTimer();
    timerId = setInterval(function () {
      if (cur && !cur.paused && currentScreen === 'game') {
        cur.time++;
        $('game-time').textContent = fmtTime(cur.time);
        $('side-time').textContent = fmtTime(cur.time);
        if (cur.time % 15 === 0) saveCurrent();
      }
    }, 1000);
  }
  function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }

  // ---------------- 棋盘 ----------------
  var boardEl = $('board');
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

  function renderAll() { renderBoard(); updateNumpad(); updateToolState(); updateSide(); }

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
      if (v) html = '<span class="glyph">' + v + '</span>';
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
    ['tool-note', 'tool-note-pc'].forEach(function (id) {
      var b = $(id); if (b) b.classList.toggle('on', cur && cur.noteMode);
    });
  }

  function updateHintBadge() {
    $('game-hints').textContent = '💡' + cur.hintsUsed;
    $('side-hints').textContent = cur.hintsUsed;
  }

  function updateCombo() {
    $('side-combo').textContent = cur ? cur.combo : 0;
  }

  function updateSide() {
    if (!cur) return;
    $('side-time').textContent = fmtTime(cur.time);
  }

  function showComboPop(n) {
    var el = $('combo-pop');
    el.textContent = '连击 ×' + n + (n >= 5 ? ' 🔥' : '');
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.add('hidden'); }, 850);
  }

  // 完成单元波纹：cell 所在行/列/宫若已正确填满则闪光
  function waveIfComplete(cell) {
    var done = [];
    E.unitsOf[cell].forEach(function (u) {
      var full = true;
      for (var k = 0; k < 9; k++) { if (cur.grid[E.units[u][k]] !== cur.solution[E.units[u][k]]) { full = false; break; } }
      if (full) done.push(u);
    });
    if (!done.length) return;
    var seen = {};
    done.forEach(function (u) {
      E.units[u].forEach(function (i, idx) {
        if (seen[i]) return; seen[i] = 1;
        var el = cellEls[i];
        el.style.setProperty('--i', idx);
        el.classList.remove('wave'); void el.offsetWidth;
        el.classList.add('wave');
        (function (el2) { setTimeout(function () { el2.classList.remove('wave'); }, 1400); })(el);
      });
    });
    SFX.wave();
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
      cur.combo++; cur.maxCombo = Math.max(cur.maxCombo, cur.combo);
      if (cur.combo > (progress.maxCombo || 0)) { progress.maxCombo = cur.combo; saveProgress(); }
      SFX.fill(cur.combo); buzz(10);
      E.peers[i].forEach(function (j) { cur.notes[j] &= ~E.bit(d); });
      cellEls[i].classList.add('pop');
      setTimeout(function () { cellEls[i].classList.remove('pop'); }, 550);
      waveIfComplete(i);
      if (cur.combo >= 2) showComboPop(cur.combo);
    } else {
      cur.combo = 0;
      SFX.error(); buzz([40, 40, 40]);
      cellEls[i].classList.add('wrong-flash');
      setTimeout(function () { cellEls[i].classList.remove('wrong-flash'); }, 500);
    }
    updateCombo();
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
    cur.grid[i] = 0; cur.notes[i] = 0; cur.hintPending = null; cur.combo = 0;
    updateCombo();
    renderAll(); saveCurrent();
  }

  function undo() {
    if (!cur || cur.paused || demoing) return;
    var h = cur.history.pop();
    if (!h) { toast('没有可撤销的操作'); return; }
    cur.grid[h.cell] = h.val;
    cur.notes[h.cell] = h.notes;
    cur.hintPending = null; cur.combo = 0;
    updateCombo();
    renderAll(); saveCurrent();
  }

  // ---------------- 提示 ----------------
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
    if (!validateBoard()) {
      var w = firstWrongCell();
      if (w >= 0) {
        cellEls[w].classList.add('error', 'wrong-flash');
        setTimeout(function () { cellEls[w].classList.remove('wrong-flash'); }, 550);
      }
      SFX.error();
      toast('AI：盘面有矛盾，已标红错误的格子，先改正它');
      return;
    }
    if (cur.hintPending) {
      var hp = cur.hintPending;
      cur.hintPending = null;
      applyHintFill(hp.cell, hp.digit);
      return;
    }
    var step = computeHintStep();
    var cell, digit;
    if (step && step.fills && step.fills.length) {
      cell = step.fills[0].cell; digit = step.fills[0].digit;
    } else {
      for (var i = 0; i < 81; i++) if (!cur.grid[i]) { cell = i; digit = cur.solution[i]; break; }
      if (cell === undefined) return;
    }
    cur.hintPending = { cell: cell, digit: digit };
    cur.hintsUsed++; updateHintBadge();
    cur.selected = cell;
    SFX.hint();
    renderBoard();
    var explainHtml = step ? AI.explain(step) : (AI.cellShort(cell) + ' 需要深层推理才能确定，这里应填 <b>' + digit + '</b>。再点一次提示即可填入。');
    openModal(
      '<h2>💡 大师指点</h2><div class="m-body">' + explainHtml + '</div>' +
      '<button class="btn btn-primary" id="m-apply">填入 ' + digit + '</button>' +
      '<button class="btn btn-glass" id="m-justlook">再看看</button>'
    );
    $('m-apply').onclick = function () { closeModal(); cur.hintPending = null; applyHintFill(cell, digit); };
    $('m-justlook').onclick = closeModal;
  }

  function applyHintFill(cell, digit) {
    pushHistory(cell);
    cur.grid[cell] = digit;
    cur.notes[cell] = 0;
    E.peers[cell].forEach(function (j) { cur.notes[j] &= ~E.bit(digit); });
    cur.hintsUsed++; updateHintBadge();
    cur.combo++; cur.maxCombo = Math.max(cur.maxCombo, cur.combo);
    updateCombo();
    SFX.fill(cur.combo);
    cellEls[cell].classList.add('pop');
    setTimeout(function () { cellEls[cell].classList.remove('pop'); }, 550);
    waveIfComplete(cell);
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
    var par = PAR[cur.st] || 900;
    var stars = 1;
    if (cur.hintsUsed === 0 && cur.time <= par) stars = 3;
    else if (cur.hintsUsed === 0 || cur.time <= par * 1.5) stars = 2;
    var isHell = cur.lv === 100;
    var isDaily = !!cur.daily;

    if (isDaily) {
      var key = todayKey();
      var prevD = progress.daily[key] || 0;
      if (stars > prevD) progress.daily[key] = stars;
    } else {
      var prev = progress.stars[cur.lv] || 0;
      if (stars > prev) progress.stars[cur.lv] = stars;
      if (!progress.bestTime[cur.lv] || cur.time < progress.bestTime[cur.lv]) progress.bestTime[cur.lv] = cur.time;
      if (cur.lv + 1 > progress.unlocked && cur.lv < 100) progress.unlocked = cur.lv + 1;
    }
    progress.totalWins++;
    progress.totalHints += cur.hintsUsed;
    saveProgress();
    clearCurrent();
    cur.paused = true;
    SFX.win(); buzz([30, 60, 30, 60, 80]);
    fireConfetti();
    checkAchs();

    var starHtml = '';
    for (var s = 1; s <= 3; s++) starHtml += '<span class="' + (s <= stars ? '' : 'dim') + '">⭐</span>';
    var title = isDaily ? '🗓️ 每日挑战达成！' : (isHell ? '🏆 终局征服！' : '通关！');
    var hellNote = isHell ? '<p style="color:var(--gold);font-weight:750;margin-bottom:8px">你战胜了 23 提示的地狱终局 —— 了不起！</p>' : '';
    var comboNote = cur.maxCombo >= 3 ? '<p class="m-sub">最高连击 ×' + cur.maxCombo + ' ' + (cur.maxCombo >= 8 ? '行云流水！' : '保持这个节奏') + '</p>' : '';
    var sub = stars < 3 ? '三星条件：零提示且 ' + fmtTime(par) + ' 内完成' : '完美通关！';
    var nextBtn = (!isHell && !isDaily) ? '<button class="btn btn-primary" id="m-next">下一关 →</button>' : '';

    openModal(
      '<h2>' + title + '</h2>' + hellNote +
      '<div class="win-stars">' + starHtml + '</div>' +
      '<div class="win-info"><div><b id="win-time">00:00</b>用时</div>' +
      '<div><b>' + cur.hintsUsed + '</b>提示</div>' +
      '<div><b>' + cur.maxCombo + '</b>最高连击</div></div>' +
      comboNote +
      '<p class="m-sub">' + sub + '</p>' +
      nextBtn +
      '<button class="btn btn-glass" id="m-replay">再玩一次</button>' +
      '<button class="btn btn-glass" id="m-back">回到' + (isDaily ? '主页' : '关卡页') + '</button>'
    );
    var tEl = $('win-time'), t0 = performance.now();
    (function roll(now) {
      var k = Math.min(1, (now - t0) / 900);
      tEl.textContent = fmtTime(Math.round(cur.time * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(roll);
    })(t0);
    if (nextBtn) $('m-next').onclick = function () { closeModal(); startLevel(cur.lv + 1); };
    $('m-replay').onclick = function () { closeModal(); if (isDaily) startDaily(); else startLevel(cur.lv); };
    $('m-back').onclick = function () { closeModal(); goScreen(isDaily ? 'home' : 'levels', 'back'); };
    if (nextBtn && progress.unlocked === cur.lv + 1) setTimeout(function () { toast('🎉 解锁第 ' + (cur.lv + 1) + ' 关'); }, 900);
    if (isDaily) {
      var sk = streak();
      setTimeout(function () { toast('🗓️ 每日挑战完成 · 连续 <b>' + sk + '</b> 天'); }, 1200);
    }
  }

  // ---------------- 每日挑战 ----------------
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function streak() {
    var n = 0;
    var d = new Date();
    for (;;) {
      var key = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      if (progress.daily[key]) { n++; d.setDate(d.getDate() - 1); } else break;
    }
    return n;
  }

  function startDaily() {
    var done = progress.daily[todayKey()];
    if (done) {
      openModal(
        '<h2>🗓️ 今日已通关</h2><p class="m-sub">今天拿到 <b>' + done + '</b> 星 · 连续 ' + streak() + ' 天</p>' +
        '<div class="m-body"><p>可以再玩一次今天的题目热热手（成绩不再计入），或者明天来解锁新的挑战！</p></div>' +
        '<button class="btn btn-primary" id="m-d-go">再玩一次</button>' +
        '<button class="btn btn-glass" id="m-d-no">先不了</button>'
      );
      $('m-d-go').onclick = function () { closeModal(); launchDaily(); };
      $('m-d-no').onclick = closeModal;
      return;
    }
    openModal(
      '<h2>🗓️ 每日挑战</h2><p class="m-sub">' + todayKey() + '</p>' +
      '<div class="m-body"><p>玄机大师正在为你<b>精心出一道难题</b>……</p>' +
      '<p style="text-align:center;font-size:22px;margin-top:10px;letter-spacing:8px" class="grad">● ● ●</p></div>'
    );
    setTimeout(function () {
      var pz = generateDaily();
      closeModal();
      newGame(pz);
    }, 700);
  }

  function generateDaily() {
    var d = new Date();
    var seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    var rng = E.mulberry32(seed);
    var best = null;
    for (var i = 0; i < 12; i++) {
      var full = E.generateFull(rng);
      var p = E.digHolesDeep(full, rng, 23, 3);
      var holes = 0;
      for (var j = 0; j < 81; j++) if (!p[j]) holes++;
      var given = 81 - holes;
      var r = E.solveByTechniques(p);
      var cand = { p: E.gridToString(p), s: E.gridToString(r.grid), c: given, sum: r.sumScore, mx: r.maxScore, tier: '每日特选', st: 5, lv: 'daily', daily: true };
      if (!best || cand.c < best.c || (cand.c === best.c && cand.sum > best.sum)) best = cand;
    }
    return best;
  }

  // ---------------- 暂停 ----------------
  function pauseGame() {
    if (!cur) return;
    cur.paused = true;
    $('pause-mask').classList.remove('hidden');
  }
  function resumeGame() {
    if (!cur) return;
    cur.paused = false;
    $('pause-mask').classList.add('hidden');
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && cur && currentScreen === 'game') pauseGame();
  });

  // ---------------- AI 大师 ----------------
  var aiDrawer = $('ai-drawer');
  var aiChat = $('ai-chat');
  var demoing = false, demoTimer = null;

  function aiSay(html) {
    var div = document.createElement('div');
    div.className = 'ai-msg';
    div.innerHTML = html;
    aiChat.appendChild(div);
    aiChat.scrollTop = aiChat.scrollHeight;
  }
  function aiType(html) {
    var div = document.createElement('div');
    div.className = 'ai-msg';
    aiChat.appendChild(div);
    var i = 0;
    var timer = setInterval(function () {
      i += 7;
      if (i >= html.length) { div.innerHTML = html; clearInterval(timer); aiChat.scrollTop = aiChat.scrollHeight; return; }
      var slice = html.slice(0, i);
      var lastOpen = slice.lastIndexOf('<'), lastClose = slice.lastIndexOf('>');
      if (lastOpen > lastClose) slice = slice.slice(0, lastOpen);
      div.innerHTML = slice;
      aiChat.scrollTop = aiChat.scrollHeight;
    }, 24);
  }

  function openAI() {
    if (!cur || demoing) return;
    aiDrawer.classList.remove('hidden');
    document.body.classList.add('sheet-open');
    aiChat.innerHTML = '';
    aiType(AI.openLine(cur.daily ? 100 : cur.lv));
  }
  function closeAI() {
    if (demoing) stopDemo();
    aiDrawer.classList.add('hidden');
    document.body.classList.remove('sheet-open');
  }

  function aiNextMove() {
    if (!validateBoard()) return { error: true, cell: firstWrongCell() };
    var r = E.solveByTechniques(cur.grid);
    if (!r.solved) return { error: true, cell: firstWrongCell() };
    if (!r.steps.length) return { done: true };
    var step = r.steps[0];
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
    if (mv.done) return;
    var f = mv.step.fills[0];
    pushHistory(f.cell);
    cur.grid[f.cell] = f.digit;
    cur.notes[f.cell] = 0;
    E.peers[f.cell].forEach(function (j) { cur.notes[j] &= ~E.bit(f.digit); });
    cur.hintsUsed++; updateHintBadge();
    cur.combo++; updateCombo();
    SFX.fill(cur.combo);
    waveIfComplete(f.cell);
    aiType(AI.explain(mv.step));
    renderAll(); saveCurrent(); checkWin();
  }

  function aiAuto() {
    if (!cur || demoing) return;
    if (!validateBoard()) { aiType(AI.LINES.stuck[0]); return; }
    demoing = true;
    $('ai-auto').classList.add('hidden');
    $('ai-stop').classList.remove('hidden');
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
      var allDone = true;
      for (var i = 0; i < 81; i++) if (cur.grid[i] !== cur.solution[i]) { allDone = false; break; }
      if (allDone) { stopDemo(); SFX.win(); setTimeout(win, 600); }
    }, 850);
  }

  function stopDemo() {
    if (demoTimer) clearInterval(demoTimer);
    demoTimer = null;
    if (demoing) aiSay('演示暂停。剩下的交给你？');
    demoing = false;
    var auto = $('ai-auto'), stop = $('ai-stop');
    if (auto) auto.classList.remove('hidden');
    if (stop) stop.classList.add('hidden');
    disableInput(false);
  }

  function disableInput(on) {
    document.querySelectorAll('.tool-btn').forEach(function (b) { b.disabled = on; });
    numBtns.forEach(function (b) { b.disabled = on; });
  }

  function highlightWrong(cell) {
    if (cell >= 0) {
      cellEls[cell].classList.add('error', 'wrong-flash');
      setTimeout(function () { cellEls[cell].classList.remove('wrong-flash'); }, 650);
    }
  }
  function flashCells(step) {
    var cells = [];
    (step.fills || []).forEach(function (f) { cells.push(f.cell); });
    ((step.info && step.info.cells) || []).forEach(function (c) { cells.push(c); });
    ((step.info && step.info.spots) || []).forEach(function (c) { cells.push(c); });
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
    if (saved && saved.lv && !saved.daily && !progress.stars[saved.lv]) nextLv = saved.lv;
    $('continue-lv').textContent = nextLv;
    $('continue-tier').textContent = levelData(nextLv).tier;
    $('stat-cleared').textContent = clearedCount();
    $('stat-stars').innerHTML = totalStars() + '<small>/300</small>';
    $('stat-achs').innerHTML = progress.achs.length + '<small>/' + ACHS.length + '</small>';
    $('levels-progress').textContent = clearedCount() + ' / 100 关';
    var sk = streak();
    $('daily-streak').textContent = progress.daily[todayKey()] ? '今日已完成 · 连续 ' + sk + ' 天' : '连续 ' + sk + ' 天';
  }

  var TIER_RANGES = [
    ['入门 · 1-10', 1, 10], ['新手 · 11-25', 11, 25], ['进阶 · 26-45', 26, 45],
    ['高手 · 46-65', 46, 65], ['大师 · 66-85', 66, 85], ['宗师 · 86-99', 86, 99], ['地狱终局', 100, 100]
  ];
  function renderLevels() {
    var grid = $('levels-grid');
    grid.innerHTML = '';
    $('levels-star-count').textContent = '⭐ ' + totalStars() + '/300';
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
            '<span class="lv-num">' + (locked ? '🔒' : lv === 100 ? '终' : lv) + '</span>' +
            '<span class="lv-stars">' + (locked ? '' : starTxt) + '</span>';
          c.onclick = function () { ensureAudio(); startLevel(lv); };
          grid.appendChild(c);
        })(lv);
      }
    });
  }

  function startLevel(lv) {
    var saved = loadJSON(K.current, null);
    if (saved && saved.lv === lv && !saved.daily && !progress.stars[lv]) {
      newGame({ lv: lv, p: saved.p, s: saved.s, c: saved.c, tier: saved.tier, st: saved.st }, { resumeData: saved });
      return;
    }
    if (lv === 100 && !progress.stars[100]) {
      openModal(
        '<h2>👑 地狱终局</h2>' +
        '<div class="m-body"><p>第 100 关：<b>仅 23 个提示</b>，技巧链长达 134 分。</p>' +
        '<p>常规技巧在这里会失效，<b>连 AI 大师也要动用深层推理</b>。</p>' +
        '<p>确认挑战吗？</p></div>' +
        '<button class="btn btn-primary" id="m-go">开始终局挑战</button>' +
        '<button class="btn btn-glass" id="m-cancel">再练练</button>'
      );
      $('m-go').onclick = function () { closeModal(); launchLevel(lv); };
      $('m-cancel').onclick = closeModal;
      return;
    }
    launchLevel(lv);
  }
  function launchLevel(lv) {
    var L = levelData(lv);
    newGame({ lv: lv, p: L.p, s: L.s, c: L.c, tier: L.tier, st: L.st });
  }

  // ---------------- 帮助 / 设置 / 成就 ----------------
  function openHelp() {
    openModal(
      '<h2>📖 玩法说明</h2><div class="m-body">' +
      '<h4>目标</h4><p>每行、每列、每个 3×3 宫，数字 1-9 各出现一次。</p>' +
      '<h4>操作</h4><p>点格子 → 点数字填入；✏️笔记模式可记候选小数字，填入确定数字会自动清理同行列宫的笔记。</p>' +
      '<h4>连击 ⚡</h4><p>连续填对积连击，音调会越来越高；填错、擦除、撤销会清零。8 连击达成「行云流水」成就。</p>' +
      '<h4>提示 💡</h4><p>第一次点：指出该填哪格并讲解原理；再点一次：直接填入。卡住时 AI 会先帮你标红错误。</p>' +
      '<h4>AI 大师 🧙</h4><p>「玄机」用人类解题技巧逐步讲解：唯一余数、隐性唯一、区块摒除、数对、X-Wing、剑鱼、链染、XY-Wing……地狱关他会展示「深层推理」。</p>' +
      '<h4>每日挑战 🗓️</h4><p>每天一道玄机特选难题，完成点亮连击日历。</p>' +
      '<h4>星级</h4><p>⭐通关 · ⭐⭐零提示或快速 · ⭐⭐⭐零提示且达标。通关解锁下一关。</p>' +
      '<h4>难度阶梯（100 关）</h4><p>入门(1-10) → 新手(11-25) → 进阶(26-45) → 高手(46-65) → 大师(66-85) → 宗师(86-99) → 👑地狱终局(100)。</p>' +
      '</div><button class="btn btn-primary" id="m-ok">知道了</button>'
    );
    $('m-ok').onclick = closeModal;
  }

  function openAchs() {
    var html = '<h2>🏆 成就</h2><div class="m-body" style="margin-bottom:4px">';
    ACHS.forEach(function (a) {
      var on = progress.achs.indexOf(a.id) >= 0;
      html += '<div class="ach-row ' + (on ? '' : 'off') + '"><span class="ach-ico">' + a.ico + '</span><div><div class="ach-name">' + a.name + (on ? ' ✅' : '') + '</div><div class="ach-desc">' + a.desc + '</div></div></div>';
    });
    html += '</div><button class="btn btn-primary" id="m-ok">关闭</button>';
    openModal(html);
    $('m-ok').onclick = closeModal;
  }

  function openSettings() {
    var rows = [
      ['sound', '🔊 音效'], ['vibrate', '📳 震动反馈'],
      ['autoCheck', '🚨 即时纠错'], ['highlightSame', '🔆 高亮相同数字']
    ];
    var html = '<h2>⚙️ 设置</h2><div class="m-body">';
    html += '<div class="set-row"><span>🎨 主题</span><div class="theme-dots">' +
      '<button class="theme-dot ' + (settings.theme === 'cloud' ? 'on' : '') + '" data-theme-set="cloud" style="background:linear-gradient(135deg,#7d7aff,#5e5ce6)" title="云白"></button>' +
      '<button class="theme-dot ' + (settings.theme === 'warm' ? 'on' : '') + '" data-theme-set="warm" style="background:linear-gradient(135deg,#f0975c,#e07a3f)" title="暖砂"></button>' +
      '<button class="theme-dot ' + (settings.theme === 'mint' ? 'on' : '') + '" data-theme-set="mint" style="background:linear-gradient(135deg,#3cbf95,#1f9e77)" title="薄荷"></button>' +
      '</div></div>';
    rows.forEach(function (r) {
      html += '<div class="set-row"><span>' + r[1] + '</span><div class="switch ' + (settings[r[0]] ? 'on' : '') + '" data-set="' + r[0] + '"></div></div>';
    });
    html += '<div class="set-row"><span>🗑️ 清空全部进度</span><button class="btn btn-sm btn-glass" id="m-reset">重置</button></div>';
    html += '</div><button class="btn btn-primary" id="m-close-set">完成</button>';
    openModal(html);
    modalRoot.querySelectorAll('.switch').forEach(function (sw) {
      sw.onclick = function () {
        var key = sw.getAttribute('data-set');
        settings[key] = !settings[key];
        sw.classList.toggle('on', settings[key]);
        saveSettings(); renderBoard();
      };
    });
    modalRoot.querySelectorAll('.theme-dot').forEach(function (dot) {
      dot.onclick = function () {
        settings.theme = dot.getAttribute('data-theme-set');
        document.body.dataset.theme = settings.theme;
        saveSettings();
        modalRoot.querySelectorAll('.theme-dot').forEach(function (d2) { d2.classList.toggle('on', d2 === dot); });
      };
    });
    $('m-close-set').onclick = closeModal;
    $('m-reset').onclick = function () {
      openModal('<h2>确定清空？</h2><p class="m-sub">所有进度、星级、成就都会消失。</p>' +
        '<button class="btn btn-primary" id="m-reset-yes">清空</button>' +
        '<button class="btn btn-glass" id="m-reset-no">手滑了</button>');
      $('m-reset-yes').onclick = function () {
        progress = { unlocked: 1, stars: {}, bestTime: {}, achs: [], totalWins: 0, totalHints: 0, daily: {} };
        saveProgress(); clearCurrent(); closeModal(); renderHome(); toast('已重置');
      };
      $('m-reset-no').onclick = closeModal;
    };
  }

  // ---------------- 数字键盘 ----------------
  var numBtns = [];
  (function buildNumpad() {
    var pad = $('numpad');
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
      goScreen(b.getAttribute('data-back'), 'back');
    });
  });
  $('btn-levels').addEventListener('click', function () { goScreen('levels', 'forward'); });
  $('btn-continue').addEventListener('click', function () { ensureAudio(); startLevel(Math.min(progress.unlocked, 100)); });
  $('btn-daily').addEventListener('click', function () { ensureAudio(); startDaily(); });
  $('btn-help').addEventListener('click', openHelp);
  $('btn-settings').addEventListener('click', openSettings);
  $('stat-achs-wrap').addEventListener('click', openAchs);
  $('btn-pause').addEventListener('click', pauseGame);
  $('btn-resume').addEventListener('click', resumeGame);
  $('btn-restart').addEventListener('click', function () {
    if (!cur) return;
    openModal('<h2>重开本关？</h2><p class="m-sub">当前进度与用时将清零。</p>' +
      '<button class="btn btn-primary" id="m-rs">重开</button><button class="btn btn-glass" id="m-rs-no">取消</button>');
    $('m-rs').onclick = function () {
      var lv = cur.lv, daily = cur.daily;
      closeModal();
      if (daily) startDaily(); else launchLevel(lv);
    };
    $('m-rs-no').onclick = closeModal;
  });

  function bindTool(id, fn) { var b = $(id); if (b) b.addEventListener('click', fn); }
  function toggleNote() {
    if (!cur) return;
    cur.noteMode = !cur.noteMode;
    updateToolState();
    toast(cur.noteMode ? '✏️ 笔记模式：写入候选小数字' : '已切回填写模式', 1400);
  }
  bindTool('tool-undo', undo); bindTool('tool-undo-pc', undo);
  bindTool('tool-erase', eraseCell); bindTool('tool-erase-pc', eraseCell);
  bindTool('tool-note', toggleNote); bindTool('tool-note-pc', toggleNote);
  bindTool('tool-hint', doHint); bindTool('tool-hint-pc', doHint);
  bindTool('tool-ai', openAI); bindTool('tool-ai-pc', openAI);

  $('ai-close').addEventListener('click', closeAI);
  $('ai-explain').addEventListener('click', aiExplain);
  $('ai-step').addEventListener('click', aiStep);
  $('ai-auto').addEventListener('click', aiAuto);
  $('ai-stop').addEventListener('click', stopDemo);
  document.addEventListener('pointerdown', ensureAudio, { once: true });

  // 键盘（桌面）
  document.addEventListener('keydown', function (e) {
    if (!cur || currentScreen !== 'game') return;
    if (e.key >= '1' && e.key <= '9') inputDigit(+e.key);
    else if (e.key === 'Backspace' || e.key === 'Delete') eraseCell();
    else if (e.key === 'n' || e.key === 'N') toggleNote();
    else if (e.key === 'z' || e.key === 'Z') undo();
    else if (e.key === 'h' || e.key === 'H') doHint();
    else if (e.key === 'a' || e.key === 'A') { aiDrawer.classList.contains('hidden') ? openAI() : closeAI(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (cur.paused || demoing) return;
      var s = cur.selected < 0 ? 40 : cur.selected;
      var r = Math.floor(s / 9), c = s % 9;
      if (e.key === 'ArrowUp') r = (r + 8) % 9;
      if (e.key === 'ArrowDown') r = (r + 1) % 9;
      if (e.key === 'ArrowLeft') c = (c + 8) % 9;
      if (e.key === 'ArrowRight') c = (c + 1) % 9;
      cur.selected = r * 9 + c;
      renderBoard();
    }
  });

  // 主题初始化
  document.body.dataset.theme = settings.theme || 'cloud';

  // ---------------- 启动 ----------------
  window.__startLevel = function (lv) { startLevel(lv); };
  window.__getCur = function () { return cur; };
  window.__win = function () { win(); };
  window.__startDaily = function () { startDaily(); };
  renderHome();
})();
