const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*" },
    transports: ['polling', 'websocket']
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.json({ status: 'ok', rooms: rooms.size }));

const rooms = new Map();

function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

function checkWin(board, row, col, player) {
    const size = board.length;
    for (const [dx, dy] of [[0,1],[1,0],[1,1],[1,-1]]) {
        let count = 1;
        for (let i = 1; i < 5; i++) {
            const r = row + dx * i, c = col + dy * i;
            if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === player) count++;
            else break;
        }
        for (let i = 1; i < 5; i++) {
            const r = row - dx * i, c = col - dy * i;
            if (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === player) count++;
            else break;
        }
        if (count >= 5) return true;
    }
    return false;
}

io.on('connection', (socket) => {
    console.log('连接:', socket.id);

    socket.on('createRoom', (callback) => {
        let roomId = generateRoomId();
        while (rooms.has(roomId)) roomId = generateRoomId();

        rooms.set(roomId, {
            players: [socket.id],
            board: Array(15).fill().map(() => Array(15).fill(null)),
            currentTurn: 'black',
            gameOver: false
        });

        socket.join(roomId);
        socket.roomId = roomId;
        console.log('房间创建:', roomId);
        callback({ success: true, roomId });
    });

    socket.on('joinRoom', (roomId, callback) => {
        const room = rooms.get(roomId);
        if (!room) return callback({ success: false, error: '房间不存在' });
        if (room.players.length >= 2) return callback({ success: false, error: '房间已满' });
        if (room.players.includes(socket.id)) return callback({ success: false, error: '已在房间中' });

        room.players.push(socket.id);
        socket.join(roomId);
        socket.roomId = roomId;

        console.log('玩家加入:', roomId, '当前玩家数:', room.players.length);

        callback({ success: true, color: 'white' });

        // 通知所有人游戏开始
        io.to(roomId).emit('gameStart', {
            currentTurn: 'black',
            players: [{ color: 'black' }, { color: 'white' }]
        });
    });

    socket.on('makeMove', (data) => {
        const room = rooms.get(data.roomId);
        if (!room || room.gameOver) return;

        const playerIndex = room.players.indexOf(socket.id);
        if (playerIndex === -1) return;

        const playerColor = playerIndex === 0 ? 'black' : 'white';
        if (playerColor !== room.currentTurn) return;

        const { row, col } = data;
        if (row < 0 || row >= 15 || col < 0 || col >= 15 || room.board[row][col]) return;

        // 在服务器棋盘上落子
        room.board[row][col] = playerColor;
        console.log('落子:', row, col, playerColor, '房间:', data.roomId);

        // 检查胜利
        if (checkWin(room.board, row, col, playerColor)) {
            room.gameOver = true;
            io.to(data.roomId).emit('moveMade', {
                row, col, player: playerColor,
                nextTurn: playerColor === 'black' ? 'white' : 'black'
            });
            io.to(data.roomId).emit('gameOver', { winner: playerColor });
            return;
        }

        // 切换回合
        room.currentTurn = room.currentTurn === 'black' ? 'white' : 'black';

        // 广播给所有人
        io.to(data.roomId).emit('moveMade', {
            row, col, player: playerColor,
            nextTurn: room.currentTurn
        });
    });

    socket.on('resign', (roomId) => {
        const room = rooms.get(roomId);
        if (!room || room.gameOver) return;
        const playerIndex = room.players.indexOf(socket.id);
        if (playerIndex === -1) return;
        room.gameOver = true;
        const winner = playerIndex === 0 ? 'white' : 'black';
        io.to(roomId).emit('gameOver', { winner, resigned: true });
    });

    socket.on('disconnect', () => {
        console.log('断开:', socket.id);
        if (socket.roomId) {
            const room = rooms.get(socket.roomId);
            if (room) {
                const playerIndex = room.players.indexOf(socket.id);
                if (playerIndex !== -1 && !room.gameOver) {
                    room.gameOver = true;
                    const winner = playerIndex === 0 ? 'white' : 'black';
                    io.to(socket.roomId).emit('gameOver', { winner, disconnected: true });
                }
                room.players = room.players.filter(id => id !== socket.id);
                if (room.players.length === 0) rooms.delete(socket.roomId);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('服务器运行在端口', PORT));
