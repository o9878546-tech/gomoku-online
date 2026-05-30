const socket = io();

// 游戏状态
let gameState = {
  roomId: null,
  playerIndex: null,
  board: Array(15).fill().map(() => Array(15).fill(0)),
  currentPlayer: 0,
  gameStarted: false,
  gameOver: false
};

// Canvas 设置
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const cellSize = canvas.width / 16;

// DOM 元素
const createRoomBtn = document.getElementById('createRoom');
const joinRoomBtn = document.getElementById('joinRoom');
const roomIdInput = document.getElementById('roomIdInput');
const roomIdDisplay = document.getElementById('roomIdDisplay');
const statusDisplay = document.getElementById('status');
const currentPlayerDisplay = document.getElementById('currentPlayer');
const restartBtn = document.getElementById('restart');

// 初始化棋盘
function drawBoard() {
  // 清空画布
  ctx.fillStyle = '#f0d9b5';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 画网格线
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;

  for (let i = 0; i < 15; i++) {
    // 横线
    ctx.beginPath();
    ctx.moveTo(cellSize, cellSize * (i + 1));
    ctx.lineTo(cellSize * 15, cellSize * (i + 1));
    ctx.stroke();

    // 竖线
    ctx.beginPath();
    ctx.moveTo(cellSize * (i + 1), cellSize);
    ctx.lineTo(cellSize * (i + 1), cellSize * 15);
    ctx.stroke();
  }

  // 画星位
  const starPoints = [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]];
  starPoints.forEach(([x, y]) => {
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(cellSize * (x + 1), cellSize * (y + 1), 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // 画棋子
  for (let i = 0; i < 15; i++) {
    for (let j = 0; j < 15; j++) {
      if (gameState.board[i][j] !== 0) {
        drawPiece(i, j, gameState.board[i][j]);
      }
    }
  }
}

function drawPiece(row, col, player) {
  const x = cellSize * (col + 1);
  const y = cellSize * (row + 1);
  const radius = cellSize * 0.4;

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);

  if (player === 1) {
    // 黑棋
    const gradient = ctx.createRadialGradient(x - 3, y - 3, 3, x, y, radius);
    gradient.addColorStop(0, '#666');
    gradient.addColorStop(1, '#000');
    ctx.fillStyle = gradient;
  } else {
    // 白棋
    const gradient = ctx.createRadialGradient(x - 3, y - 3, 3, x, y, radius);
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(1, '#ccc');
    ctx.fillStyle = gradient;
  }

  ctx.fill();
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// 点击落子
canvas.addEventListener('click', (e) => {
  if (!gameState.gameStarted || gameState.gameOver) return;
  if (gameState.playerIndex !== gameState.currentPlayer) {
    statusDisplay.textContent = '等待对手落子...';
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // 计算点击的格子
  const col = Math.round(x / cellSize) - 1;
  const row = Math.round(y / cellSize) - 1;

  if (row >= 0 && row < 15 && col >= 0 && col < 15) {
    if (gameState.board[row][col] === 0) {
      socket.emit('makeMove', {
        roomId: gameState.roomId,
        row,
        col
      });
    }
  }
});

// 创建房间
createRoomBtn.addEventListener('click', () => {
  socket.emit('createRoom', (response) => {
    if (response.success) {
      gameState.roomId = response.roomId;
      roomIdDisplay.textContent = `房间ID: ${response.roomId}`;
      statusDisplay.textContent = '等待对手加入...';
      createRoomBtn.style.display = 'none';
      joinRoomBtn.style.display = 'none';
      roomIdInput.style.display = 'none';
    }
  });
});

// 加入房间
joinRoomBtn.addEventListener('click', () => {
  const roomId = roomIdInput.value.trim().toUpperCase();
  if (!roomId) {
    alert('请输入房间ID');
    return;
  }

  socket.emit('joinRoom', roomId, (response) => {
    if (response.success) {
      gameState.roomId = roomId;
      gameState.playerIndex = response.playerIndex;
      roomIdDisplay.textContent = `房间ID: ${roomId}`;
      statusDisplay.textContent = '已加入房间，游戏即将开始...';
      createRoomBtn.style.display = 'none';
      joinRoomBtn.style.display = 'none';
      roomIdInput.style.display = 'none';
    } else {
      alert(response.message);
    }
  });
});

// 游戏开始
socket.on('gameStart', (data) => {
  gameState.gameStarted = true;
  gameState.currentPlayer = data.currentPlayer;
  statusDisplay.textContent = data.message;
  updatePlayerDisplay();
});

// 对手落子
socket.on('moveMade', (data) => {
  gameState.board[data.row][data.col] = data.player + 1;
  gameState.currentPlayer = data.nextPlayer;

  drawBoard();
  updatePlayerDisplay();
});

// 游戏结束
socket.on('gameOver', (data) => {
  gameState.gameOver = true;
  statusDisplay.textContent = data.message;
  restartBtn.style.display = 'inline-block';
});

// 对手离开
socket.on('playerLeft', (data) => {
  gameState.gameStarted = false;
  statusDisplay.textContent = data.message;
  restartBtn.style.display = 'inline-block';
});

// 重新开始
restartBtn.addEventListener('click', () => {
  location.reload();
});

// 更新玩家显示
function updatePlayerDisplay() {
  if (gameState.playerIndex === 0) {
    currentPlayerDisplay.textContent = `你是黑棋 | 当前: ${gameState.currentPlayer === 0 ? '你的回合' : '对手回合'}`;
  } else {
    currentPlayerDisplay.textContent = `你是白棋 | 当前: ${gameState.currentPlayer === 1 ? '你的回合' : '对手回合'}`;
  }
}

// 初始化
drawBoard();