// ============================================
// 配置常量
// ============================================
const CONFIG = { BOARD_SIZE: 15, CELL_SIZE: 36, PIECE_RATIO: 0.4, AI_DELAY: 300, WIN_COUNT: 5 };

// ============================================
// Socket.IO 联机管理器
// ============================================
class OnlineManager {
    constructor() {
        this.socket = null;
        this.roomId = null;
        this.playerColor = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.onMoveCallback = null;
        this.onGameStartCallback = null;
        this.onGameOverCallback = null;
        this.onPlayerLeftCallback = null;
        this.onChatCallback = null;
        this.onRestartRequestCallback = null;
    }

    // 连接服务器
    connect(serverUrl) {
        if (this.socket) {
            this.socket.disconnect();
        }

        this.socket = io(serverUrl, {
            transports: ['polling', 'websocket'],  // 优先使用 polling，再尝试 websocket
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000,
            forceNew: false,
            multiplex: true,
            upgrade: true,
            rememberUpgrade: true
        });

        this.socket.on('connect', () => {
            this.connected = true;
            this.reconnectAttempts = 0;
            this.updateConnectionUI(true);
            console.log('✅ 已连接到服务器，Socket ID:', this.socket.id);

            // 如果有房间号，尝试重新加入
            if (this.roomId && this.playerColor) {
                this.socket.emit('rejoinRoom', { roomId: this.roomId, color: this.playerColor });
            }
        });

        this.socket.on('disconnect', (reason) => {
            this.connected = false;
            this.updateConnectionUI(false);
            console.log('❌ 已断开连接:', reason);

            if (reason === 'io server disconnect') {
                // 服务器主动断开，需要重新连接
                console.log('🔄 尝试重新连接...');
                this.socket.connect();
            }
        });

        this.socket.on('connect_error', (err) => {
            console.log('⚠️ 连接错误:', err.message);
            this.reconnectAttempts++;
            console.log('重连尝试次数:', this.reconnectAttempts);
        });

        this.socket.on('reconnect', (attemptNumber) => {
            console.log('重连成功，尝试次数:', attemptNumber);
            this.connected = true;
            this.updateConnectionUI(true);
        });

        this.socket.on('reconnect_failed', () => {
            console.log('重连失败');
            alert('与服务器断开连接，请刷新页面重试');
        });

        // 接收游戏状态（断线重连时）
        this.socket.on('gameState', (data) => {
            if (game && data) {
                game.board = data.board;
                game.currentPlayer = data.currentTurn;
                game.gameOver = data.gameOver;
                game.gameStarted = data.gameStarted;

                // 重建历史记录
                game.history = [];
                for (let r = 0; r < 15; r++) {
                    for (let c = 0; c < 15; c++) {
                        if (game.board[r][c]) {
                            game.history.push({ row: r, col: c, player: game.board[r][c] });
                        }
                    }
                }

                game.render();
                game.updateStatus();
            }
        });

        // 游戏开始
        this.socket.on('gameStart', (data) => {
            if (this.onGameStartCallback) this.onGameStartCallback(data);
        });

        // 对手落子
        this.socket.on('moveMade', (data) => {
            if (this.onMoveCallback) this.onMoveCallback(data);
        });

        // 游戏结束
        this.socket.on('gameOver', (data) => {
            if (this.onGameOverCallback) this.onGameOverCallback(data);
        });

        // 对手离开
        this.socket.on('playerLeft', (data) => {
            if (this.onPlayerLeftCallback) this.onPlayerLeftCallback(data);
        });

        // 聊天消息
        this.socket.on('chatMessage', (data) => {
            if (this.onChatCallback) this.onChatCallback(data);
        });

        // 游戏重新开始
        this.socket.on('gameRestart', (data) => {
            if (this.onGameStartCallback) this.onGameStartCallback(data);
        });

        // 重新开始请求
        this.socket.on('restartRequested', (data) => {
            if (this.onRestartRequestCallback) {
                this.onRestartRequestCallback(data);
            } else {
                if (confirm(`对手请求重新开始，是否同意？`)) {
                    this.socket.emit('restartGame', this.roomId);
                }
            }
        });

        // 悔棋相关
        this.socket.on('undoRequested', (data) => {
            const message = data.by === 'black' ? '黑棋' : '白棋';
            if (confirm(`${message}请求悔棋，是否同意？`)) {
                this.socket.emit('respondUndo', this.roomId, true);
            } else {
                this.socket.emit('respondUndo', this.roomId, false);
            }
        });

        this.socket.on('undoAccepted', (data) => {
            if (game && data) {
                // 服务器返回更新后的棋盘状态
                if (data.board) {
                    game.board = data.board;
                    game.currentPlayer = data.currentTurn;
                    // 更新历史记录
                    game.history = [];
                    for (let r = 0; r < 15; r++) {
                        for (let c = 0; c < 15; c++) {
                            if (game.board[r][c]) {
                                game.history.push({ row: r, col: c, player: game.board[r][c] });
                            }
                        }
                    }
                    game.render();
                    game.updateStatus();
                }
            } else if (game) {
                // 兼容旧版本：撤销最后两步
                if (game.history.length >= 2) {
                    const m2 = game.history.pop();
                    game.board[m2.row][m2.col] = null;
                    const m1 = game.history.pop();
                    game.board[m1.row][m1.col] = null;
                    game.currentPlayer = m1.player;
                    game.render();
                    game.updateStatus();
                }
            }
        });

        this.socket.on('undoRejected', () => {
            alert('对手拒绝了悔棋请求');
        });
    }

    // 创建房间
    createRoom(callback) {
        this.socket.emit('createRoom', (response) => {
            if (response.success) {
                this.roomId = response.roomId;
                this.playerColor = response.color;
            }
            callback(response);
        });
    }

    // 加入房间
    joinRoom(roomId, callback) {
        this.socket.emit('joinRoom', roomId, (response) => {
            if (response.success) {
                this.roomId = response.roomId;
                this.playerColor = response.color;
            }
            callback(response);
        });
    }

    // 发送落子
    sendMove(row, col, player) {
        this.socket.emit('makeMove', {
            roomId: this.roomId,
            row, col, player
        });
    }

    // 发送聊天
    sendChat(message) {
        this.socket.emit('chatMessage', {
            roomId: this.roomId,
            message
        });
    }

    // 请求悔棋
    requestUndo() {
        this.socket.emit('requestUndo', this.roomId);
    }

    // 认输
    resign() {
        this.socket.emit('resign', this.roomId);
    }

    // 重新开始
    requestRestart() {
        this.socket.emit('restartGame', this.roomId);
    }

    // 离开房间
    leaveRoom() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.roomId = null;
        this.playerColor = null;
    }

    // 更新连接状态UI
    updateConnectionUI(connected) {
        const dot = document.getElementById('connectionDot');
        const status = document.getElementById('connectionStatus');
        if (dot) {
            dot.className = `status-dot ${connected ? 'online' : 'offline'}`;
        }
        if (status) {
            status.textContent = connected ? '已连接服务器' : '连接断开';
        }
    }
}

// ============================================
// 音效管理器
// ============================================
class AudioManager {
    constructor() {
        this.ctx = null;
        this.settings = { moveSound: true, winSound: true, itemSound: true };
    }

    init() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }

    playMove() {
        if (!this.settings.moveSound) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
        osc.start(this.ctx.currentTime); osc.stop(this.ctx.currentTime + 0.15);
    }

    playWin() {
        if (!this.settings.winSound) return;
        this.init();
        [523, 659, 784, 1047].forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain); gain.connect(this.ctx.destination);
            osc.frequency.value = freq; osc.type = 'sine';
            gain.gain.setValueAtTime(0.2, this.ctx.currentTime + i * 0.15);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + i * 0.15 + 0.3);
            osc.start(this.ctx.currentTime + i * 0.15); osc.stop(this.ctx.currentTime + i * 0.15 + 0.3);
        });
    }

    playItem() {
        if (!this.settings.itemSound) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(600, this.ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);
        osc.start(this.ctx.currentTime); osc.stop(this.ctx.currentTime + 0.4);
    }

    playError() {
        if (!this.settings.itemSound) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.type = 'sawtooth'; osc.frequency.value = 150;
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
        osc.start(this.ctx.currentTime); osc.stop(this.ctx.currentTime + 0.3);
    }
}

// ============================================
// AI引擎
// ============================================
class AIEngine {
    constructor(difficulty) {
        this.difficulty = difficulty;
        this.size = CONFIG.BOARD_SIZE;
        this.SCORES = { FIVE: 1000000, FOUR: 100000, BLOCKED_FOUR: 10000, THREE: 10000, BLOCKED_THREE: 1000, TWO: 1000, BLOCKED_TWO: 100 };
    }

    getMove(board, player) {
        switch (this.difficulty) {
            case 'easy': return this.getEasyMove(board, player);
            case 'medium': return this.getMediumMove(board, player);
            case 'hard': return this.getHardMove(board, player);
            default: return this.getMediumMove(board, player);
        }
    }

    getEasyMove(board, player) {
        const opponent = player === 'black' ? 'white' : 'black';
        if (Math.random() < 0.7) {
            for (let r = 0; r < this.size; r++) {
                for (let c = 0; c < this.size; c++) {
                    if (board[r][c] === null) {
                        board[r][c] = opponent;
                        if (this.checkWin(board, r, c, opponent)) { board[r][c] = null; return { row: r, col: c }; }
                        board[r][c] = null;
                    }
                }
            }
        }
        const moves = this.getNearbyMoves(board);
        return moves.length > 0 ? moves[Math.floor(Math.random() * moves.length)] : this.getRandomMove(board);
    }

    getMediumMove(board, player) {
        let bestScore = -Infinity, bestMove = null;
        const moves = this.getNearbyMoves(board);
        for (const move of moves) {
            board[move.row][move.col] = player;
            const attack = this.evaluatePosition(board, move.row, move.col, player);
            board[move.row][move.col] = null;
            board[move.row][move.col] = player === 'black' ? 'white' : 'black';
            const defend = this.evaluatePosition(board, move.row, move.col, player === 'black' ? 'white' : 'black');
            board[move.row][move.col] = null;
            const score = attack * 1.1 + defend;
            if (score > bestScore) { bestScore = score; bestMove = move; }
        }
        return bestMove || this.getRandomMove(board);
    }

    getHardMove(board, player) {
        const depth = 4;
        let bestScore = -Infinity, bestMove = null;
        const moves = this.getPrioritizedMoves(board, player);
        for (const move of moves.slice(0, 15)) {
            board[move.row][move.col] = player;
            const score = -this.alphaBeta(board, depth - 1, -Infinity, Infinity, player === 'black' ? 'white' : 'black');
            board[move.row][move.col] = null;
            if (score > bestScore) { bestScore = score; bestMove = move; }
        }
        return bestMove || this.getMediumMove(board, player);
    }

    alphaBeta(board, depth, alpha, beta, player) {
        if (depth === 0) return this.evaluateBoard(board, player);
        const moves = this.getPrioritizedMoves(board, player);
        if (moves.length === 0) return 0;
        for (const move of moves.slice(0, 10)) {
            board[move.row][move.col] = player;
            if (this.checkWin(board, move.row, move.col, player)) { board[move.row][move.col] = null; return this.SCORES.FIVE; }
            const score = -this.alphaBeta(board, depth - 1, -beta, -alpha, player === 'black' ? 'white' : 'black');
            board[move.row][move.col] = null;
            if (score >= beta) return beta;
            if (score > alpha) alpha = score;
        }
        return alpha;
    }

    getPrioritizedMoves(board, player) {
        const moves = this.getNearbyMoves(board);
        const opponent = player === 'black' ? 'white' : 'black';
        return moves.map(move => {
            let priority = 0;
            board[move.row][move.col] = player;
            if (this.checkWin(board, move.row, move.col, player)) priority += 1000000;
            board[move.row][move.col] = null;
            board[move.row][move.col] = opponent;
            if (this.checkWin(board, move.row, move.col, opponent)) priority += 500000;
            board[move.row][move.col] = null;
            priority += this.evaluatePosition(board, move.row, move.col, player);
            priority += this.evaluatePosition(board, move.row, move.col, opponent) * 0.9;
            const center = Math.floor(this.size / 2);
            priority += (this.size - (Math.abs(move.row - center) + Math.abs(move.col - center))) * 10;
            return { ...move, priority };
        }).sort((a, b) => b.priority - a.priority);
    }

    getNearbyMoves(board, range = 2) {
        const moves = new Set();
        for (let r = 0; r < this.size; r++) {
            for (let c = 0; c < this.size; c++) {
                if (board[r][c]) {
                    for (let dr = -range; dr <= range; dr++) {
                        for (let dc = -range; dc <= range; dc++) {
                            const nr = r + dr, nc = c + dc;
                            if (nr >= 0 && nr < this.size && nc >= 0 && nc < this.size && !board[nr][nc]) moves.add(`${nr},${nc}`);
                        }
                    }
                }
            }
        }
        return Array.from(moves).map(m => { const [r, c] = m.split(',').map(Number); return { row: r, col: c }; });
    }

    getRandomMove(board) {
        const empty = [];
        for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) if (!board[r][c]) empty.push({ row: r, col: c });
        return empty.length > 0 ? empty[Math.floor(Math.random() * empty.length)] : null;
    }

    evaluatePosition(board, row, col, player) {
        let total = 0;
        for (const [dr, dc] of [[0,1],[1,0],[1,1],[1,-1]]) total += this.scoreLine(this.getLine(board, row, col, dr, dc, player));
        return total;
    }

    getLine(board, row, col, dr, dc, player) {
        const line = [], opp = player === 'black' ? 'white' : 'black';
        for (let i = -4; i <= 4; i++) {
            const r = row + dr * i, c = col + dc * i;
            if (r < 0 || r >= this.size || c < 0 || c >= this.size) line.push('wall');
            else if (board[r][c] === player) line.push('self');
            else if (board[r][c] === opp) line.push('opp');
            else line.push('empty');
        }
        return line;
    }

    scoreLine(line) {
        const patterns = {
            'self,self,self,self,self': this.SCORES.FIVE,
            'empty,self,self,self,self,empty': this.SCORES.FOUR,
            'opp,self,self,self,self,empty': this.SCORES.BLOCKED_FOUR,
            'empty,self,self,self,self,opp': this.SCORES.BLOCKED_FOUR,
            'empty,self,self,self,empty': this.SCORES.THREE,
            'empty,self,self,empty,self,empty': this.SCORES.THREE,
            'empty,self,empty,self,self,empty': this.SCORES.THREE,
            'opp,self,self,self,empty,empty': this.SCORES.BLOCKED_THREE,
            'empty,empty,self,self,self,opp': this.SCORES.BLOCKED_THREE,
            'empty,self,self,empty': this.SCORES.TWO,
        };
        const lineStr = line.join(',');
        let score = 0;
        for (const [p, v] of Object.entries(patterns)) if (lineStr.includes(p)) score += v;
        return score;
    }

    evaluateBoard(board, player) {
        let score = 0;
        const opp = player === 'black' ? 'white' : 'black';
        for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) {
            if (board[r][c] === player) score += this.evaluatePosition(board, r, c, player);
            else if (board[r][c] === opp) score -= this.evaluatePosition(board, r, c, opp);
        }
        return score;
    }

    checkWin(board, row, col, player) {
        for (const [dr, dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
            let count = 1;
            for (let i = 1; i < 5; i++) { const r = row + dr * i, c = col + dc * i; if (r >= 0 && r < this.size && c >= 0 && c < this.size && board[r][c] === player) count++; else break; }
            for (let i = 1; i < 5; i++) { const r = row - dr * i, c = col - dc * i; if (r >= 0 && r < this.size && c >= 0 && c < this.size && board[r][c] === player) count++; else break; }
            if (count >= 5) return true;
        }
        return false;
    }
}

// ============================================
// 数据管理器
// ============================================
class DataManager {
    constructor() { this.storageKey = 'gomoku_pro_data'; this.data = this.load(); }
    getDefaultData() {
        return { totalGames: 0, wins: 0, losses: 0, draws: 0, currentStreak: 0, maxStreak: 0, totalPlayTime: 0, pvpWins: 0, pveWins: 0, onlineWins: 0, pveEasyWins: 0, pveMediumWins: 0, pveHardWins: 0, aiBeaten: { easy: false, medium: false, hard: false }, achievements: [], games: [] };
    }
    load() { try { const s = localStorage.getItem(this.storageKey); return s ? { ...this.getDefaultData(), ...JSON.parse(s) } : this.getDefaultData(); } catch { return this.getDefaultData(); } }
    save() { try { localStorage.setItem(this.storageKey, JSON.stringify(this.data)); } catch (e) { console.warn('保存失败:', e); } }
    recordGame(result, mode, difficulty, playTime) {
        this.data.totalGames++; this.data.totalPlayTime += playTime;
        if (result === 'win') {
            this.data.wins++; this.data.currentStreak++;
            if (this.data.currentStreak > this.data.maxStreak) this.data.maxStreak = this.data.currentStreak;
            if (mode === 'pvp') this.data.pvpWins++;
            if (mode === 'online') this.data.onlineWins++;
            if (mode === 'pve') {
                this.data.pveWins++;
                if (difficulty === 'easy') { this.data.pveEasyWins++; this.data.aiBeaten.easy = true; }
                if (difficulty === 'medium') { this.data.pveMediumWins++; this.data.aiBeaten.medium = true; }
                if (difficulty === 'hard') { this.data.pveHardWins++; this.data.aiBeaten.hard = true; }
            }
        } else if (result === 'lose') { this.data.losses++; this.data.currentStreak = 0; }
        else { this.data.draws++; this.data.currentStreak = 0; }
        this.data.games.push({ result, mode, difficulty, playTime, date: new Date().toISOString() });
        if (this.data.games.length > 100) this.data.games = this.data.games.slice(-100);
        this.save();
    }
    getWinRate() { return this.data.totalGames === 0 ? 0 : Math.round((this.data.wins / this.data.totalGames) * 100); }
    reset() { this.data = this.getDefaultData(); this.save(); }
}

// ============================================
// 成就系统
// ============================================
class AchievementSystem {
    constructor(dm) {
        this.dm = dm;
        this.achievements = [
            { id: 'first_win', name: '初出茅庐', desc: '获得首次胜利', icon: '🌟', check: () => this.dm.data.wins >= 1 },
            { id: 'streak_3', name: '三连胜', desc: '连续获胜3局', icon: '🔥', check: () => this.dm.data.maxStreak >= 3 },
            { id: 'streak_5', name: '连胜之王', desc: '连续获胜5局', icon: '👑', check: () => this.dm.data.maxStreak >= 5 },
            { id: 'streak_10', name: '势不可挡', desc: '连续获胜10局', icon: '💎', check: () => this.dm.data.maxStreak >= 10 },
            { id: 'games_10', name: '棋道入门', desc: '完成10局游戏', icon: '♟️', check: () => this.dm.data.totalGames >= 10 },
            { id: 'games_50', name: '棋道进阶', desc: '完成50局游戏', icon: '🎯', check: () => this.dm.data.totalGames >= 50 },
            { id: 'games_100', name: '百场大师', desc: '完成100局游戏', icon: '🏅', check: () => this.dm.data.totalGames >= 100 },
            { id: 'ai_beater', name: 'AI克星', desc: '击败高级AI', icon: '🤖', check: () => this.dm.data.aiBeaten.hard },
            { id: 'all_ai', name: '全能棋手', desc: '击败所有难度AI', icon: '🏆', check: () => this.dm.data.aiBeaten.easy && this.dm.data.aiBeaten.medium && this.dm.data.aiBeaten.hard },
            { id: 'online_win', name: '网络高手', desc: '联机对战获胜', icon: '🌐', check: () => this.dm.data.onlineWins >= 1 },
            { id: 'pvp_master', name: '对弈高手', desc: '人人对战获胜10次', icon: '👥', check: () => this.dm.data.pvpWins >= 10 },
            { id: 'win_rate_60', name: '常胜将军', desc: '胜率超过60%（至少20局）', icon: '⭐', check: () => this.dm.data.totalGames >= 20 && this.dm.getWinRate() >= 60 },
        ];
    }
    check() {
        const newAch = [];
        for (const a of this.achievements) {
            if (!this.dm.data.achievements.includes(a.id) && a.check()) { this.dm.data.achievements.push(a.id); newAch.push(a); }
        }
        if (newAch.length > 0) this.dm.save();
        return newAch;
    }
    showUnlock(achievements) {
        if (achievements.length === 0) return;
        document.getElementById('achievement-unlock-content').innerHTML = achievements.map(a => `<div style="margin:16px 0;"><div style="font-size:48px;">${a.icon}</div><div style="font-size:20px;font-weight:700;margin:8px 0;">${a.name}</div><div style="color:var(--text-secondary);">${a.desc}</div></div>`).join('');
        showModal('modal-achievement');
    }
}

// ============================================
// 游戏主引擎
// ============================================
class Game {
    constructor() {
        this.board = Array.from({ length: CONFIG.BOARD_SIZE }, () => Array(CONFIG.BOARD_SIZE).fill(null));
        this.currentPlayer = 'black'; this.gameOver = false; this.history = [];
        this.mode = 'pvp'; this.difficulty = 'medium'; this.aiDifficulty = { black: null, white: 'medium' };
        this.items = { bomb: 1, freeze: 1, double: 1, shield: 1 }; this.shieldedPieces = new Set();
        this.activeItem = null; this.freezeTurns = 0; this.doubleMovesLeft = 0; this.startTime = 0; this.aiThinking = false;
        this.audio = new AudioManager(); this.dataManager = new DataManager(); this.achievementSystem = new AchievementSystem(this.dataManager);
        this.online = new OnlineManager(); this.ai = null; this.winLine = null;
        this.canvas = document.getElementById('gameBoard'); this.ctx = this.canvas.getContext('2d');
        this.loadSettings(); this.initParticles();
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
        window.addEventListener('resize', () => this.resizeBoard());
        this.setupOnlineCallbacks();
    }

    // 设置联机回调
    setupOnlineCallbacks() {
        this.online.onGameStartCallback = (data) => {
            this.gameStarted = true;
            this.updateStatus('游戏开始！');
            this.updatePlayerNames();

            // 如果从等待页面进入游戏页面
            if (document.getElementById('page-waiting').classList.contains('active')) {
                showPage('page-game');
            }
        };

        this.online.onMoveCallback = (data) => {
            if (data.row !== undefined && data.col !== undefined) {
                // 防止重复落子
                if (!this.board[data.row][data.col]) {
                    this.board[data.row][data.col] = data.player;
                    this.history.push({ row: data.row, col: data.col, player: data.player });
                    this.audio.playMove();
                }

                if (data.nextTurn) {
                    this.currentPlayer = data.nextTurn;
                }

                this.updateStatus();
                this.render();

                // 如果是观众模式，更新显示
                if (this.online.playerColor === 'spectator') {
                    this.updateStatus(`当前: ${this.currentPlayer === 'black' ? '黑棋' : '白棋'}落子`);
                }
            }
        };

        this.online.onGameOverCallback = (data) => {
            this.gameOver = true;

            if (data.winLine) {
                this.winLine = data.winLine;
                this.render();
            }

            const playTime = Math.floor((Date.now() - this.startTime) / 1000);
            let title, result;

            if (data.winner === 'draw') {
                title = '🤝 平局';
                result = 'draw';
            } else if (data.winner === this.online.playerColor) {
                title = '🎉 你赢了！';
                result = 'win';
                this.audio.playWin();
            } else if (this.online.playerColor === 'spectator') {
                title = `${data.winner === 'black' ? '黑棋' : '白棋'}获胜！`;
                result = 'spectator';
            } else {
                title = '😢 你输了';
                result = 'lose';
            }

            // 记录游戏结果（观众不记录）
            if (this.online.playerColor !== 'spectator') {
                this.dataManager.recordGame(result, 'online', null, playTime);
                const newAch = this.achievementSystem.check();
                if (newAch.length > 0) setTimeout(() => this.achievementSystem.showUnlock(newAch), 1000);
            }

            let desc = '';
            if (data.disconnected) {
                desc = '对手断线';
            } else if (data.resigned) {
                desc = `${data.resignedBy === 'black' ? '黑棋' : '白棋'}认输`;
            } else {
                desc = `用时: ${this.formatTime(playTime)}`;
            }

            document.getElementById('win-title').textContent = title;
            document.getElementById('win-desc').textContent = desc;

            setTimeout(() => showModal('modal-win'), data.winLine ? 800 : 300);
        };

        this.online.onPlayerLeftCallback = (data) => {
            // 游戏结束由服务器处理，这里只做UI更新
            if (data.playersCount === 0) {
                addChatMessage('系统', '房间已空', 'system');
            }
        };

        this.online.onChatCallback = (data) => {
            addChatMessage(data.sender, data.message, data.color);
        };

        this.online.onRestartRequestCallback = (data) => {
            const playerName = data.by === 'black' ? '黑棋' : '白棋';
            if (confirm(`${playerName}请求重新开始，是否同意？`)) {
                this.online.requestRestart();
            }
        };
    }

    loadSettings() {
        try {
            const s = localStorage.getItem('gomoku_settings');
            if (s) { const p = JSON.parse(s); Object.assign(this.audio.settings, p); if (p.theme) document.body.setAttribute('data-theme', p.theme); }
        } catch {}
        this.updateSettingsUI();
    }

    saveSettings() {
        localStorage.setItem('gomoku_settings', JSON.stringify({ ...this.audio.settings, theme: document.body.getAttribute('data-theme') || 'default' }));
    }

    updateSettingsUI() {
        Object.entries(this.audio.settings).forEach(([k, v]) => {
            const el = document.getElementById(`toggle-${k.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
            if (el) el.classList.toggle('active', v);
        });
    }

    initParticles() {
        const c = document.getElementById('particles');
        for (let i = 0; i < 30; i++) {
            const p = document.createElement('div'); p.className = 'particle';
            p.style.left = Math.random() * 100 + '%'; p.style.top = Math.random() * 100 + '%';
            p.style.animationDelay = Math.random() * 6 + 's'; p.style.animationDuration = (4 + Math.random() * 4) + 's';
            c.appendChild(p);
        }
    }

    startNewGame(mode, diff1, diff2) {
        this.mode = mode;
        this.board = Array.from({ length: CONFIG.BOARD_SIZE }, () => Array(CONFIG.BOARD_SIZE).fill(null));
        this.currentPlayer = 'black'; this.gameOver = false; this.history = [];
        this.items = { bomb: 1, freeze: 1, double: 1, shield: 1 }; this.shieldedPieces = new Set();
        this.activeItem = null; this.freezeTurns = 0; this.doubleMovesLeft = 0;
        this.startTime = Date.now(); this.aiThinking = false; this.winLine = null;

        if (mode === 'pve') {
            this.difficulty = diff1 || 'medium'; this.ai = new AIEngine(this.difficulty);
            this.aiDifficulty = { black: null, white: this.difficulty };
        } else if (mode === 'eve') {
            this.aiDifficulty = { black: diff1 || 'medium', white: diff2 || 'hard' }; this.ai = null;
        } else {
            this.ai = null; this.aiDifficulty = { black: null, white: null };
        }

        // 联机模式隐藏道具栏
        document.getElementById('itemsBar').style.display = (mode === 'online' || mode === 'eve') ? 'none' : 'flex';
        document.getElementById('btnChat').style.display = mode === 'online' ? 'inline-flex' : 'none';

        this.updatePlayerNames(); this.updateItemsUI(); this.resizeBoard(); this.render();
        showPage('page-game');
        if (mode === 'eve') setTimeout(() => this.aiMove(), CONFIG.AI_DELAY);
    }

    startOnlineGame(color) {
        this.mode = 'online';
        this.board = Array.from({ length: CONFIG.BOARD_SIZE }, () => Array(CONFIG.BOARD_SIZE).fill(null));
        this.currentPlayer = 'black';
        this.gameOver = false;
        this.history = [];
        this.items = { bomb: 0, freeze: 0, double: 0, shield: 0 };
        this.startTime = Date.now();
        this.winLine = null;
        this.gameStarted = false;

        // 更新UI显示
        document.getElementById('itemsBar').style.display = 'none';
        document.getElementById('btnChat').style.display = 'inline-flex';

        // 观众模式隐藏操作按钮
        if (color === 'spectator') {
            document.querySelector('.game-controls').style.display = 'none';
        } else {
            document.querySelector('.game-controls').style.display = 'flex';
        }

        this.updatePlayerNames();
        this.resizeBoard();
        this.render();

        // 如果不是创建房间后等待的情况，才显示游戏页面
        if (!document.getElementById('page-waiting').classList.contains('active')) {
            showPage('page-game');
        }
    }

    updatePlayerNames() {
        const bn = document.getElementById('black-name'), wn = document.getElementById('white-name');
        if (this.mode === 'pvp') {
            bn.textContent = '黑棋'; wn.textContent = '白棋';
        } else if (this.mode === 'pve') {
            bn.textContent = '你';
            wn.textContent = `AI(${this.difficulty === 'easy' ? '初级' : this.difficulty === 'medium' ? '中级' : '高级'})`;
        } else if (this.mode === 'eve') {
            bn.textContent = `AI-${this.aiDifficulty.black === 'easy' ? '初' : this.aiDifficulty.black === 'medium' ? '中' : '高'}`;
            wn.textContent = `AI-${this.aiDifficulty.white === 'easy' ? '初' : this.aiDifficulty.white === 'medium' ? '中' : '高'}`;
        } else if (this.mode === 'online') {
            if (this.online.playerColor === 'black') {
                bn.textContent = '你(黑棋)'; wn.textContent = '对手(白棋)';
            } else if (this.online.playerColor === 'white') {
                bn.textContent = '对手(黑棋)'; wn.textContent = '你(白棋)';
            } else {
                bn.textContent = '黑棋'; wn.textContent = '白棋';
            }
        }
    }

    resizeBoard() {
        const container = document.getElementById('boardContainer');
        const maxW = Math.min(window.innerWidth - 80, 560);
        const cell = Math.floor(maxW / (CONFIG.BOARD_SIZE + 1));
        CONFIG.CELL_SIZE = cell;
        this.canvas.width = cell * (CONFIG.BOARD_SIZE + 1);
        this.canvas.height = cell * (CONFIG.BOARD_SIZE + 1);
        container.style.padding = Math.max(12, cell * 0.5) + 'px';
        this.render();
    }

    render() {
        const ctx = this.ctx, size = CONFIG.BOARD_SIZE, cell = CONFIG.CELL_SIZE;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const style = getComputedStyle(document.body);
        const bg = style.getPropertyValue('--board-bg').trim(), ln = style.getPropertyValue('--board-line').trim();
        ctx.fillStyle = bg; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.strokeStyle = ln; ctx.lineWidth = 1;
        for (let i = 0; i < size; i++) {
            const p = cell * (i + 1);
            ctx.beginPath(); ctx.moveTo(p, cell); ctx.lineTo(p, cell * size); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cell, p); ctx.lineTo(cell * size, p); ctx.stroke();
        }
        const stars = size === 15 ? [[3,3],[3,7],[3,11],[7,3],[7,7],[7,11],[11,3],[11,7],[11,11]] : [[3,3],[3,9],[9,3],[9,9],[6,6]];
        ctx.fillStyle = ln;
        stars.forEach(([r, c]) => { ctx.beginPath(); ctx.arc(cell * (c + 1), cell * (r + 1), cell * 0.12, 0, Math.PI * 2); ctx.fill(); });
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (this.board[r][c]) this.drawPiece(r, c, this.board[r][c]);
        this.shieldedPieces.forEach(key => {
            const [r, c] = key.split(',').map(Number);
            ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cell * (c + 1), cell * (r + 1), cell * CONFIG.PIECE_RATIO + 3, 0, Math.PI * 2); ctx.stroke();
        });
        if (this.history.length > 0) {
            const last = this.history[this.history.length - 1];
            ctx.fillStyle = last.player === 'black' ? '#fff' : '#f00';
            ctx.beginPath(); ctx.arc(cell * (last.col + 1), cell * (last.row + 1), cell * 0.1, 0, Math.PI * 2); ctx.fill();
        }
        if (this.winLine) this.drawWinLine(this.winLine);
        this.canvas.style.cursor = this.activeItem ? 'crosshair' : 'pointer';
    }

    drawPiece(row, col, player) {
        const ctx = this.ctx, cell = CONFIG.CELL_SIZE, x = cell * (col + 1), y = cell * (row + 1), r = cell * CONFIG.PIECE_RATIO;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
        if (player === 'black') { g.addColorStop(0, '#666'); g.addColorStop(1, '#000'); }
        else { g.addColorStop(0, '#fff'); g.addColorStop(1, '#bbb'); }
        ctx.fillStyle = g; ctx.fill();
    }

    drawWinLine(line) {
        const ctx = this.ctx, cell = CONFIG.CELL_SIZE;
        ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(cell * (line.startCol + 1), cell * (line.startRow + 1)); ctx.lineTo(cell * (line.endCol + 1), cell * (line.endRow + 1)); ctx.stroke();
        ctx.shadowBlur = 0;
    }

    handleClick(e) {
        if (this.gameOver || this.aiThinking) return;
        if (this.mode === 'eve') return;
        if (this.mode === 'pve' && this.currentPlayer !== 'black') return;

        // 联机模式检查
        if (this.mode === 'online') {
            // 观众不能落子
            if (this.online.playerColor === 'spectator') return;
            // 不是自己的回合不能落子
            if (this.currentPlayer !== this.online.playerColor) return;
            // 游戏未开始不能落子
            if (!this.gameStarted) return;
        }

        const rect = this.canvas.getBoundingClientRect();
        const col = Math.round((e.clientX - rect.left) / CONFIG.CELL_SIZE - 1);
        const row = Math.round((e.clientY - rect.top) / CONFIG.CELL_SIZE - 1);
        if (row < 0 || row >= CONFIG.BOARD_SIZE || col < 0 || col >= CONFIG.BOARD_SIZE) return;

        if (this.activeItem) { this.useItemOnPosition(this.activeItem, row, col); return; }
        if (this.board[row][col]) return;
        this.makeMove(row, col);
    }

    makeMove(row, col) {
        if (this.board[row][col]) return false;
        this.board[row][col] = this.currentPlayer;
        this.history.push({ row, col, player: this.currentPlayer });
        this.audio.playMove(); this.render();

        // 联机模式发送落子
        if (this.mode === 'online') {
            this.online.sendMove(row, col, this.currentPlayer);
        }

        const win = this.checkWin(row, col, this.currentPlayer);
        if (win) {
            this.gameOver = true; this.winLine = win; this.render();
            if (this.mode !== 'online') {
                const playTime = Math.floor((Date.now() - this.startTime) / 1000);
                const result = this.mode === 'pve' ? (this.currentPlayer === 'black' ? 'win' : 'lose') : 'win';
                this.dataManager.recordGame(result, this.mode, this.difficulty, playTime);
                const newAch = this.achievementSystem.check();
                if (newAch.length > 0) setTimeout(() => this.achievementSystem.showUnlock(newAch), 1000);
                this.audio.playWin();
                setTimeout(() => {
                    const title = this.mode === 'pve' ? (this.currentPlayer === 'black' ? '🎉 你赢了！' : '😢 AI获胜') : `🎉 ${this.currentPlayer === 'black' ? '黑棋' : '白棋'}获胜！`;
                    document.getElementById('win-title').textContent = title;
                    document.getElementById('win-desc').textContent = `用时: ${this.formatTime(playTime)}`;
                    showModal('modal-win');
                }, 800);
            }
            return true;
        }

        if (this.history.length === CONFIG.BOARD_SIZE ** 2) {
            this.gameOver = true;
            if (this.mode !== 'online') {
                this.dataManager.recordGame('draw', this.mode, this.difficulty, Math.floor((Date.now() - this.startTime) / 1000));
                setTimeout(() => { document.getElementById('win-title').textContent = '🤝 平局'; document.getElementById('win-desc').textContent = '势均力敌！'; showModal('modal-win'); }, 500);
            }
            return true;
        }

        if (this.doubleMovesLeft > 0) { this.doubleMovesLeft--; if (this.doubleMovesLeft > 0) { this.updateStatus('再下一子！'); return false; } }

        this.currentPlayer = this.currentPlayer === 'black' ? 'white' : 'black';
        this.updateStatus();
        if (this.mode === 'pve' && this.currentPlayer === 'white') setTimeout(() => this.aiMove(), CONFIG.AI_DELAY);
        else if (this.mode === 'eve') setTimeout(() => this.aiMove(), CONFIG.AI_DELAY);
        return false;
    }

    aiMove() {
        if (this.gameOver) return;
        this.aiThinking = true; this.updateStatus('AI思考中...');
        const diff = this.mode === 'eve' ? this.aiDifficulty[this.currentPlayer] : this.difficulty;
        const ai = new AIEngine(diff);
        const move = ai.getMove(this.board, this.currentPlayer);
        if (move) { this.aiThinking = false; this.makeMove(move.row, move.col); }
    }

    checkWin(row, col, player) {
        for (const [dr, dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
            let count = 1, sr = row, sc = col, er = row, ec = col;
            for (let i = 1; i < 5; i++) { const r = row + dr * i, c = col + dc * i; if (r >= 0 && r < CONFIG.BOARD_SIZE && c >= 0 && c < CONFIG.BOARD_SIZE && this.board[r][c] === player) { count++; er = r; ec = c; } else break; }
            for (let i = 1; i < 5; i++) { const r = row - dr * i, c = col - dc * i; if (r >= 0 && r < CONFIG.BOARD_SIZE && c >= 0 && c < CONFIG.BOARD_SIZE && this.board[r][c] === player) { count++; sr = r; sc = c; } else break; }
            if (count >= 5) return { startRow: sr, startCol: sc, endRow: er, endCol: ec };
        }
        return null;
    }

    updateStatus(text) {
        const s = document.getElementById('gameStatus');
        if (text) { s.textContent = text; return; }
        if (this.gameOver) return;
        const name = this.currentPlayer === 'black' ? '黑棋' : '白棋';
        if (this.mode === 'pve') s.textContent = this.currentPlayer === 'black' ? '你的回合' : 'AI思考中...';
        else if (this.mode === 'eve') s.textContent = `${name} (AI) 落子`;
        else if (this.mode === 'online') s.textContent = this.currentPlayer === this.online.playerColor ? '你的回合' : '等待对手...';
        else s.textContent = `${name}落子`;
        document.getElementById('player-black').classList.toggle('active', this.currentPlayer === 'black');
        document.getElementById('player-white').classList.toggle('active', this.currentPlayer === 'white');
    }

    undo() {
        if (this.history.length === 0 || this.gameOver || this.mode === 'eve') return;
        if (this.mode === 'online') { this.online.requestUndo(); return; }
        if (this.mode === 'pve') {
            if (this.history.length < 2) return;
            const m2 = this.history.pop(); this.board[m2.row][m2.col] = null;
            const m1 = this.history.pop(); this.board[m1.row][m1.col] = null;
            this.currentPlayer = 'black';
        } else {
            const m = this.history.pop(); this.board[m.row][m.col] = null; this.currentPlayer = m.player;
        }
        this.winLine = null; this.updateStatus(); this.render();
    }

    useItem(type) {
        if (this.gameOver || this.aiThinking || this.mode === 'eve' || this.mode === 'online' || this.items[type] <= 0) return;
        if (type === 'freeze') { this.items.freeze--; this.freezeTurns = 2; this.audio.playItem(); document.getElementById('freezeOverlay').classList.add('show'); this.updateItemsUI(); return; }
        if (type === 'double') { this.items.double--; this.doubleMovesLeft = 2; this.audio.playItem(); this.updateItemsUI(); this.updateStatus('双落子：可以连下两子！'); return; }
        this.activeItem = type; this.updateItemsUI(); this.updateStatus(type === 'bomb' ? '点击要轰炸的位置' : '点击要保护的棋子');
    }

    useItemOnPosition(type, row, col) {
        if (type === 'bomb') this.useBomb(row, col);
        else if (type === 'shield') this.useShield(row, col);
        this.activeItem = null; this.updateItemsUI(); this.updateStatus();
    }

    useBomb(row, col) {
        if (this.items.bomb <= 0) return;
        this.items.bomb--; this.audio.playItem();
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const r = row + dr, c = col + dc;
            if (r >= 0 && r < CONFIG.BOARD_SIZE && c >= 0 && c < CONFIG.BOARD_SIZE) {
                const key = `${r},${c}`;
                if (this.board[r][c] && !this.shieldedPieces.has(key)) {
                    this.history = this.history.filter(h => !(h.row === r && h.col === c));
                    this.board[r][c] = null;
                }
            }
        }
        this.showExplosion(row, col); this.render(); this.updateItemsUI();
    }

    useShield(row, col) {
        if (this.items.shield <= 0 || !this.board[row][col]) { this.audio.playError(); this.activeItem = null; this.updateItemsUI(); this.updateStatus(); return; }
        this.items.shield--; this.shieldedPieces.add(`${row},${col}`); this.audio.playItem(); this.render(); this.updateItemsUI();
    }

    showExplosion(row, col) {
        const container = document.getElementById('boardContainer'), cell = CONFIG.CELL_SIZE;
        const exp = document.createElement('div'); exp.className = 'explosion';
        exp.style.left = (cell * (col + 1) - 60) + 'px'; exp.style.top = (cell * (row + 1) - 60) + 'px';
        for (let i = 0; i < 20; i++) {
            const p = document.createElement('div'); p.className = 'explosion-particle';
            p.style.background = ['#ff4444','#ff8800','#ffcc00','#ff6600'][Math.floor(Math.random() * 4)];
            const a = (Math.PI * 2 / 20) * i, d = 30 + Math.random() * 40;
            p.style.transform = `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px)`;
            exp.appendChild(p);
        }
        container.appendChild(exp); setTimeout(() => exp.remove(), 600);
    }

    updateItemsUI() {
        ['bomb', 'freeze', 'double', 'shield'].forEach(item => {
            document.getElementById(`item-${item}`).classList.toggle('disabled', this.items[item] <= 0);
            document.getElementById(`item-${item}`).classList.toggle('active', this.activeItem === item);
            document.getElementById(`${item}-count`).textContent = this.items[item];
        });
    }

    formatTime(s) { return `${Math.floor(s / 60)}分${s % 60}秒`; }
}

// ============================================
// 全局变量和函数
// ============================================
let game;

function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if (id === 'page-stats') renderStats();
    if (id === 'page-achievements') renderAchievements();
}

function startGame(mode, d1, d2) { if (!game) game = new Game(); game.startNewGame(mode, d1, d2); }
function undoMove() { if (game) game.undo(); }
function restartGame() {
    if (game) {
        if (game.mode === 'online') { game.online.requestRestart(); }
        else { game.startNewGame(game.mode, game.aiDifficulty.black || game.difficulty, game.aiDifficulty.white); }
    }
    closeModal('modal-win');
}

function confirmExit() {
    document.getElementById('confirm-title').textContent = '确认退出';
    document.getElementById('confirm-desc').textContent = '当前游戏进度将丢失';
    document.getElementById('confirm-yes').onclick = () => {
        closeModal('modal-confirm');
        if (game && game.mode === 'online') { game.online.leaveRoom(); }
        showPage('page-menu');
    };
    showModal('modal-confirm');
}

function confirmResign() {
    if (game.gameOver) return;
    document.getElementById('confirm-title').textContent = '确认认输';
    document.getElementById('confirm-desc').textContent = '确定要认输吗？';
    document.getElementById('confirm-yes').onclick = () => {
        closeModal('modal-confirm');
        if (game.mode === 'online') { game.online.resign(); }
        else {
            game.gameOver = true;
            game.dataManager.recordGame('lose', game.mode, game.difficulty, Math.floor((Date.now() - game.startTime) / 1000));
            game.achievementSystem.check();
            document.getElementById('win-title').textContent = '🏳️ 认输'; document.getElementById('win-desc').textContent = '下次再接再厉！';
            showModal('modal-win');
        }
    };
    showModal('modal-confirm');
}

function confirmResetStats() {
    document.getElementById('confirm-title').textContent = '重置数据';
    document.getElementById('confirm-desc').textContent = '确定要重置所有统计数据吗？';
    document.getElementById('confirm-yes').onclick = () => { closeModal('modal-confirm'); game.dataManager.reset(); renderStats(); };
    showModal('modal-confirm');
}

function toggleSound() { if (!game) return; game.audio.settings.moveSound = !game.audio.settings.moveSound; game.saveSettings(); }
function setTheme(t, el) { document.body.setAttribute('data-theme', t); document.querySelectorAll('.theme-option').forEach(e => e.classList.remove('active')); el.classList.add('active'); if (game) { game.saveSettings(); game.render(); } }
function toggleSetting(k, el) { if (!game) game = new Game(); game.audio.settings[k] = !game.audio.settings[k]; el.classList.toggle('active'); game.saveSettings(); }
function showModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

// ============================================
// 联机功能函数
// ============================================
let isConnecting = false;

function getServerUrl() {
    // 生产环境使用当前域名，本地开发使用 localhost
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3000';
    }
    // Railway 部署时使用当前域名
    return window.location.origin;
}

function ensureConnection(callback) {
    if (!game) game = new Game();

    if (game.online.socket && game.online.connected) {
        callback();
        return;
    }

    if (isConnecting) {
        alert('正在连接中，请稍候...');
        return;
    }

    isConnecting = true;
    game.online.connect(getServerUrl());

    // 等待连接成功
    const checkConnection = setInterval(() => {
        if (game.online.connected) {
            clearInterval(checkConnection);
            isConnecting = false;
            callback();
        }
    }, 100);

    // 连接超时
    setTimeout(() => {
        if (!game.online.connected) {
            clearInterval(checkConnection);
            isConnecting = false;
            alert('连接服务器失败，请检查网络后重试');
        }
    }, 5000);
}

function createRoom() {
    ensureConnection(() => {
        game.online.createRoom((res) => {
            if (res.success) {
                document.getElementById('waitingRoomCode').textContent = res.roomId;
                showPage('page-waiting');
                // 等待对手加入后再开始游戏
            } else {
                alert('创建房间失败：' + (res.error || '未知错误'));
            }
        });
    });
}

function joinRoom() {
    const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
    if (!code || code.length < 4) { alert('请输入有效的房间号'); return; }

    ensureConnection(() => {
        game.online.joinRoom(code, (res) => {
            if (res.success) {
                if (res.isSpectator) {
                    // 观众模式
                    game.startOnlineGame('spectator');
                    // 同步当前棋盘状态
                    if (res.gameState) {
                        game.board = res.gameState.board;
                        game.currentPlayer = res.gameState.currentTurn;
                        game.render();
                        game.updateStatus();
                    }
                } else {
                    game.startOnlineGame(res.color);
                }
            } else {
                alert('加入失败：' + (res.error || '房间不存在'));
            }
        });
    });
}

function leaveRoom() {
    if (game && game.online) {
        game.online.leaveRoom();
        // 重新初始化socket以便下次使用
        game.online.socket = null;
        game.online.connected = false;
    }
    showPage('page-online');
}

function toggleChat() {
    document.getElementById('chatContainer').classList.toggle('show');
}

function sendChat() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg || !game || !game.online.roomId) return;
    game.online.sendChat(msg);
    addChatMessage('我', msg, game.online.playerColor);
    input.value = '';
}

function addChatMessage(sender, message, color) {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');

    if (color === 'system') {
        div.className = 'chat-msg system';
        div.textContent = message;
    } else {
        div.className = 'chat-msg';
        div.innerHTML = `<span class="sender ${color || ''}">${sender}:</span>${escapeHtml(message)}`;
    }

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// 统计和成就渲染
// ============================================
function renderStats() {
    if (!game) game = new Game();
    const d = game.dataManager.data;
    document.getElementById('statsGrid').innerHTML = `
        <div class="stat-card"><div class="stat-value">${d.totalGames}</div><div class="stat-label">总对局数</div></div>
        <div class="stat-card"><div class="stat-value">${game.dataManager.getWinRate()}%</div><div class="stat-label">胜率</div></div>
        <div class="stat-card"><div class="stat-value">${d.wins}</div><div class="stat-label">胜利场次</div></div>
        <div class="stat-card"><div class="stat-value">${d.maxStreak}</div><div class="stat-label">最高连胜</div></div>
        <div class="stat-card"><div class="stat-value">${d.currentStreak}</div><div class="stat-label">当前连胜</div></div>
        <div class="stat-card"><div class="stat-value">${game.formatTime(d.totalPlayTime)}</div><div class="stat-label">总游戏时长</div></div>
        <div class="stat-card"><div class="stat-value">${d.onlineWins}</div><div class="stat-label">联机胜利</div></div>
        <div class="stat-card"><div class="stat-value">${d.pveWins}</div><div class="stat-label">人机胜利</div></div>
    `;
}

function renderAchievements() {
    if (!game) game = new Game();
    const unlocked = game.dataManager.data.achievements;
    document.getElementById('achievementGrid').innerHTML = game.achievementSystem.achievements.map(a => `
        <div class="achievement-card ${unlocked.includes(a.id) ? 'unlocked' : 'locked'}"><div class="ach-icon">${a.icon}</div><div class="ach-name">${a.name}</div><div class="ach-desc">${a.desc}</div></div>
    `).join('');
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    game = new Game();

    // 添加连接测试按钮
    const testBtn = document.createElement('button');
    testBtn.textContent = '测试连接';
    testBtn.className = 'btn btn-secondary btn-small';
    testBtn.style.position = 'fixed';
    testBtn.style.bottom = '10px';
    testBtn.style.left = '10px';
    testBtn.style.zIndex = '1000';
    testBtn.onclick = () => {
        if (game && game.online) {
            const status = game.online.connected ? '✅ 已连接' : '❌ 未连接';
            const socketId = game.online.socket ? game.online.socket.id : '无';
            alert(`连接状态: ${status}\nSocket ID: ${socketId}`);
        } else {
            alert('游戏未初始化');
        }
    };
    document.body.appendChild(testBtn);
});