const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.json({ ok: true, rooms: Object.keys(rooms).length }));

const rooms = {};

function checkWin(board, r, c, p) {
    for (const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
        let cnt = 1;
        for (let i=1;i<5;i++) { const nr=r+dr*i,nc=c+dc*i; if (nr>=0&&nr<15&&nc>=0&&nc<15&&board[nr][nc]===p) cnt++; else break; }
        for (let i=1;i<5;i++) { const nr=r-dr*i,nc=c-dc*i; if (nr>=0&&nr<15&&nc>=0&&nc<15&&board[nr][nc]===p) cnt++; else break; }
        if (cnt>=5) return true;
    }
    return false;
}

io.on('connection', (socket) => {
    console.log('连接:', socket.id);

    socket.on('create', (cb) => {
        const id = Math.random().toString(36).substr(2, 6).toUpperCase();
        rooms[id] = { players: [socket.id], board: Array(15).fill(null).map(() => Array(15).fill(null)), turn: 'black', over: false };
        socket.join(id);
        socket.data.room = id;
        socket.data.color = 'black';
        console.log('创建房间:', id);
        cb({ ok: true, id, color: 'black' });
    });

    socket.on('join', (id, cb) => {
        const room = rooms[id];
        if (!room) return cb({ ok: false, msg: '房间不存在' });
        if (room.players.length >= 2) return cb({ ok: false, msg: '房间已满' });
        room.players.push(socket.id);
        socket.join(id);
        socket.data.room = id;
        socket.data.color = 'white';
        console.log('加入房间:', id);
        cb({ ok: true, color: 'white' });
        io.to(id).emit('start', { turn: 'black' });
    });

    socket.on('move', (data) => {
        const room = rooms[socket.data.room];
        if (!room || room.over) return;
        if (socket.data.color !== room.turn) return;
        const { r, c } = data;
        if (r < 0 || r >= 15 || c < 0 || c >= 15 || room.board[r][c]) return;
        room.board[r][c] = socket.data.color;
        console.log('落子:', r, c, socket.data.color);

        if (checkWin(room.board, r, c, socket.data.color)) {
            room.over = true;
            io.to(socket.data.room).emit('move', { r, c, color: socket.data.color, turn: room.turn });
            io.to(socket.data.room).emit('gameOver', { winner: socket.data.color, msg: (socket.data.color==='black'?'黑棋':'白棋')+'获胜' });
            return;
        }

        room.turn = room.turn === 'black' ? 'white' : 'black';
        io.to(socket.data.room).emit('move', { r, c, color: socket.data.color, turn: room.turn });
    });

    socket.on('resign', (id) => {
        const room = rooms[id];
        if (!room || room.over) return;
        room.over = true;
        const winner = socket.data.color === 'black' ? 'white' : 'black';
        io.to(id).emit('gameOver', { winner, msg: (socket.data.color==='black'?'黑棋':'白棋')+'认输' });
    });

    socket.on('restart', (id) => {
        const room = rooms[id];
        if (!room) return;
        room.board = Array(15).fill(null).map(() => Array(15).fill(null));
        room.turn = 'black';
        room.over = false;
        io.to(id).emit('restart');
        io.to(id).emit('start', { turn: 'black' });
    });

    socket.on('disconnect', () => {
        console.log('断开:', socket.id);
        const room = rooms[socket.data.room];
        if (room && !room.over) {
            room.over = true;
            io.to(socket.data.room).emit('gameOver', { winner: socket.data.color==='black'?'white':'black', msg: '对手离开' });
        }
        if (room) {
            room.players = room.players.filter(id => id !== socket.id);
            if (room.players.length === 0) delete rooms[socket.data.room];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('服务器运行在端口', PORT));
