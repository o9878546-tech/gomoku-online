const SIZE = 15;
const CELL = 36;
let board = [];
let myColor = null;
let currentTurn = 'black';
let gameActive = false;
let socket = null;

const canvas = document.getElementById('gameBoard');
const ctx = canvas.getContext('2d');

function init() {
    board = Array(SIZE).fill(null).map(() => Array(SIZE).fill(null));
    currentTurn = 'black';
    gameActive = false;
    draw();
}

function draw() {
    canvas.width = CELL * (SIZE + 1);
    canvas.height = CELL * (SIZE + 1);
    ctx.fillStyle = '#DEB887';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#8B7355';
    ctx.lineWidth = 1;
    for (let i = 0; i < SIZE; i++) {
        const p = CELL * (i + 1);
        ctx.beginPath(); ctx.moveTo(p, CELL); ctx.lineTo(p, CELL * SIZE); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(CELL, p); ctx.lineTo(CELL * SIZE, p); ctx.stroke();
    }
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (board[r][c]) drawPiece(r, c, board[r][c]);
        }
    }
    updateStatus();
}

function drawPiece(r, c, color) {
    const x = CELL * (c + 1), y = CELL * (r + 1), rad = CELL * 0.4;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.3, rad * 0.1, x, y, rad);
    if (color === 'black') { g.addColorStop(0, '#666'); g.addColorStop(1, '#000'); }
    else { g.addColorStop(0, '#fff'); g.addColorStop(1, '#bbb'); }
    ctx.fillStyle = g; ctx.fill();
}

function updateStatus() {
    const el = document.getElementById('status');
    if (!gameActive) { el.textContent = '等待开始...'; return; }
    if (currentTurn === myColor) el.textContent = '轮到你了 (' + (myColor === 'black' ? '黑' : '白') + '棋)';
    else el.textContent = '等待对手...';
}

canvas.addEventListener('click', (e) => {
    if (!gameActive || !myColor || currentTurn !== myColor) return;
    const rect = canvas.getBoundingClientRect();
    const c = Math.round((e.clientX - rect.left) / CELL - 1);
    const r = Math.round((e.clientY - rect.top) / CELL - 1);
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE || board[r][c]) return;
    board[r][c] = myColor;
    draw();
    socket.emit('move', { r, c });
});

function connect() {
    socket = io(window.location.origin);
    socket.on('connect', () => console.log('已连接'));
    socket.on('start', (data) => {
        console.log('游戏开始:', data);
        gameActive = true;
        currentTurn = data.turn;
        draw();
    });
    socket.on('move', (data) => {
        console.log('收到落子:', data);
        board[data.r][data.c] = data.color;
        currentTurn = data.turn;
        draw();
    });
    socket.on('end', (data) => {
        console.log('游戏结束:', data);
        gameActive = false;
        alert(data.msg);
    });
}

function createRoom() {
    connect();
    socket.emit('create', (res) => {
        console.log('创建结果:', res);
        if (res.ok) {
            myColor = res.color;
            document.getElementById('roomDisplay').textContent = '房间号: ' + res.id;
            document.getElementById('roomDisplay').style.display = 'block';
            gameActive = true;
            draw();
        }
    });
}

function joinRoom() {
    const id = document.getElementById('roomInput').value.trim().toUpperCase();
    if (!id) return alert('请输入房间号');
    connect();
    socket.emit('join', id, (res) => {
        console.log('加入结果:', res);
        if (res.ok) {
            myColor = res.color;
            document.getElementById('roomDisplay').style.display = 'none';
        } else {
            alert(res.msg);
        }
    });
}

document.addEventListener('DOMContentLoaded', init);
