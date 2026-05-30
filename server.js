const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));

// 游戏房间
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);

  // 创建房间
  socket.on('createRoom', (callback) => {
    const roomId = generateRoomId();
    rooms.set(roomId, {
      players: [socket.id],
      board: Array(15).fill().map(() => Array(15).fill(0)),
      currentPlayer: 0,
      gameStarted: false
    });
    socket.join(roomId);
    socket.roomId = roomId;
    callback({ success: true, roomId });
  });

  // 加入房间
  socket.on('joinRoom', (roomId, callback) => {
    const room = rooms.get(roomId);
    if (!room) {
      callback({ success: false, message: '房间不存在' });
      return;
    }
    if (room.players.length >= 2) {
      callback({ success: false, message: '房间已满' });
      return;
    }

    room.players.push(socket.id);
    socket.join(roomId);
    socket.roomId = roomId;
    room.gameStarted = true;

    callback({ success: true, playerIndex: 1 });

    // 通知双方游戏开始
    io.to(roomId).emit('gameStart', {
      currentPlayer: 0,
      message: '游戏开始！黑棋先行'
    });
  });

  // 落子
  socket.on('makeMove', (data) => {
    const { roomId, row, col } = data;
    const room = rooms.get(roomId);

    if (!room || !room.gameStarted) return;

    const playerIndex = room.players.indexOf(socket.id);
    if (playerIndex !== room.currentPlayer) return;

    if (room.board[row][col] !== 0) return;

    // 更新棋盘
    room.board[row][col] = playerIndex + 1;
    room.currentPlayer = (room.currentPlayer + 1) % 2;

    // 广播落子
    io.to(roomId).emit('moveMade', {
      row,
      col,
      player: playerIndex,
      nextPlayer: room.currentPlayer
    });

    // 检查胜利
    if (checkWin(room.board, row, col, playerIndex + 1)) {
      io.to(roomId).emit('gameOver', {
        winner: playerIndex,
        message: `玩家${playerIndex + 1}获胜！`
      });
      rooms.delete(roomId);
    } else if (isBoardFull(room.board)) {
      io.to(roomId).emit('gameOver', {
        winner: -1,
        message: '平局！'
      });
      rooms.delete(roomId);
    }
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log('用户断开:', socket.id);
    if (socket.roomId) {
      const room = rooms.get(socket.roomId);
      if (room) {
        io.to(socket.roomId).emit('playerLeft', {
          message: '对手已离开游戏'
        });
        rooms.delete(socket.roomId);
      }
    }
  });
});

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function checkWin(board, row, col, player) {
  const directions = [
    [0, 1], [1, 0], [1, 1], [1, -1]
  ];

  for (const [dx, dy] of directions) {
    let count = 1;

    // 正向检查
    for (let i = 1; i < 5; i++) {
      const newRow = row + dx * i;
      const newCol = col + dy * i;
      if (newRow >= 0 && newRow < 15 && newCol >= 0 && newCol < 15 &&
          board[newRow][newCol] === player) {
        count++;
      } else break;
    }

    // 反向检查
    for (let i = 1; i < 5; i++) {
      const newRow = row - dx * i;
      const newCol = col - dy * i;
      if (newRow >= 0 && newRow < 15 && newCol >= 0 && newCol < 15 &&
          board[newRow][newCol] === player) {
        count++;
      } else break;
    }

    if (count >= 5) return true;
  }
  return false;
}

function isBoardFull(board) {
  return board.every(row => row.every(cell => cell !== 0));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});