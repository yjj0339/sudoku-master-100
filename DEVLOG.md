# 数独大师 100 关 · DEVLOG

- 日期：2026-10-02（v1）/ 2026-10-03（v2「琉璃」设计系统）
- 目标：中文数独闯关游戏，100 关难度递进，终关地狱级；AI 大师逐步讲解/代打；多层提示；笔记/撤销/统计；手机竖屏 + 电脑宽屏双端，浅色 UI。
- 技术路线：纯 HTML/CSS/JS 零依赖；关卡离线预生成（种子确定性 + 技巧评分筛选），运行时技巧求解器做提示与 AI 解说。
- 交付地址：https://yjj0339.github.io/sudoku-master-100/

## v2 更新（10-03，用户要求更高端优雅的动画与设计 + 电脑端）
- 全量重写 CSS「琉璃」设计系统：iOS 动效曲线 cubic-bezier(.32,.72,0,1)/spring(.34,1.56,.64,1)、玻璃拟态（backdrop-blur+saturate+hairline）、环境光斑背景、渐变文字 hero。
- iOS push 页面转场（前进推入/返回视差）；AI 抽屉改 sheet（grabber + 打开时 #app 后景 scale(0.945) 内收圆角）。
- 玩法增强：连击 combo（音调递增+浮字+成就「行云流水」）、行/列/宫填满波纹光效、通关 confetti + 时间数字滚动、每日挑战（浏览器端确定性生成，连击日历 streak）、三套浅色主题（云白/暖砂/薄荷）、成就面板（12 个）。
- 电脑端 ≥920px 三栏：左侧信息面板（大计时/连击/工具+快捷键角标）、中央大棋盘、右侧 3×3 键盘；数字键/方向键/Z/N/H/A 快捷键。
- v2 修的坑：
  1. flex 列布局里 `margin:0 auto` 的 grid 容器收缩为 fit-content（937px）压扁棋盘 → 必须 `width:100%`。
  2. 每日挑战 generateDaily 同步生成 36 候选阻塞主线程 ~2.4s，转场清理 setTimeout 被推迟 → 出题降到 12 候选×3 轮（~400ms）。排查时 setTimeout「看起来不执行」，实为注册太晚+观察窗口不足。
  3. .lv-cell.current 呼吸动画会让 Playwright 判定元素不稳定，测试要 force tap。

## v1 记录（10-02）
- 引擎：13 种人类技巧求解器；coloring 跨连通分量误删 bug 修复（Rule1 须同分量+无奇圈）。
- 100 关离线生成，难度曲线 given 50→23、maxScore 1→15；终关 23 提示/134 分。
- v1 三坑：挖洞提示数语义（given=81-洞数）、随机盘低阶技巧为主需大候选池抓右尾、pointerdown 同步弹窗被合成 click 误关（openModal 350ms 保护）。

## v2.1 稳定性（10-03，用户反馈"玩不了"）
- **主因：v1 旧存档让 v2 崩溃**——startLevel 恢复逻辑读到 v1 格式（无 p/s 字段）parsePuzzle(undefined) 抛异常。修复：存档加 `v:2` 版本号，恢复前校验 v===2 且 p/s 完整，try-catch 兜底落回全新开局。线上模拟旧存档验证通过。
- 兼容性：CSS 5 处 `color-mix`（2023 特性）→ 各主题静态 `--glow` 变量；8 处 `dvh` 全部加 `vh` 回退行（旧浏览器忽略新单位保留旧值）。JS 本身 ES5 风格无兼容问题。
- PWA：manifest.json + PIL 生成图标(192/512) + sw.js（cache-first+后台刷新，CACHE 版本号需随发布递增）。断网重载验证可玩——正面解决 github.io 线路不稳。
- 全局错误兜底：index.html head 内联 window.addEventListener('error') 显示友好 toast（捕获脚本加载失败）。
- 教训：**升级本地存储格式必须带版本号守卫**；面向国内用户的 GH Pages 项目，PWA 缓存是网络不稳的根治手段。

## 收尾
- [x] v1+v2+v2.1 均已部署，线上 200 + MIME 正常；二维码 qr-live.png；导航主页最新卡片（v2 描述）；记忆 shudu-sudoku-master-100；手机+桌面截图 shots/。
