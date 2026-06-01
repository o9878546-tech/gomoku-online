const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.json({ ok: true }));

const rooms = {};

io.on('connection', (socket) => {
    console.log('连接:', socket.id);

    socket.on('create', (cb) => {
        const id = Math.random().toString(36).substr(2, 6).toUpperCase();
        rooms[id] = { players: [socket.id], board: Array(15).fill(null).map(() => Array(15).fill(null)), turn: 'black' };
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
        if (!room) return;
        if (socket.data.color !== room.turn) return;
        const { r, c } = data;
        if (r < 0 || r >= 15 || c < 0 || c >= 15 || room.board[r][c]) return;
        room.board[r][c] = socket.data.color;
        room.turn = room.turn === 'black' ? 'white' : 'black';
        console.log('落子:', r, c, socket.data.color, '房间:', socket.data.room);
        io.to(socket.data.room).emit('move', { r, c, color: socket.data.color, turn: room.turn });
    });

    socket.on('disconnect', () => {
        console.log('断开:', socket.id);
        const room = rooms[socket.data.room];
        if (room) {
            io.to(socket.data.room).emit('end', { msg: '对手离开' });
            delete rooms[socket.data.room];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('服务器运行在端口', PORT));
