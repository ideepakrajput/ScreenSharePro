class ScreenShareApp {
    constructor() {
        this.socket = io();
        this.mode = null;
        this.roomId = null;
        this.isHost = false;
        this.remoteControlEnabled = false;
        this.viewers = new Set();
        this.canvas = null;
        this.ctx = null;

        this.setupSocketListeners();
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
        });

        this.socket.on('host-joined', (data) => {
            this.showStatus('Screen sharing started', 'connected');
            this.showRoomInfo(`Room ID: ${data.roomId}`);
            this.showViewerList();
        });

        this.socket.on('viewer-joined', (data) => {
            this.showStatus('Connected to screen share', 'connected');
            this.showRoomInfo(`Connected to room: ${data.roomId}`);
            this.setupCanvas();
        });

        this.socket.on('viewer-connected', (data) => {
            this.viewers.add(data.viewerId);
            this.updateViewerList();
        });

        this.socket.on('viewer-disconnected', (data) => {
            this.viewers.delete(data.viewerId);
            this.updateViewerList();
        });

        this.socket.on('screen-frame', (data) => {
            if (this.canvas && this.ctx) {
                this.displayFrame(data.frame);
            }
        });

        this.socket.on('host-disconnected', () => {
            this.showStatus('Host disconnected', 'disconnected');
            this.hideScreen();
        });

        this.socket.on('error', (data) => {
            this.showStatus(data.message, 'disconnected');
        });

        this.socket.on('disconnect', () => {
            this.showStatus('Disconnected from server', 'disconnected');
        });
    }

    selectMode(mode) {
        this.mode = mode;
        this.isHost = mode === 'host';

        document.getElementById('modeSelection').classList.add('hidden');

        if (mode === 'host') {
            document.getElementById('hostSetup').classList.remove('hidden');
        } else {
            document.getElementById('viewerSetup').classList.remove('hidden');
        }
    }

    startHost() {
        const roomId = document.getElementById('hostRoomId').value.trim();
        if (!roomId) {
            alert('Please enter a room ID');
            return;
        }

        this.roomId = roomId;
        this.socket.emit('join-as-host', { roomId });

        document.getElementById('hostSetup').classList.add('hidden');
        this.showStatus('Starting screen share...', 'waiting');
        this.showControls();
    }

    startViewer() {
        const roomId = document.getElementById('viewerRoomId').value.trim();
        if (!roomId) {
            alert('Please enter a room ID');
            return;
        }

        this.roomId = roomId;
        this.socket.emit('join-as-viewer', { roomId });

        document.getElementById('viewerSetup').classList.add('hidden');
        this.showStatus('Connecting to screen share...', 'waiting');
        this.showControls();
        this.showScreen();
    }

    setupCanvas() {
        this.canvas = document.getElementById('screenDisplay');
        this.ctx = this.canvas.getContext('2d');

        // Add mouse event listeners for remote control
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.remoteControlEnabled) {
                const rect = this.canvas.getBoundingClientRect();
                const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
                const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);

                this.socket.emit('mouse-move', { x: Math.round(x), y: Math.round(y) });
            }
        });

        this.canvas.addEventListener('click', (e) => {
            if (this.remoteControlEnabled) {
                this.socket.emit('mouse-click', { button: 'left', double: false });
            }
        });

        this.canvas.addEventListener('dblclick', (e) => {
            if (this.remoteControlEnabled) {
                this.socket.emit('mouse-click', { button: 'left', double: true });
            }
        });

        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (this.remoteControlEnabled) {
                this.socket.emit('mouse-click', { button: 'right', double: false });
            }
        });

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (this.remoteControlEnabled) {
                const rect = this.canvas.getBoundingClientRect();
                const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
                const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);

                this.socket.emit('scroll', {
                    x: Math.round(x),
                    y: Math.round(y),
                    deltaY: e.deltaY
                });
            }
        });

        // Add keyboard event listeners
        document.addEventListener('keydown', (e) => {
            if (this.remoteControlEnabled && this.canvas === document.activeElement) {
                e.preventDefault();

                const modifiers = [];
                if (e.ctrlKey) modifiers.push('control');
                if (e.shiftKey) modifiers.push('shift');
                if (e.altKey) modifiers.push('alt');

                this.socket.emit('key-press', {
                    key: e.key.toLowerCase(),
                    modifiers
                });
            }
        });
    }

    displayFrame(base64Frame) {
        const img = new Image();
        img.onload = () => {
            this.canvas.width = img.width;
            this.canvas.height = img.height;
            this.ctx.drawImage(img, 0, 0);

            // Remove loading text
            const loading = document.querySelector('.loading');
            if (loading) loading.style.display = 'none';
        };
        img.src = 'data:image/jpeg;base64,' + base64Frame;
    }

    toggleRemoteControl() {
        this.remoteControlEnabled = !this.remoteControlEnabled;
        const toggleBtn = document.getElementById('controlToggle');

        if (this.remoteControlEnabled) {
            toggleBtn.textContent = 'Disable Control';
            this.showStatus('Remote control enabled - Click on screen to control', 'connected');
            this.canvas.focus();
        } else {
            toggleBtn.textContent = 'Enable Control';
            this.showStatus('Remote control disabled', 'waiting');
        }
    }

    showStatus(message, type) {
        const statusArea = document.getElementById('statusArea');
        statusArea.innerHTML = `<div class="status \${type}">\${message}</div>`;
    }

    showRoomInfo(info) {
        const roomInfo = document.getElementById('roomInfo');
        roomInfo.innerHTML = `<div class="room-info">${info}</div>`;
        roomInfo.classList.remove('hidden');
    }

    showScreen() {
        document.getElementById('screenContainer').classList.remove('hidden');
    }

    hideScreen() {
        document.getElementById('screenContainer').classList.add('hidden');
    }

    showControls() {
        document.getElementById('controls').classList.remove('hidden');
    }

    showViewerList() {
        if (this.isHost) {
            document.getElementById('viewerList').classList.remove('hidden');
            this.updateViewerList();
        }
    }

    updateViewerList() {
        const viewersDiv = document.getElementById('viewers');
        if (this.viewers.size === 0) {
            viewersDiv.innerHTML = '<p>No viewers connected</p>';
        } else {
            viewersDiv.innerHTML = Array.from(this.viewers)
                .map(id => `<p>Viewer: ${id.substring(0, 8)}...</p>`)
                .join('');
        }
    }

    disconnect() {
        this.socket.disconnect();
        location.reload();
    }
}

// Initialize the app
window.selectMode = (mode) => app.selectMode(mode);
window.startHost = () => app.startHost();
window.startViewer = () => app.startViewer();
window.toggleRemoteControl = () => app.toggleRemoteControl();
window.disconnect = () => app.disconnect();

const app = new ScreenShareApp();