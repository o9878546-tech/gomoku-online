// ====== 配置 ======
const SIZE = 15, CELL = 36;

// ====== 状态 ======
let board, turn, mode, myColor, gameActive, gameOver, history, startTime;
let items, activeItem, shielded;
let ai, aiDiff, aiThinking;
let socket, roomId;
let settings = { moveSound: true, winSound: true, theme: 'default' };
let stats = loadStats();

// ====== Canvas ======
const canvas = document.getElementById('gameBoard');
const ctx = canvas.getContext('2d');

// ====== 初始化 ======
function init() {
    loadSettings();
    applyTheme();
}

// ====== 页面切换 ======
function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if (id === 'page-stats') renderStats();
    if (id === 'page-ach') renderAch();
}

// ====== 音效 ======
let audioCtx;
function playSound(freq, dur, type) {
    if (!settings.moveSound && type === 'move') return;
    if (!settings.winSound && type === 'win') return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.frequency.value = freq; osc.type = 'sine';
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
        osc.start(); osc.stop(audioCtx.currentTime + dur);
    } catch(e) {}
}
function playMoveSound() { playSound(600, 0.1, 'move'); }
function playWinSound() { [523,659,784,1047].forEach((f,i) => setTimeout(() => playSound(f, 0.3, 'win'), i*150)); }

// ====== 设置 ======
function loadSettings() {
    try { const s = localStorage.getItem('gomoku_settings'); if (s) Object.assign(settings, JSON.parse(s)); } catch(e) {}
    if (settings.theme) document.body.setAttribute('data-theme', settings.theme);
}
function saveSettings() { localStorage.setItem('gomoku_settings', JSON.stringify(settings)); }
function setTheme(t, el) {
    settings.theme = t;
    document.body.setAttribute('data-theme', t);
    document.querySelectorAll('.theme-opt').forEach(e => e.classList.remove('active'));
    el.classList.add('active');
    saveSettings();
}
function applyTheme() { document.body.setAttribute('data-theme', settings.theme); }
function toggleOpt(k, el) {
    settings[k] = !settings[k];
    el.classList.toggle('on');
    saveSettings();
}
function toggleSound() {
    settings.moveSound = !settings.moveSound;
    saveSettings();
}

// ====== 统计 ======
function loadStats() {
    try { const s = localStorage.getItem('gomoku_stats'); return s ? JSON.parse(s) : defaultStats(); } catch(e) { return defaultStats(); }
}
function defaultStats() { return { total:0, wins:0, losses:0, draws:0, streak:0, maxStreak:0, time:0, online:0, pve:0, pvp:0, ach:[] }; }
function saveStats() { localStorage.setItem('gomoku_stats', JSON.stringify(stats)); }
function resetStats() { stats = defaultStats(); saveStats(); renderStats(); }
function recordGame(result, m) {
    stats.total++;
    if (result === 'win') { stats.wins++; stats.streak++; if (stats.streak > stats.maxStreak) stats.maxStreak = stats.streak; if (m==='online') stats.online++; if (m==='pve') stats.pve++; if (m==='pvp') stats.pvp++; }
    else if (result === 'lose') { stats.losses++; stats.streak = 0; }
    else { stats.draws++; stats.streak = 0; }
    saveStats();
    checkAch();
}
function renderStats() {
    const d = stats;
    document.getElementById('statGrid').innerHTML = `
        <div class="stat-card"><div class="val">${d.total}</div><div class="label">总对局</div></div>
        <div class="stat-card"><div class="val">${d.total?Math.round(d.wins/d.total*100):0}%</div><div class="label">胜率</div></div>
        <div class="stat-card"><div class="val">${d.wins}</div><div class="label">胜利</div></div>
        <div class="stat-card"><div class="val">${d.maxStreak}</div><div class="label">最高连胜</div></div>
        <div class="stat-card"><div class="val">${d.online}</div><div class="label">联机胜利</div></div>
        <div class="stat-card"><div class="val">${d.pve}</div><div class="label">人机胜利</div></div>
    `;
}

// ====== 成就 ======
const ACHS = [
    { id:'first', name:'初出茅庐', desc:'获得首胜', icon:'🌟', check:()=>stats.wins>=1 },
    { id:'streak3', name:'三连胜', desc:'连胜3局', icon:'🔥', check:()=>stats.maxStreak>=3 },
    { id:'streak5', name:'连胜之王', desc:'连胜5局', icon:'👑', check:()=>stats.maxStreak>=5 },
    { id:'games10', name:'棋道入门', desc:'完成10局', icon:'♟️', check:()=>stats.total>=10 },
    { id:'games50', name:'棋道进阶', desc:'完成50局', icon:'🎯', check:()=>stats.total>=50 },
    { id:'online1', name:'网络高手', desc:'联机获胜', icon:'🌐', check:()=>stats.online>=1 },
    { id:'pvp10', name:'对弈高手', desc:'人人获胜10次', icon:'👥', check:()=>stats.pvp>=10 },
];
function checkAch() {
    const newAch = ACHS.filter(a => !stats.ach.includes(a.id) && a.check());
    newAch.forEach(a => stats.ach.push(a.id));
    if (newAch.length) { saveStats(); showAchUnlock(newAch); }
}
function showAchUnlock(achs) {
    document.getElementById('achContent').innerHTML = achs.map(a => `<div style="margin:12px 0"><div style="font-size:40px">${a.icon}</div><div style="font-weight:700">${a.name}</div><div style="color:var(--text2)">${a.desc}</div></div>`).join('');
    showModal('modalAch');
}
function renderAch() {
    document.getElementById('achGrid').innerHTML = ACHS.map(a => `
        <div class="ach-card ${stats.ach.includes(a.id)?'unlocked':'locked'}"><div class="ach-icon">${a.icon}</div><div class="ach-name">${a.name}</div><div class="ach-desc">${a.desc}</div></div>
    `).join('');
}

// ====== 游戏核心 ======
function newGame(m, diff) {
    mode = m; aiDiff = diff || 'medium';
    board = Array(SIZE).fill(null).map(() => Array(SIZE).fill(null));
    turn = 'black'; gameActive = true; gameOver = false;
    history = []; startTime = Date.now(); aiThinking = false;
    items = { bomb:1, freeze:1, shield:1 }; activeItem = null; shielded = new Set();
    myColor = m === 'online' ? myColor : (m === 'pve' ? 'black' : null);
    document.getElementById('itemsBar').style.display = (m === 'online') ? 'none' : 'flex';
    updateNames(); updateItemsUI(); resizeBoard(); render();
    showPage('page-game');
    if (m === 'pve' && turn === 'white') setTimeout(aiMove, 300);
}

function startPVP() { newGame('pvp'); }
function startPVE(diff) { newGame('pve', diff); }

function resizeBoard() {
    const maxW = Math.min(window.innerWidth - 70, 540);
    const cell = Math.floor(maxW / (SIZE + 1));
    canvas.width = cell * (SIZE + 1);
    canvas.height = cell * (SIZE + 1);
}

function render() {
    const cell = canvas.width / (SIZE + 1);
    const style = getComputedStyle(document.body);
    ctx.fillStyle = style.getPropertyValue('--board-bg').trim();
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = style.getPropertyValue('--board-line').trim();
    ctx.lineWidth = 1;
    for (let i = 0; i < SIZE; i++) {
        const p = cell * (i + 1);
        ctx.beginPath(); ctx.moveTo(p, cell); ctx.lineTo(p, cell*SIZE); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cell, p); ctx.lineTo(cell*SIZE, p); ctx.stroke();
    }
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c]) drawPiece(r, c, board[r][c], cell);
    if (history.length) {
        const last = history[history.length-1];
        ctx.fillStyle = last.p === 'black' ? '#fff' : '#f00';
        ctx.beginPath(); ctx.arc(cell*(last.c+1), cell*(last.r+1), cell*0.1, 0, Math.PI*2); ctx.fill();
    }
    shielded.forEach(k => {
        const [r,c] = k.split(',').map(Number);
        ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cell*(c+1), cell*(r+1), cell*0.45, 0, Math.PI*2); ctx.stroke();
    });
}

function drawPiece(r, c, color, cell) {
    const x = cell*(c+1), y = cell*(r+1), rad = cell*0.4;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI*2);
    const g = ctx.createRadialGradient(x-rad*0.3, y-rad*0.3, rad*0.1, x, y, rad);
    if (color==='black') { g.addColorStop(0,'#666'); g.addColorStop(1,'#000'); }
    else { g.addColorStop(0,'#fff'); g.addColorStop(1,'#bbb'); }
    ctx.fillStyle = g; ctx.fill();
}

function updateNames() {
    const b = document.getElementById('nameBlack'), w = document.getElementById('nameWhite');
    if (mode==='pvp') { b.textContent='黑棋'; w.textContent='白棋'; }
    else if (mode==='pve') { b.textContent='你'; w.textContent='AI('+aiDiff+')'; }
    else if (mode==='online') {
        b.textContent = myColor==='black'?'你(黑)':'对手(黑)';
        w.textContent = myColor==='white'?'你(白)':'对手(白)';
    }
}

function updateStatus(txt) {
    const el = document.getElementById('status');
    if (txt) { el.textContent = txt; return; }
    if (gameOver) return;
    if (mode==='pve') el.textContent = turn==='black'?'你的回合':'AI思考中...';
    else if (mode==='online') el.textContent = turn===myColor?'你的回合':'等待对手...';
    else el.textContent = (turn==='black'?'黑棋':'白棋')+'落子';
    document.getElementById('pBlack').classList.toggle('active', turn==='black');
    document.getElementById('pWhite').classList.toggle('active', turn==='white');
}

// ====== 点击 ======
canvas.addEventListener('click', (e) => {
    if (gameOver || aiThinking) return;
    if (mode==='pve' && turn!=='black') return;
    if (mode==='online' && turn!==myColor) return;
    const cell = canvas.width / (SIZE + 1);
    const rect = canvas.getBoundingClientRect();
    const c = Math.round((e.clientX - rect.left) / cell - 1);
    const r = Math.round((e.clientY - rect.top) / cell - 1);
    if (r<0||r>=SIZE||c<0||c>=SIZE) return;
    if (activeItem) { useItemOn(activeItem, r, c); return; }
    if (board[r][c]) return;
    makeMove(r, c);
});

function makeMove(r, c) {
    if (board[r][c]) return false;
    board[r][c] = turn;
    history.push({r, c, p: turn});
    playMoveSound(); render();

    if (mode === 'online') {
        socket.emit('move', { r, c });
    }

    const win = checkWin(r, c, turn);
    if (win) {
        gameOver = true; render();
        if (mode !== 'online') {
            const t = Math.floor((Date.now()-startTime)/1000);
            const result = mode==='pve'?(turn==='black'?'win':'lose'):'win';
            recordGame(result, mode);
            playWinSound();
            setTimeout(() => {
                document.getElementById('winTitle').textContent = result==='win'?'🎉 你赢了！':'😢 对手获胜';
                document.getElementById('winDesc').textContent = '用时: '+fmtTime(t);
                showModal('modalWin');
            }, 500);
        }
        return true;
    }

    if (history.length === SIZE*SIZE) {
        gameOver = true;
        if (mode!=='online') recordGame('draw', mode);
        return true;
    }

    if (mode !== 'online') {
        turn = turn==='black'?'white':'black';
        updateStatus();
        if (mode==='pve' && turn==='white') setTimeout(aiMove, 300);
    }
    return false;
}

function checkWin(r, c, p) {
    for (const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
        let cnt = 1;
        for (let i=1;i<5;i++) { const nr=r+dr*i,nc=c+dc*i; if (nr>=0&&nr<SIZE&&nc>=0&&nc<SIZE&&board[nr][nc]===p) cnt++; else break; }
        for (let i=1;i<5;i++) { const nr=r-dr*i,nc=c-dc*i; if (nr>=0&&nr<SIZE&&nc>=0&&nc<SIZE&&board[nr][nc]===p) cnt++; else break; }
        if (cnt>=5) return true;
    }
    return false;
}

function undoMove() {
    if (!history.length || gameOver || mode==='online') return;
    if (mode==='pve') {
        if (history.length<2) return;
        const m2=history.pop(); board[m2.r][m2.c]=null;
        const m1=history.pop(); board[m1.r][m1.c]=null;
        turn='black';
    } else {
        const m=history.pop(); board[m.r][m.c]=null; turn=m.p;
    }
    updateStatus(); render();
}

function restartGame() {
    if (mode==='online' && socket) socket.emit('restart', roomId);
    else newGame(mode, aiDiff);
    closeModal('modalWin');
}

function confirmExit() {
    document.getElementById('cfmTitle').textContent='确认退出';
    document.getElementById('cfmDesc').textContent='当前进度将丢失';
    document.getElementById('cfmYes').onclick=()=>{ closeModal('cfmConfirm'); if(mode==='online') onlineLeave(); showPage('page-menu'); };
    showModal('cfmConfirm');
}

function confirmResign() {
    if (gameOver) return;
    document.getElementById('cfmTitle').textContent='确认认输';
    document.getElementById('cfmDesc').textContent='确定要认输吗？';
    document.getElementById('cfmYes').onclick=()=>{ closeModal('cfmConfirm'); doResign(); };
    showModal('cfmConfirm');
}

function doResign() {
    if (mode==='online') { socket.emit('resign', roomId); return; }
    gameOver = true;
    recordGame('lose', mode);
    document.getElementById('winTitle').textContent='🏳️ 认输';
    document.getElementById('winDesc').textContent='下次再接再厉！';
    showModal('modalWin');
}

function fmtTime(s) { return Math.floor(s/60)+'分'+(s%60)+'秒'; }

// ====== 道具 ======
function useItem(type) {
    if (gameOver || aiThinking || mode==='online' || items[type]<=0) return;
    if (type==='freeze') { items.freeze--; playSound(400,0.2,'move'); turn=turn==='black'?'white':'black'; updateStatus(); render(); updateItemsUI(); return; }
    activeItem = type; updateItemsUI();
    updateStatus(type==='bomb'?'点击要轰炸的位置':'点击要保护的棋子');
}

function useItemOn(type, r, c) {
    if (type==='bomb') useBomb(r,c);
    else if (type==='shield') useShield(r,c);
    activeItem = null; updateItemsUI(); updateStatus();
}

function useBomb(r, c) {
    if (items.bomb<=0) return;
    items.bomb--; playSound(200,0.3,'move');
    for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
        const nr=r+dr, nc=c+dc;
        if (nr>=0&&nr<SIZE&&nc>=0&&nc<SIZE&&board[nr][nc]&&!shielded.has(nr+','+nc)) {
            history = history.filter(h => !(h.r===nr&&h.c===nc));
            board[nr][nc] = null;
        }
    }
    render(); updateItemsUI();
}

function useShield(r, c) {
    if (items.shield<=0||!board[r][c]) { activeItem=null; updateItemsUI(); updateStatus(); return; }
    items.shield--; shielded.add(r+','+c); playSound(500,0.2,'move'); render(); updateItemsUI();
}

function updateItemsUI() {
    ['bomb','freeze','shield'].forEach(k => {
        document.getElementById('item-'+k).classList.toggle('disabled', items[k]<=0);
        document.getElementById(k[0]+'-c').textContent = items[k]; // bug fix below
    });
    document.getElementById('bomb-c').textContent = items.bomb;
    document.getElementById('freeze-c').textContent = items.freeze;
    document.getElementById('shield-c').textContent = items.shield;
}

// ====== AI ======
function aiMove() {
    if (gameOver) return;
    aiThinking = true; updateStatus('AI思考中...');
    setTimeout(() => {
        const move = getAIMove();
        if (move) { aiThinking = false; makeMove(move.r, move.c); }
    }, 200);
}

function getAIMove() {
    const moves = getNearby();
    if (!moves.length) return {r:7,c:7};
    if (aiDiff==='easy') return moves[Math.floor(Math.random()*moves.length)];
    let best = null, bestS = -Infinity;
    for (const m of moves) {
        board[m.r][m.c] = 'white';
        const atk = evalPos(m.r, m.c, 'white');
        board[m.r][m.c] = null;
        board[m.r][m.c] = 'black';
        const def = evalPos(m.r, m.c, 'black');
        board[m.r][m.c] = null;
        const s = atk*1.1 + def;
        if (s > bestS) { bestS = s; best = m; }
    }
    return best || moves[0];
}

function getNearby(range) {
    range = range || 2;
    const set = new Set();
    for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) if (board[r][c]) {
        for (let dr=-range;dr<=range;dr++) for (let dc=-range;dc<=range;dc++) {
            const nr=r+dr, nc=c+dc;
            if (nr>=0&&nr<SIZE&&nc>=0&&nc<SIZE&&!board[nr][nc]) set.add(nr+','+nc);
        }
    }
    return Array.from(set).map(s => { const [r,c]=s.split(',').map(Number); return {r,c}; });
}

function evalPos(r, c, p) {
    let s = 0;
    for (const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]) s += evalLine(r,c,dr,dc,p);
    return s;
}

function evalLine(r, c, dr, dc, p) {
    const opp = p==='black'?'white':'black';
    const line = [];
    for (let i=-4;i<=4;i++) {
        const nr=r+dr*i, nc=c+dc*i;
        if (nr<0||nr>=SIZE||nc<0||nc>=SIZE) line.push('w');
        else if (board[nr][nc]===p) line.push('s');
        else if (board[nr][nc]===opp) line.push('o');
        else line.push('e');
    }
    const ls = line.join(',');
    let score = 0;
    if (ls.includes('s,s,s,s,s')) score += 1000000;
    if (ls.includes('e,s,s,s,s,e')) score += 100000;
    if (ls.includes('e,s,s,s,e')) score += 10000;
    if (ls.includes('e,s,s,e')) score += 1000;
    return score;
}

// ====== 弹窗 ======
function showModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

// ====== 联机 ======
function getServerUrl() {
    if (window.location.hostname==='localhost'||window.location.hostname==='127.0.0.1') return 'http://localhost:3000';
    return window.location.origin;
}

function onlineCreate() {
    socket = io(getServerUrl());
    socket.on('connect', () => console.log('已连接'));
    socket.on('start', (data) => {
        console.log('游戏开始');
        gameActive = true; turn = data.turn;
        showPage('page-game');
        newGame('online');
    });
    socket.on('move', (data) => {
        console.log('收到落子:', data);
        board[data.r][data.c] = data.color;
        turn = data.turn;
        history.push({r:data.r, c:data.c, p:data.color});
        playMoveSound(); render(); updateStatus();
    });
    socket.on('gameOver', (data) => {
        gameOver = true;
        if (data.winner === myColor) { recordGame('win','online'); playWinSound(); }
        else recordGame('lose','online');
        document.getElementById('winTitle').textContent = data.winner===myColor?'🎉 你赢了！':'😢 你输了';
        document.getElementById('winDesc').textContent = data.msg || '';
        showModal('modalWin');
    });
    socket.on('end', (data) => { gameOver=true; alert(data.msg); });
    socket.on('restart', () => { newGame('online'); });

    socket.emit('create', (res) => {
        console.log('创建结果:', res);
        if (res.ok) {
            roomId = res.id; myColor = res.color;
            document.getElementById('waitRoomCode').textContent = res.id;
            showPage('page-waiting');
        }
    });
}

function onlineJoin() {
    const id = document.getElementById('roomInput').value.trim().toUpperCase();
    if (!id) return alert('请输入房间号');
    socket = io(getServerUrl());
    socket.on('connect', () => console.log('已连接'));
    socket.on('start', (data) => {
        console.log('游戏开始');
        gameActive = true; turn = data.turn;
        showPage('page-game');
        newGame('online');
    });
    socket.on('move', (data) => {
        console.log('收到落子:', data);
        board[data.r][data.c] = data.color;
        turn = data.turn;
        history.push({r:data.r, c:data.c, p:data.color});
        playMoveSound(); render(); updateStatus();
    });
    socket.on('gameOver', (data) => {
        gameOver = true;
        if (data.winner === myColor) { recordGame('win','online'); playWinSound(); }
        else recordGame('lose','online');
        document.getElementById('winTitle').textContent = data.winner===myColor?'🎉 你赢了！':'😢 你输了';
        document.getElementById('winDesc').textContent = data.msg || '';
        showModal('modalWin');
    });
    socket.on('end', (data) => { gameOver=true; alert(data.msg); });
    socket.on('restart', () => { newGame('online'); });

    socket.emit('join', id, (res) => {
        console.log('加入结果:', res);
        if (res.ok) { roomId = id; myColor = res.color; }
        else alert(res.msg);
    });
}

function onlineLeave() {
    if (socket) { socket.disconnect(); socket = null; }
    showPage('page-online');
}

// ====== 窗口大小 ======
window.addEventListener('resize', () => { if (gameActive) { resizeBoard(); render(); } });

// ====== 启动 ======
document.addEventListener('DOMContentLoaded', init);
