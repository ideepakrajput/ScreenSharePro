const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const robot = require('robotjs');
const screenshot = require('screenshot-desktop');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

// Security and performance middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com"],
            connectSrc: ["'self'", "ws:", "wss:"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
        },
    },
}));
app.use(compression());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// Enhanced client management
class ClientManager {
    constructor() {
        this.clients = new Map();
        this.rooms = new Map();
        this.screenShareIntervals = new Map();
    }

    addClient(socketId, data = {}) {
        this.clients.set(socketId, {
            id: socketId,
            type: null,
            roomId: null,
            connectedAt: new Date(),
            lastActivity: new Date(),
            ...data
        });
    }

    removeClient(socketId) {
        const client = this.clients.get(socketId);
        if (client && client.roomId) {
            this.leaveRoom(socketId, client.roomId);
        }
        this.clients.delete(socketId);
    }

    updateClient(socketId, data) {
        const client = this.clients.get(socketId);
        if (client) {
            Object.assign(client, data, { lastActivity: new Date() });
        }
    }

    createRoom(roomId, hostId) {
        this.rooms.set(roomId, {
            id: roomId,
            hostId,
            viewers: new Set(),
            createdAt: new Date(),
            settings: {
                quality: 70,
                fps: 10,
                allowControl: true
            }
        });
    }

    joinRoom(socketId, roomId, type) {
        const room = this.rooms.get(roomId);
        if (!room) return false;

        if (type === 'viewer') {
            room.viewers.add(socketId);
        }

        this.updateClient(socketId, { roomId, type });
        return true;
    }

    leaveRoom(socketId, roomId) {
        const room = this.rooms.get(roomId);
        if (room) {
            room.viewers.delete(socketId);

            // Clean up room if host leaves
            if (room.hostId === socketId) {
                this.stopScreenSharing(roomId);
                this.rooms.delete(roomId);
            }
        }
    }

    startScreenSharing(roomId, hostSocket) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        const shareScreen = async () => {
            try {
                const img = await screenshot({
                    format: 'jpg',
                    quality: room.settings.quality
                });
                const base64 = img.toString('base64');

                hostSocket.to(roomId).emit('screen-frame', {
                    frame: base64,
                    timestamp: Date.now(),
                    quality: room.settings.quality
                });
            } catch (error) {
                console.error('Screenshot error:', error);
            }
        };

        const interval = setInterval(shareScreen, 1000 / room.settings.fps);
        this.screenShareIntervals.set(roomId, interval);
    }

    stopScreenSharing(roomId) {
        const interval = this.screenShareIntervals.get(roomId);
        if (interval) {
            clearInterval(interval);
            this.screenShareIntervals.delete(roomId);
        }
    }

    getRoomStats(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return null;

        return {
            id: roomId,
            viewerCount: room.viewers.size,
            createdAt: room.createdAt,
            settings: room.settings
        };
    }
}

const clientManager = new ClientManager();

// Enhanced robot control with safety checks
class RobotController {
    constructor() {
        this.enabled = true;
        this.screenSize = robot.getScreenSize();
        this.lastCommand = 0;
        this.commandDelay = 10; // ms between commands
    }

    isValidCoordinate(x, y) {
        return x >= 0 && x <= this.screenSize.width &&
            y >= 0 && y <= this.screenSize.height;
    }

    canExecuteCommand() {
        const now = Date.now();
        if (now - this.lastCommand < this.commandDelay) {
            return false;
        }
        this.lastCommand = now;
        return true;
    }

    moveMouse(x, y) {
        if (!this.enabled || !this.canExecuteCommand() || !this.isValidCoordinate(x, y)) {
            return false;
        }

        try {
            robot.moveMouse(x, y);
            return true;
        } catch (error) {
            console.error('Mouse move error:', error);
            return false;
        }
    }

    click(button = 'left', double = false) {
        if (!this.enabled || !this.canExecuteCommand()) {
            return false;
        }

        try {
            robot.mouseClick(button, double);
            return true;
        } catch (error) {
            console.error('Mouse click error:', error);
            return false;
        }
    }

    keyTap(key, modifiers = []) {
        if (!this.enabled || !this.canExecuteCommand()) {
            return false;
        }

        try {
            if (modifiers.length > 0) {
                robot.keyTap(key, modifiers);
            } else {
                robot.keyTap(key);
            }
            return true;
        } catch (error) {
            console.error('Key tap error:', error);
            return false;
        }
    }

    scroll(x, y, direction) {
        if (!this.enabled || !this.canExecuteCommand() || !this.isValidCoordinate(x, y)) {
            return false;
        }

        try {
            robot.moveMouse(x, y);
            robot.scrollMouse(Math.abs(direction) > 0 ? 3 : -3, direction > 0 ? 'down' : 'up');
            return true;
        } catch (error) {
            console.error('Scroll error:', error);
            return false;
        }
    }
}

const robotController = new RobotController();

// Socket handling
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    clientManager.addClient(socket.id);

    // Enhanced host joining
    socket.on('join-as-host', (data) => {
        const { roomId, settings = {} } = data;

        if (!roomId || typeof roomId !== 'string') {
            socket.emit('error', { message: 'Invalid room ID' });
            return;
        }

        // Check if room already exists
        if (clientManager.rooms.has(roomId)) {
            socket.emit('error', { message: 'Room already exists' });
            return;
        }

        clientManager.createRoom(roomId, socket.id);
        const room = clientManager.rooms.get(roomId);

        // Apply custom settings
        if (settings.quality) room.settings.quality = Math.min(100, Math.max(10, settings.quality));
        if (settings.fps) room.settings.fps = Math.min(30, Math.max(1, settings.fps));

        socket.join(roomId);
        clientManager.updateClient(socket.id, { type: 'host', roomId });

        socket.emit('host-joined', {
            roomId,
            settings: room.settings,
            screenSize: robotController.screenSize
        });

        console.log(`Host ${socket.id} created room ${roomId}`);
        clientManager.startScreenSharing(roomId, socket);
    });

    // Enhanced viewer joining
    socket.on('join-as-viewer', (data) => {
        const { roomId } = data;

        if (!roomId || !clientManager.rooms.has(roomId)) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        socket.join(roomId);
        clientManager.joinRoom(socket.id, roomId, 'viewer');

        const room = clientManager.rooms.get(roomId);
        socket.emit('viewer-joined', {
            roomId,
            settings: room.settings,
            screenSize: robotController.screenSize
        });

        // Notify host
        io.to(room.hostId).emit('viewer-connected', {
            viewerId: socket.id,
            viewerCount: room.viewers.size
        });

        console.log(`Viewer ${socket.id} joined room ${roomId}`);
    });

    // Enhanced remote control with validation
    socket.on('remote-control', (data) => {
        const client = clientManager.clients.get(socket.id);
        if (!client || client.type !== 'viewer') {
            socket.emit('error', { message: 'Unauthorized control attempt' });
            return;
        }

        const { type, ...params } = data;
        let success = false;

        switch (type) {
            case 'mouse-move':
                success = robotController.moveMouse(params.x, params.y);
                break;
            case 'mouse-click':
                success = robotController.click(params.button, params.double);
                break;
            case 'key-press':
                success = robotController.keyTap(params.key, params.modifiers);
                break;
            case 'scroll':
                success = robotController.scroll(params.x, params.y, params.deltaY);
                break;
            default:
                socket.emit('error', { message: 'Invalid control command' });
                return;
        }

        if (!success) {
            socket.emit('control-failed', { type, reason: 'Command execution failed' });
        }
    });

    // Room settings update
    socket.on('update-settings', (data) => {
        const client = clientManager.clients.get(socket.id);
        if (!client || client.type !== 'host') {
            socket.emit('error', { message: 'Only hosts can update settings' });
            return;
        }

        const room = clientManager.rooms.get(client.roomId);
        if (room) {
            if (data.quality) room.settings.quality = Math.min(100, Math.max(10, data.quality));
            if (data.fps) room.settings.fps = Math.min(30, Math.max(1, data.fps));

            // Restart screen sharing with new settings
            clientManager.stopScreenSharing(client.roomId);
            clientManager.startScreenSharing(client.roomId, socket);

            socket.to(client.roomId).emit('settings-updated', room.settings);
            socket.emit('settings-updated', room.settings);
        }
    });

    // Enhanced disconnect handling
    socket.on('disconnect', (reason) => {
        console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);

        const client = clientManager.clients.get(socket.id);
        if (client && client.roomId) {
            const room = clientManager.rooms.get(client.roomId);

            if (client.type === 'host') {
                socket.to(client.roomId).emit('host-disconnected');
            } else if (client.type === 'viewer' && room) {
                io.to(room.hostId).emit('viewer-disconnected', {
                    viewerId: socket.id,
                    viewerCount: room.viewers.size - 1
                });
            }
        }

        clientManager.removeClient(socket.id);
    });

    // Heartbeat
    socket.on('ping', () => {
        clientManager.updateClient(socket.id, {});
        socket.emit('pong');
    });
});

// Enhanced API endpoints
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/rooms', (req, res) => {
    const rooms = Array.from(clientManager.rooms.entries()).map(([id, room]) => ({
        id,
        viewerCount: room.viewers.size,
        createdAt: room.createdAt,
        settings: room.settings
    }));
    res.json({ rooms, totalRooms: rooms.length });
});

app.get('/api/room/:roomId', (req, res) => {
    const stats = clientManager.getRoomStats(req.params.roomId);
    if (stats) {
        res.json(stats);
    } else {
        res.status(404).json({ error: 'Room not found' });
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        connections: clientManager.clients.size
    });
});

const PORT = process.env.PORT || 3000;

// For Vercel serverless functions
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 ScreenShare Pro server running on port ${PORT}`);
        console.log(`📱 Open http://localhost:${PORT} to access the application`);
        console.log(`🔧 API Health: http://localhost:${PORT}/api/health`);
    });
}

// Export for Vercel serverless deployment
module.exports = app;