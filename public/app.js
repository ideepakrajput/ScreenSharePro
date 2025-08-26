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
        this.isFullscreen = false;
        this.controlPanelMinimized = false;
        this.connectionStartTime = null;
        this.sessionStats = {
            framesReceived: 0,
            dataTransferred: 0,
            connectionQuality: 'good'
        };

        this.setupSocketListeners();
        this.setupKeyboardShortcuts();
        this.updateConnectionTime();
        this.setupQualityMonitoring();
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateConnectionStatus('connected', 'Connected');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus('disconnected', 'Disconnected');
            this.showNotification('Connection lost', 'error');
        });

        this.socket.on('host-joined', (data) => {
            this.connectionStartTime = Date.now();
            this.showStatus('Screen sharing started successfully', 'success');
            this.showRoomInfo(data.roomId);
            // this.showViewerList();
            document.getElementById('currentQuality').textContent = data.settings.quality + '%';
            document.getElementById('currentFPS').textContent = data.settings.fps + ' FPS';
        });

        this.socket.on('viewer-joined', (data) => {
            this.connectionStartTime = Date.now();
            this.showStatus('Connected to screen share', 'success');
            this.showRoomInfo(data.roomId);
            this.setupCanvas();
            this.showNotification('Successfully connected to session', 'success');
        });

        this.socket.on('viewer-connected', (data) => {
            this.viewers.add(data.viewerId);
            this.updateViewerCount(data.viewerCount);
            this.showNotification(`New viewer joined (${data.viewerCount} total)`, 'info');
        });

        this.socket.on('viewer-disconnected', (data) => {
            this.viewers.delete(data.viewerId);
            this.updateViewerCount(data.viewerCount);
            this.showNotification(`Viewer left (${data.viewerCount} remaining)`, 'info');
        });

        this.socket.on('screen-frame', (data) => {
            if (this.canvas && this.ctx) {
                this.displayFrame(data.frame);
                this.sessionStats.framesReceived++;
                this.sessionStats.dataTransferred += data.frame.length;
                this.updateQualityIndicator();
            }
        });

        this.socket.on('settings-updated', (settings) => {
            document.getElementById('currentQuality').textContent = settings.quality + '%';
            document.getElementById('currentFPS').textContent = settings.fps + ' FPS';
            this.showNotification('Settings updated', 'success');
        });

        this.socket.on('host-disconnected', () => {
            this.showStatus('Host disconnected', 'error');
            this.hideScreen();
            this.showNotification('Session ended by host', 'error');
        });

        this.socket.on('error', (data) => {
            this.showStatus(data.message, 'error');
            this.showNotification(data.message, 'error');
        });

        this.socket.on('control-failed', (data) => {
            this.showNotification(`Control command failed: ${data.reason}`, 'warning');
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Only handle shortcuts when not typing in input fields
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            switch (e.key) {
                case 'F11':
                    e.preventDefault();
                    this.toggleFullscreen();
                    break;
                case ' ':
                    if (this.mode === 'viewer') {
                        e.preventDefault();
                        this.toggleRemoteControl();
                    }
                    break;
                case 'Escape':
                    if (this.isFullscreen) {
                        e.preventDefault();
                        this.toggleFullscreen();
                    }
                    break;
            }

            // Ctrl+Q for disconnect
            if (e.ctrlKey && e.key === 'q') {
                e.preventDefault();
                this.disconnect();
            }
        });
    }

    setupQualityMonitoring() {
        setInterval(() => {
            if (this.connectionStartTime && this.sessionStats.framesReceived > 0) {
                const elapsedSeconds = (Date.now() - this.connectionStartTime) / 1000;
                const avgFPS = this.sessionStats.framesReceived / elapsedSeconds;

                let quality = 'excellent';
                if (avgFPS < 5) quality = 'poor';
                else if (avgFPS < 8) quality = 'fair';
                else if (avgFPS < 12) quality = 'good';

                this.sessionStats.connectionQuality = quality;
                this.updateQualityIndicator();
            }
        }, 5000);
    }

    updateConnectionTime() {
        setInterval(() => {
            if (this.connectionStartTime) {
                const elapsed = Date.now() - this.connectionStartTime;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

                const connectionTimeEl = document.getElementById('connectionTime');
                if (connectionTimeEl) {
                    connectionTimeEl.textContent = `⏱️ ${timeStr}`;
                }

                const sessionTimeEl = document.getElementById('sessionTime');
                if (sessionTimeEl) {
                    sessionTimeEl.textContent = timeStr;
                }
            }
        }, 1000);
    }

    generateRoomId() {
        const adjectives = ['swift', 'bright', 'cosmic', 'digital', 'quantum', 'cyber', 'ultra', 'mega'];
        const nouns = ['meeting', 'session', 'connect', 'share', 'workspace', 'room', 'hub', 'space'];
        const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
        const randomNum = Math.floor(Math.random() * 9999) + 1000;

        const generatedId = `${randomAdj}-${randomNoun}-${randomNum}`;
        const input = this.isHost ? document.getElementById('hostRoomId') : document.getElementById('viewerRoomId');
        if (input) {
            input.value = generatedId;
        }
    }

    selectMode(mode) {
        this.mode = mode;
        this.isHost = mode === 'host';

        // Hide all sections first
        document.getElementById('modeSelection').classList.add('hidden');
        document.getElementById('hostSetup').classList.add('hidden');
        document.getElementById('viewerSetup').classList.add('hidden');

        if (mode === null) {
            // Back to mode selection
            document.getElementById('modeSelection').classList.remove('hidden');
            return;
        }

        if (mode === 'host') {
            document.getElementById('hostSetup').classList.remove('hidden');
        } else {
            document.getElementById('viewerSetup').classList.remove('hidden');
        }
    }

    startHost() {
        const roomId = document.getElementById('hostRoomId').value.trim();
        const quality = parseInt(document.getElementById('hostQuality').value);
        const fps = parseInt(document.getElementById('hostFPS').value);

        if (!roomId) {
            this.showNotification('Please enter a room ID', 'error');
            return;
        }

        this.roomId = roomId;
        this.socket.emit('join-as-host', {
            roomId,
            settings: { quality, fps }
        });

        document.getElementById('hostSetup').classList.add('hidden');
        this.showScreenArea();
        this.showStatus('Starting screen share...', 'loading');
        this.showControls();
    }

    startViewer() {
        const roomId = document.getElementById('viewerRoomId').value.trim();

        if (!roomId) {
            this.showNotification('Please enter a room ID', 'error');
            return;
        }

        this.roomId = roomId;
        this.socket.emit('join-as-viewer', { roomId });

        document.getElementById('viewerSetup').classList.add('hidden');
        this.showScreenArea();
        this.showStatus('Connecting to screen share...', 'loading');
        this.showControls();
        this.showScreen();
    }

    setupCanvas() {
        this.canvas = document.getElementById('screenDisplay');
        this.ctx = this.canvas.getContext('2d');

        // Make canvas focusable for keyboard events
        this.canvas.setAttribute('tabindex', '0');

        // Add event listeners for remote control
        this.setupCanvasEventListeners();

        // Show screen overlay controls
        document.getElementById('screenOverlay').classList.remove('hidden');
    }

    setupCanvasEventListeners() {
        if (!this.canvas) return;

        // Mouse events
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.remoteControlEnabled) {
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = this.canvas.width / rect.width;
                const scaleY = this.canvas.height / rect.height;
                const x = (e.clientX - rect.left) * scaleX;
                const y = (e.clientY - rect.top) * scaleY;

                this.socket.emit('remote-control', {
                    type: 'mouse-move',
                    x: Math.round(x),
                    y: Math.round(y)
                });
            }
        });

        this.canvas.addEventListener('click', (e) => {
            if (this.remoteControlEnabled) {
                e.preventDefault();
                this.socket.emit('remote-control', {
                    type: 'mouse-click',
                    button: 'left',
                    double: false
                });
            }
        });

        this.canvas.addEventListener('dblclick', (e) => {
            if (this.remoteControlEnabled) {
                e.preventDefault();
                this.socket.emit('remote-control', {
                    type: 'mouse-click',
                    button: 'left',
                    double: true
                });
            }
        });

        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (this.remoteControlEnabled) {
                this.socket.emit('remote-control', {
                    type: 'mouse-click',
                    button: 'right',
                    double: false
                });
            }
        });

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (this.remoteControlEnabled) {
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = this.canvas.width / rect.width;
                const scaleY = this.canvas.height / rect.height;
                const x = (e.clientX - rect.left) * scaleX;
                const y = (e.clientY - rect.top) * scaleY;

                this.socket.emit('remote-control', {
                    type: 'scroll',
                    x: Math.round(x),
                    y: Math.round(y),
                    deltaY: e.deltaY
                });
            }
        });

        // Keyboard events
        this.canvas.addEventListener('keydown', (e) => {
            if (this.remoteControlEnabled) {
                e.preventDefault();

                const modifiers = [];
                if (e.ctrlKey) modifiers.push('control');
                if (e.shiftKey) modifiers.push('shift');
                if (e.altKey) modifiers.push('alt');
                if (e.metaKey) modifiers.push('cmd');

                let key = e.key.toLowerCase();

                // Handle special keys
                const specialKeys = {
                    ' ': 'space',
                    'enter': 'enter',
                    'backspace': 'backspace',
                    'delete': 'delete',
                    'tab': 'tab',
                    'escape': 'escape',
                    'arrowup': 'up',
                    'arrowdown': 'down',
                    'arrowleft': 'left',
                    'arrowright': 'right'
                };

                if (specialKeys[key]) {
                    key = specialKeys[key];
                }

                this.socket.emit('remote-control', {
                    type: 'key-press',
                    key: key,
                    modifiers: modifiers
                });
            }
        });
    }

    displayFrame(base64Frame) {
        const img = new Image();
        img.onload = () => {
            // Update canvas dimensions to match image
            this.canvas.width = img.width;
            this.canvas.height = img.height;

            // Clear and draw the frame
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0);

            // Hide loading state and show canvas
            const loadingState = document.getElementById('loadingState');
            if (loadingState) loadingState.style.display = 'none';

            this.canvas.classList.remove('hidden');

            // Auto-fit screen if enabled
            const autoFit = document.getElementById('autoFitScreen');
            if (autoFit && autoFit.checked) {
                this.fitToScreen();
            }
        };
        img.src = 'data:image/jpeg;base64,' + base64Frame;
    }

    toggleRemoteControl() {
        this.remoteControlEnabled = !this.remoteControlEnabled;
        const toggleBtn = document.getElementById('controlToggleBtn');
        const toggleText = toggleBtn.querySelector('span');

        if (this.remoteControlEnabled) {
            toggleBtn.className = 'bg-green-600/80 hover:bg-green-600 text-white px-4 py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 font-medium';
            if (toggleText) toggleText.textContent = 'Disable Control';

            this.showNotification('Remote control enabled - Click on screen to control', 'success');
            this.canvas.focus();
            this.canvas.style.cursor = 'crosshair';
        } else {
            toggleBtn.className = 'bg-yellow-600/80 hover:bg-yellow-600 text-white px-4 py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 font-medium';
            if (toggleText) toggleText.textContent = 'Enable Control';

            this.showNotification('Remote control disabled', 'info');
            this.canvas.style.cursor = 'default';
        }
    }

    toggleFullscreen() {
        if (!this.canvas) return;

        this.isFullscreen = !this.isFullscreen;
        const fullscreenBtn = document.getElementById('fullscreenBtn');
        const fullscreenIcon = fullscreenBtn.querySelector('i');

        if (this.isFullscreen) {
            // Enter fullscreen
            this.canvas.classList.add('fullscreen-canvas');
            document.body.style.overflow = 'hidden';
            fullscreenIcon.className = 'fas fa-compress';

            // Hide control panel in fullscreen
            document.getElementById('controlPanelBtn').style.display = 'none';

            this.showNotification('Press ESC to exit fullscreen', 'info');
        } else {
            // Exit fullscreen
            this.canvas.classList.remove('fullscreen-canvas');
            document.body.style.overflow = '';
            fullscreenIcon.className = 'fas fa-expand';

            // Show control panel
            document.getElementById('controlPanelBtn').style.display = 'block';
        }
    }

    toggleControlPanel() {
        const panel = document.getElementById('controlPanelBtn');
        const toggleBtn = document.getElementById('togglePanelBtn');
        const icon = toggleBtn.querySelector('i');

        this.controlPanelMinimized = !this.controlPanelMinimized;

        if (this.controlPanelMinimized) {
            panel.classList.add('minimized');
            icon.className = 'fas fa-chevron-up';
        } else {
            panel.classList.remove('minimized');
            icon.className = 'fas fa-chevron-down';
        }
    }

    fitToScreen() {
        if (!this.canvas) return;

        const container = document.getElementById('screenContainer');
        const containerRect = container.getBoundingClientRect();

        // Calculate scale to fit canvas in container
        const scaleX = containerRect.width / this.canvas.width;
        const scaleY = containerRect.height / this.canvas.height;
        const scale = Math.min(scaleX, scaleY, 1); // Don't scale up

        this.canvas.style.width = `${this.canvas.width * scale}px`;
        this.canvas.style.height = `${this.canvas.height * scale}px`;

        // this.showNotification('Screen fitted to window', 'success');
    }

    takeScreenshot() {
        if (!this.canvas) return;

        try {
            const link = document.createElement('a');
            link.download = `screenshot_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
            link.href = this.canvas.toDataURL('image/png');
            link.click();

            this.showNotification('Screenshot saved', 'success');
        } catch (error) {
            this.showNotification('Failed to take screenshot', 'error');
        }
    }

    showSettings() {
        document.getElementById('settingsModal').classList.remove('hidden');

        if (this.isHost) {
            document.getElementById('hostSettings').classList.remove('hidden');
            document.getElementById('viewerSettings').classList.add('hidden');
        } else {
            document.getElementById('hostSettings').classList.add('hidden');
            document.getElementById('viewerSettings').classList.remove('hidden');
        }

        // Update slider displays
        this.updateSliderDisplays();
    }

    hideSettings() {
        document.getElementById('settingsModal').classList.add('hidden');
    }

    showHelp() {
        document.getElementById('helpModal').classList.remove('hidden');
    }

    hideHelp() {
        document.getElementById('helpModal').classList.add('hidden');
    }

    showKeyboard() {
        const modal = document.getElementById('keyboardModal');
        modal.classList.remove('hidden');

        // Generate virtual keyboard if not already done
        if (!document.getElementById('virtualKeyboard').innerHTML) {
            this.generateVirtualKeyboard();
        }
    }

    hideKeyboard() {
        document.getElementById('keyboardModal').classList.add('hidden');
    }

    generateVirtualKeyboard() {
        const keyboard = document.getElementById('virtualKeyboard');
        const rows = [
            ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'],
            ['Tab', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
            ['Caps', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", 'Enter'],
            ['Shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'Shift'],
            ['Ctrl', 'Alt', 'Space', 'Alt', 'Ctrl']
        ];

        keyboard.innerHTML = rows.map(row =>
            `<div class="flex justify-center space-x-1 mb-2">
                ${row.map(key => {
                let className = 'bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded border border-white/20 transition-colors cursor-pointer text-sm font-medium';
                if (['Backspace', 'Tab', 'Caps', 'Enter', 'Shift'].includes(key)) {
                    className += ' px-6';
                }
                if (key === 'Space') {
                    className += ' px-20';
                }
                return `<button class="${className}" onclick="app.sendVirtualKey('${key}')">${key}</button>`;
            }).join('')}
            </div>`
        ).join('');
    }

    sendVirtualKey(key) {
        if (!this.remoteControlEnabled) {
            this.showNotification('Enable remote control first', 'warning');
            return;
        }

        const modifiers = [];
        let actualKey = key.toLowerCase();

        // Handle special keys
        const specialKeys = {
            'backspace': 'backspace',
            'tab': 'tab',
            'enter': 'enter',
            'shift': 'shift',
            'ctrl': 'control',
            'alt': 'alt',
            'caps': 'capslock',
            'space': 'space'
        };

        if (specialKeys[actualKey]) {
            actualKey = specialKeys[actualKey];
        }

        this.socket.emit('remote-control', {
            type: 'key-press',
            key: actualKey,
            modifiers: modifiers
        });
    }

    updateSliderDisplays() {
        const qualitySlider = document.getElementById('qualitySlider');
        const fpsSlider = document.getElementById('fpsSlider');
        const qualityValue = document.getElementById('qualityValue');
        const fpsValue = document.getElementById('fpsValue');

        if (qualitySlider && qualityValue) {
            qualitySlider.oninput = () => {
                qualityValue.textContent = qualitySlider.value + '%';
            };
        }

        if (fpsSlider && fpsValue) {
            fpsSlider.oninput = () => {
                fpsValue.textContent = fpsSlider.value + ' FPS';
            };
        }
    }

    applySettings() {
        if (!this.isHost) return;

        const quality = parseInt(document.getElementById('qualitySlider').value);
        const fps = parseInt(document.getElementById('fpsSlider').value);

        this.socket.emit('update-settings', { quality, fps });
        this.hideSettings();
        this.showNotification('Settings applied', 'success');
    }

    updateConnectionStatus(status, text) {
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');

        if (statusDot && statusText) {
            statusDot.className = `w-3 h-3 rounded-full pulse-dot ${status === 'connected' ? 'bg-green-500' :
                status === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
                }`;
            statusText.textContent = text;
        }
    }

    updateQualityIndicator() {
        const indicator = document.getElementById('qualityIndicator');
        const qualityText = document.getElementById('qualityText');

        if (indicator && qualityText && this.mode === 'viewer') {
            const showQuality = document.getElementById('showQuality');
            if (showQuality && showQuality.checked) {
                indicator.classList.remove('hidden');
                qualityText.textContent = this.sessionStats.connectionQuality.charAt(0).toUpperCase() +
                    this.sessionStats.connectionQuality.slice(1);
            } else {
                indicator.classList.add('hidden');
            }
        }
    }

    showScreenArea() {
        document.getElementById('screenArea').classList.remove('hidden');
    }

    showScreen() {
        const screenContainer = document.getElementById('screenContainer');
        screenContainer.classList.remove('hidden');
    }

    hideScreen() {
        const screenContainer = document.getElementById('screenContainer');
        screenContainer.classList.add('hidden');

        // Reset canvas
        if (this.canvas) {
            this.canvas.classList.add('hidden');
        }

        // Show loading state
        const loadingState = document.getElementById('loadingState');
        if (loadingState) {
            loadingState.style.display = 'flex';
        }
    }

    showControls() {
        document.getElementById('controlPanelBtn').classList.remove('hidden');
    }

    showRoomInfo(roomId) {
        document.getElementById('roomInfo').classList.remove('hidden');
        document.getElementById('currentRoomId').textContent = roomId;
        document.getElementById('roomIdDisplay').textContent = `Room: ${roomId}`;
    }

    updateViewerCount(count) {
        const viewerCountElements = document.querySelectorAll('#viewerCount, #connectedViewers');
        viewerCountElements.forEach(el => {
            if (el.id === 'viewerCount') {
                el.textContent = `👥 ${count}`;
            } else {
                el.textContent = count;
            }
        });
    }

    showStatus(message, type) {
        // This could be implemented as a status bar or notification
        console.log(`Status [${type}]: ${message}`);
    }

    showNotification(message, type = 'info') {
        const notificationArea = document.getElementById('notificationArea');
        const notification = document.createElement('div');

        const icons = {
            success: 'fas fa-check-circle text-green-400',
            error: 'fas fa-exclamation-circle text-red-400',
            warning: 'fas fa-exclamation-triangle text-yellow-400',
            info: 'fas fa-info-circle text-blue-400'
        };

        const colors = {
            success: 'bg-green-900/80 border-green-500',
            error: 'bg-red-900/80 border-red-500',
            warning: 'bg-yellow-900/80 border-yellow-500',
            info: 'bg-blue-900/80 border-blue-500'
        };

        notification.className = `notification flex items-center space-x-3 ${colors[type]} backdrop-blur-md text-white p-4 rounded-lg border shadow-lg min-w-80`;
        notification.innerHTML = `
            <i class="${icons[type]}"></i>
            <span class="flex-1">${message}</span>
            <button onclick="this.parentElement.remove()" class="text-white/60 hover:text-white">
                <i class="fas fa-times"></i>
            </button>
        `;

        notificationArea.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 1000);
    }

    disconnect() {
        this.socket.disconnect();
        setTimeout(() => {
            location.reload();
        }, 100);
    }
}

// Global functions for onclick handlers
function selectMode(mode) {
    app.selectMode(mode);
}

function generateRoomId() {
    app.generateRoomId();
}

function startHost() {
    app.startHost();
}

function startViewer() {
    app.startViewer();
}

function toggleRemoteControl() {
    app.toggleRemoteControl();
}

function toggleFullscreen() {
    app.toggleFullscreen();
}

function toggleControlPanel() {
    app.toggleControlPanel();
}

function fitToScreen() {
    app.fitToScreen();
}

function takeScreenshot() {
    app.takeScreenshot();
}

function showSettings() {
    app.showSettings();
}

function hideSettings() {
    app.hideSettings();
}

function showHelp() {
    app.showHelp();
}

function hideHelp() {
    app.hideHelp();
}

function showKeyboard() {
    app.showKeyboard();
}

function hideKeyboard() {
    app.hideKeyboard();
}

function applySettings() {
    app.applySettings();
}

function disconnect() {
    app.disconnect();
}

// Initialize the app
const app = new ScreenShareApp();

window.onload = () => {
    const hostBtn = document.getElementById('hostBtn');
    const viewerBtn = document.getElementById('viewerBtn');
    const backToSelectionFromHost = document.getElementById('backToSelectionFromHost');
    const backToSelectionFromViewer = document.getElementById('backToSelectionFromViewer');
    const generateRoomIdBtn = document.getElementById('generateRoomIdBtn');
    const startHostBtn = document.getElementById('startHostBtn');
    const startViewerBtn = document.getElementById('startViewerBtn');
    const controlToggleBtn = document.getElementById('controlToggleBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsBtn1 = document.getElementById('settingsBtn1');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const closeHelpBtn = document.getElementById('closeHelpBtn');
    const helpBtn = document.getElementById('helpBtn');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const fullscreenBtn1 = document.getElementById('fullscreenBtn1');
    const keyboardBtn = document.getElementById('keyboardBtn');
    const closeKeyboardBtn = document.getElementById('closeKeyboardBtn');
    const applySettingsBtn = document.getElementById('applySettingsBtn');
    const controlPanelBtn = document.getElementById('controlPanelBtn');
    const fitScreenBtn = document.getElementById('fitScreenBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');

    hostBtn.onclick = () => selectMode('host');
    viewerBtn.onclick = () => selectMode('viewer');
    backToSelectionFromHost.onclick = () => selectMode(null);
    backToSelectionFromViewer.onclick = () => selectMode(null);
    generateRoomIdBtn.onclick = () => generateRoomId();
    startHostBtn.onclick = () => startHost();
    startViewerBtn.onclick = () => startViewer();
    controlToggleBtn.onclick = () => toggleRemoteControl();
    settingsBtn.onclick = () => showSettings();
    settingsBtn1.onclick = () => showSettings();
    closeSettingsBtn.onclick = () => hideSettings();
    helpBtn.onclick = () => showHelp();
    closeHelpBtn.onclick = () => hideHelp();
    fullscreenBtn.onclick = () => toggleFullscreen();
    fullscreenBtn1.onclick = () => toggleFullscreen();
    keyboardBtn.onclick = () => showKeyboard();
    closeKeyboardBtn.onclick = () => hideKeyboard();
    applySettingsBtn.onclick = () => applySettings();
    controlPanelBtn.onclick = () => toggleControlPanel();
    fitScreenBtn.onclick = () => fitToScreen();
    disconnectBtn.onclick = () => disconnect();
};