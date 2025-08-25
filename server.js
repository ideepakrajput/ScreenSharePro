const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const robot = require('robotjs');
const screenshot = require('screenshot-desktop');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store connected clients
const clients = new Map();
const screensharers = new Map();

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    clients.set(socket.id, {
        id: socket.id,
        type: null, // 'host' or 'viewer'
        roomId: null
    });

    // Handle joining as host (screen sharer)
    socket.on('join-as-host', (data) => {
        const { roomId } = data;
        const client = clients.get(socket.id);

        if (client) {
            client.type = 'host';
            client.roomId = roomId;

            socket.join(roomId);
            screensharers.set(roomId, socket.id);

            socket.emit('host-joined', { roomId });
            console.log(`Host ${socket.id} joined room ${roomId}`);

            // Start screen sharing
            startScreenSharing(socket, roomId);
        }
    });

    // Handle joining as viewer
    socket.on('join-as-viewer', (data) => {
        const { roomId } = data;
        const client = clients.get(socket.id);

        if (client && screensharers.has(roomId)) {
            client.type = 'viewer';
            client.roomId = roomId;

            socket.join(roomId);
            socket.emit('viewer-joined', { roomId });

            // Notify host about new viewer
            const hostId = screensharers.get(roomId);
            if (hostId) {
                io.to(hostId).emit('viewer-connected', { viewerId: socket.id });
            }

            console.log(`Viewer ${socket.id} joined room ${roomId}`);
        } else {
            socket.emit('error', { message: 'Room not found or no active host' });
        }
    });

    // Handle WebRTC signaling
    socket.on('offer', (data) => {
        socket.to(data.target).emit('offer', {
            offer: data.offer,
            sender: socket.id
        });
    });

    socket.on('answer', (data) => {
        socket.to(data.target).emit('answer', {
            answer: data.answer,
            sender: socket.id
        });
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.target).emit('ice-candidate', {
            candidate: data.candidate,
            sender: socket.id
        });
    });

    // Handle remote control commands
    socket.on('mouse-move', (data) => {
        const client = clients.get(socket.id);
        if (client && client.type === 'viewer') {
            const { x, y } = data;
            robot.moveMouse(x, y);
        }
    });

    socket.on('mouse-click', (data) => {
        const client = clients.get(socket.id);
        if (client && client.type === 'viewer') {
            const { button, double } = data;
            if (double) {
                robot.mouseClick(button, true);
            } else {
                robot.mouseClick(button);
            }
        }
    });

    socket.on('key-press', (data) => {
        const client = clients.get(socket.id);
        if (client && client.type === 'viewer') {
            const { key, modifiers } = data;
            if (modifiers && modifiers.length > 0) {
                robot.keyTap(key, modifiers);
            } else {
                robot.keyTap(key);
            }
        }
    });

    socket.on('scroll', (data) => {
        const client = clients.get(socket.id);
        if (client && client.type === 'viewer') {
            const { x, y, deltaY } = data;
            robot.moveMouse(x, y);
            robot.scrollMouse(deltaY > 0 ? 3 : -3, deltaY > 0 ? 'down' : 'up');
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);

        const client = clients.get(socket.id);
        if (client) {
            // If host disconnects, notify viewers
            if (client.type === 'host' && client.roomId) {
                socket.to(client.roomId).emit('host-disconnected');
                screensharers.delete(client.roomId);
            }

            // If viewer disconnects, notify host
            if (client.type === 'viewer' && client.roomId) {
                const hostId = screensharers.get(client.roomId);
                if (hostId) {
                    io.to(hostId).emit('viewer-disconnected', { viewerId: socket.id });
                }
            }
        }

        clients.delete(socket.id);
    });
});

// Function to start screen sharing
function startScreenSharing(hostSocket, roomId) {
    const shareScreen = async () => {
        try {
            const img = await screenshot({ format: 'jpg', quality: 60 });
            const base64 = img.toString('base64');

            hostSocket.to(roomId).emit('screen-frame', {
                frame: base64,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('Screenshot error:', error);
        }
    };

    // Share screen at 10 FPS
    const interval = setInterval(shareScreen, 100);

    hostSocket.on('disconnect', () => {
        clearInterval(interval);
    });
}

// API endpoint to get active rooms
app.get('/api/rooms', (req, res) => {
    const rooms = Array.from(screensharers.keys());
    res.json({ rooms });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to access the application`);
});