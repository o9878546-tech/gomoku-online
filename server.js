const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// 配置 Socket.IO 支持 Railway
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['polling', 'websocket'],  // 先尝试 polling，再尝试 websocket
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e6
});

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        rooms: rooms.size,
        connections: io.engine.clientsCount,
        uptime: process.uptime()
    });
});

// 根路径也返回健康状态
app.get('/api/status', (req, res) => {
    res.json({ status: 'running' });
});

// 游戏房间
const rooms = new Map();

// 生成房间ID
function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// 检查胜利
function checkWin(board, row, col, player) {
    const size = board.length;
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

    for (const [dx, dy] of directions) {
        let count = 1;
        let winLine = {
            startRow: row,
            startCol: col,
            endRow: row,
            endCol: col
        };

        // 正向检查
        for (let i = 1; i < 5; i++) {
            const newRow = row + dx * i;
            const newCol = col + dy * i;
            if (newRow >= 0 && newRow < size && newCol >= 0 && newCol < size &&
                board[newRow][newCol] === player) {
                count++;
                winLine.endRow = newRow;
                winLine.endCol = newCol;
            } else break;
        }

        // 反向检查
        for (let i = 1; i < 5; i++) {
            const newRow = row - dx * i;
            const newCol = col - dy * i;
            if (newRow >= 0 && newRow < size && newCol >= 0 && newCol < size &&
                board[newRow][newCol] === player) {
                count++;
                winLine.startRow = newRow;
                winLine.startCol = newCol;
            } else break;
        }

        if (count >= 5) return winLine;
    }
    return null;
}

// 检查棋盘是否已满
function isBoardFull(board) {
    return board.every(row => row.every(cell => cell !== null));
}

io.on('connection', (socket) => {
    console.log('用户连接:', socket.id);

    // 创建房间
    socket.on('createRoom', (callback) => {
        let roomId = generateRoomId();
        while (rooms.has(roomId)) {
            roomId = generateRoomId();
        }

        const room = {
            id: roomId,
            players: [{ id: socket.id, color: 'black' }],
            spectators: [],
            board: Array(15).fill().map(() => Array(15).fill(null)),
            currentTurn: 'black',
            gameStarted: false,
            gameOver: false,
            lastMoveTime: null,
            createdAt: Date.now()
        };

        rooms.set(roomId, room);
        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerColor = 'black';

        console.log(`房间 ${roomId} 已创建`);
        callback({ success: true, roomId, color: 'black' });
    });

    // 加入房间
    socket.on('joinRoom', (roomId, callback) => {
        const room = rooms.get(roomId);

        if (!room) {
            callback({ success: false, error: '房间不存在' });
            return;
        }

        // 检查是否已在游戏中
        const existingPlayer = room.players.find(p => p.id === socket.id);
        if (existingPlayer) {
            callback({ success: false, error: '你已经在这个房间中' });
            return;
        }

        // 检查房间是否已满（2个玩家）
        if (room.players.length >= 2) {
            // 加入为观众
            room.spectators.push(socket.id);
            socket.join(roomId);
            socket.roomId = roomId;
            socket.playerColor = 'spectator';

            // 发送当前游戏状态给观众
            callback({
                success: true,
                color: 'spectator',
                isSpectator: true,
                gameState: {
                    board: room.board,
                    currentTurn: room.currentTurn,
                    gameOver: room.gameOver,
                    gameStarted: room.gameStarted
                }
            });
            return;
        }

        // 加入为玩家
        const color = room.players.length === 0 ? 'black' : 'white';
        room.players.push({ id: socket.id, color });

        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerColor = color;

        // 标记游戏开始
        if (room.players.length === 2) {
            room.gameStarted = true;

            // 通知双方游戏开始
            io.to(roomId).emit('gameStart', {
                currentTurn: 'black',
                players: room.players.map(p => ({ color: p.color }))
            });
        }

        callback({ success: true, color });
        console.log(`玩家 ${socket.id} 加入房间 ${roomId}，执${color === 'black' ? '黑' : '白'}棋`);
    });

    // 落子
    socket.on('makeMove', (data) => {
        const { roomId, row, col, player } = data;
        const room = rooms.get(roomId);

        if (!room || room.gameOver) return;

        // 验证是否是当前玩家的回合
        const playerData = room.players.find(p => p.id === socket.id);
        if (!playerData || playerData.color !== room.currentTurn) return;

        // 验证位置是否有效
        if (row < 0 || row >= 15 || col < 0 || col >= 15 || room.board[row][col] !== null) return;

        // 更新棋盘
        room.board[row][col] = player;
        room.lastMoveTime = Date.now();

        // 检查胜利
        const winLine = checkWin(room.board, row, col, player);
        if (winLine) {
            room.gameOver = true;
            io.to(roomId).emit('moveMade', {
                row, col, player,
                nextTurn: player === 'black' ? 'white' : 'black'
            });
            io.to(roomId).emit('gameOver', {
                winner: player,
                winLine
            });
            return;
        }

        // 检查平局
        if (isBoardFull(room.board)) {
            room.gameOver = true;
            io.to(roomId).emit('moveMade', {
                row, col, player,
                nextTurn: player === 'black' ? 'white' : 'black'
            });
            io.to(roomId).emit('gameOver', { winner: 'draw' });
            return;
        }

        // 切换回合
        room.currentTurn = room.currentTurn === 'black' ? 'white' : 'black';

        // 广播落子
        io.to(roomId).emit('moveMade', {
            row, col, player,
            nextTurn: room.currentTurn
        });
    });

    // 聊天消息
    socket.on('chatMessage', (data) => {
        const { roomId, message } = data;
        const room = rooms.get(roomId);

        if (!room) return;

        const playerData = room.players.find(p => p.id === socket.id);
        const senderName = playerData ?
            (playerData.color === 'black' ? '黑棋' : '白棋') :
            '观众';

        // 广播消息（除了发送者）
        socket.to(roomId).emit('chatMessage', {
            sender: senderName,
            message,
            color: playerData ? playerData.color : 'spectator'
        });
    });

    // 请求悔棋
    socket.on('requestUndo', (roomId) => {
        const room = rooms.get(roomId);
        if (!room || room.gameOver) return;

        const playerData = room.players.find(p => p.id === socket.id);
        if (!playerData) return;

        // 通知对手
        socket.to(roomId).emit('undoRequested', {
            by: playerData.color
        });
    });

    // 响应悔棋
    socket.on('respondUndo', (roomId, accepted) => {
        const room = rooms.get(roomId);
        if (!room || room.gameOver) return;

        if (accepted) {
            // 撤销最后两步
            let movesUndone = 0;
            for (let r = 14; r >= 0 && movesUndone < 2; r--) {
                for (let c = 14; c >= 0 && movesUndone < 2; c--) {
                    if (room.board[r][c]) {
                        room.board[r][c] = null;
                        movesUndone++;
                    }
                }
            }

            // 切换回合
            room.currentTurn = room.currentTurn === 'black' ? 'white' : 'black';

            io.to(roomId).emit('undoAccepted', {
                board: room.board,
                currentTurn: room.currentTurn
            });
        } else {
            io.to(roomId).emit('undoRejected');
        }
    });

    // 认输
    socket.on('resign', (roomId) => {
        const room = rooms.get(roomId);
        if (!room || room.gameOver) return;

        const playerData = room.players.find(p => p.id === socket.id);
        if (!playerData) return;

        room.gameOver = true;

        io.to(roomId).emit('gameOver', {
            winner: playerData.color === 'black' ? 'white' : 'black',
            resigned: true,
            resignedBy: playerData.color
        });
    });

    // 重新开始游戏
    socket.on('restartGame', (roomId) => {
        const room = rooms.get(roomId);
        if (!room) return;

        // 重置游戏状态
        room.board = Array(15).fill().map(() => Array(15).fill(null));
        room.currentTurn = 'black';
        room.gameOver = false;
        room.gameStarted = true;

        io.to(roomId).emit('gameRestart', {
            currentTurn: 'black',
            players: room.players.map(p => ({ color: p.color }))
        });
    });

    // 断线重连
    socket.on('rejoinRoom', (data) => {
        const { roomId, color } = data;
        const room = rooms.get(roomId);

        if (!room) return;

        // 查找是否有对应的玩家位置
        const existingPlayer = room.players.find(p => p.color === color);
        if (existingPlayer && existingPlayer.id !== socket.id) {
            // 更新玩家ID
            existingPlayer.id = socket.id;
            socket.join(roomId);
            socket.roomId = roomId;
            socket.playerColor = color;

            // 发送当前游戏状态
            socket.emit('gameState', {
                board: room.board,
                currentTurn: room.currentTurn,
                gameOver: room.gameOver,
                gameStarted: room.gameStarted
            });
        }
    });

    // 断开连接
    socket.on('disconnect', () => {
        console.log('用户断开:', socket.id);

        if (socket.roomId) {
            const room = rooms.get(socket.roomId);
            if (room) {
                // 从玩家列表中移除
                const playerIndex = room.players.findIndex(p => p.id === socket.id);
                if (playerIndex !== -1) {
                    const player = room.players[playerIndex];
                    room.players.splice(playerIndex, 1);

                    // 通知其他玩家
                    io.to(socket.roomId).emit('playerLeft', {
                        color: player.color,
                        playersCount: room.players.length
                    });

                    // 如果游戏已经开始且玩家离开，游戏结束
                    if (room.gameStarted && !room.gameOver) {
                        room.gameOver = true;
                        io.to(socket.roomId).emit('gameOver', {
                            winner: player.color === 'black' ? 'white' : 'black',
                            disconnected: true
                        });
                    }
                } else {
                    // 从观众列表中移除
                    const spectatorIndex = room.spectators.indexOf(socket.id);
                    if (spectatorIndex !== -1) {
                        room.spectators.splice(spectatorIndex, 1);
                    }
                }

                // 如果房间为空，删除房间
                if (room.players.length === 0) {
                    rooms.delete(socket.roomId);
                    console.log(`房间 ${socket.roomId} 已删除（空房间）`);
                }
            }
        }
    });
});

// 定期清理空房间
setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of rooms.entries()) {
        // 删除超过1小时的空房间
        if (room.players.length === 0 && now - room.createdAt > 3600000) {
            rooms.delete(roomId);
            console.log(`清理过期房间: ${roomId}`);
        }
    }
}, 300000); // 每5分钟检查一次

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🎮 五子棋服务器运行在端口 ${PORT}`);
    console.log(`📡 访问地址: http://localhost:${PORT}`);
});