# ScreenShare Pro 🖥️

A professional, feature-rich screen sharing application with remote control capabilities built with Node.js, Socket.io, and modern web technologies.

## ✨ Features

### 🎯 Core Functionality

-   **Real-time Screen Sharing**: High-quality screen streaming with customizable settings
-   **Remote Control**: Full mouse, keyboard, and scroll control capabilities
-   **Multi-viewer Support**: Multiple viewers can connect to a single host session
-   **Professional UI**: Modern, responsive design with Tailwind CSS and glassmorphism effects

### 🛠️ Advanced Features

-   **Fullscreen Mode**: Immersive viewing experience with F11 support
-   **Quality Control**: Adjustable video quality (30%-100%) and frame rates (5-25 FPS)
-   **Virtual Keyboard**: On-screen keyboard for mobile and touch devices
-   **Screenshot Capture**: Take screenshots of the shared screen
-   **Session Management**: Real-time connection status and session statistics
-   **Keyboard Shortcuts**: Professional shortcuts for quick actions
-   **Auto-fit Screen**: Intelligent screen sizing and fitting options

### 🔒 Security & Performance

-   **Rate Limiting**: Protection against spam and abuse
-   **Input Validation**: Comprehensive validation of all remote control commands
-   **Secure Headers**: Helmet.js for security headers
-   **Compression**: Gzip compression for optimal performance
-   **Error Handling**: Robust error handling and user notifications

## 🚀 Quick Start

### Prerequisites

-   Node.js 16+ installed
-   npm or yarn package manager
-   Screen recording permissions (for hosts)
-   Accessibility permissions (for remote control)

### Installation

1. **Clone or create the project:**

```bash
mkdir screenshare-pro
cd screenshare-pro
```

2. **Install dependencies:**

```bash
npm install
```

3. **Start the server:**

```bash
npm start
# or for development
npm run dev
```

4. **Access the application:**
   Open your browser and navigate to `http://localhost:3000`

## 📁 Project Structure

```
screenshare-pro/
├── server.js              # Main server file with Socket.io and Express
├── package.json           # Dependencies and scripts
├── README.md             # This file
└── public/               # Client-side files
    ├── index.html        # Main HTML interface
    ├── app.js           # Client-side JavaScript
    └── styles.css       # Additional CSS styles
```

## 🎮 How to Use

### Hosting a Session

1. Click **"Host Session"** on the main page
2. Enter a unique Room ID or generate one randomly
3. Choose your quality settings:
    - **Quality**: 30-100% (affects image compression)
    - **FPS**: 5-25 frames per second
4. Click **"Start Sharing Session"**
5. Share the Room ID with viewers

### Joining a Session

1. Click **"Join Session"** on the main page
2. Enter the Room ID provided by the host
3. Click **"Connect to Session"**
4. Wait for the screen share to load
5. Click **"Enable Control"** to start remote control
6. Use mouse, keyboard, and scroll as if on the host machine

## ⌨️ Keyboard Shortcuts

| Shortcut   | Action                              |
| ---------- | ----------------------------------- |
| `F11`      | Toggle fullscreen mode              |
| `Space`    | Toggle remote control (viewer only) |
| `Ctrl + Q` | Disconnect from session             |
| `Esc`      | Exit fullscreen mode                |

## 🔧 Configuration

### Environment Variables

```bash
PORT=3000                    # Server port (default: 3000)
NODE_ENV=production         # Environment mode
```

### Host Settings

-   **Quality**: 30-100% (recommended: 70% for balance)
-   **FPS**: 5-25 (recommended: 10-15 for most use cases)
-   **Allow Control**: Enable/disable remote control capabilities

### Viewer Settings

-   **Auto-fit Screen**: Automatically resize to fit window
-   **Show Quality Indicator**: Display connection quality status
-   **Virtual Keyboard**: Access on-screen keyboard

## 🏗️ Architecture

### Backend Components

-   **Express Server**: Handles HTTP requests and static file serving
-   **Socket.io**: Real-time communication between clients
-   **RobotJS**: System-level mouse and keyboard control
-   **Screenshot-desktop**: Screen capture functionality
-   **Security Middleware**: Helmet, CORS, rate limiting

### Frontend Components

-   **Modern JavaScript**: ES6+ with class-based architecture
-   **Tailwind CSS**: Utility-first CSS framework
-   **Socket.io Client**: Real-time communication
-   **HTML5 Canvas**: Screen display and interaction
-   **Responsive Design**: Mobile-first approach

### Data Flow

1. **Host** captures screen using screenshot-desktop
2. **Server** processes and broadcasts frames via Socket.io
3. **Viewers** receive frames and render on HTML5 canvas
4. **Remote Control** commands sent back through Socket.io
5. **RobotJS** executes commands on host system

## 🔒 Security Considerations

### Permissions Required

-   **macOS**: Accessibility permissions for mouse/keyboard control
-   **Windows**: No additional permissions typically required
-   **Linux**: X11 permissions for screen capture and control

### Network Security

-   Use HTTPS in production environments
-   Implement authentication for sensitive use cases
-   Consider VPN or private networks for confidential sessions

### Best Practices

-   Use strong, unique Room IDs
-   Limit session duration for security
-   Monitor active connections
-   Implement user authentication if needed

## 🎨 Customization

### Styling

The application uses Tailwind CSS with custom components. Key style files:

-   `public/styles.css` - Additional custom styles
-   Tailwind classes in `public/index.html`
-   CSS variables for theme customization

### Adding Features

Example: Adding session recording

```javascript
// In server.js - add recording capability
const {spawn} = require("child_process");

// Start recording
function startRecording(roomId) {
    const recorder = spawn("ffmpeg", [
        "-f",
        "screen",
        "-i",
        ":0",
        `recordings/${roomId}.mp4`,
    ]);
}
```

## 📊 Performance Optimization

### Recommended Settings by Use Case

| Use Case         | Quality | FPS | Notes                          |
| ---------------- | ------- | --- | ------------------------------ |
| Code Review      | 90%     | 10  | High quality for text clarity  |
| Presentation     | 70%     | 15  | Balanced for smooth animations |
| Gaming           | 60%     | 20+ | Lower quality, higher FPS      |
| Document Editing | 85%     | 8   | High quality, low motion       |

### Network Requirements

-   **Minimum**: 1 Mbps upload (host), 512 Kbps download (viewer)
-   **Recommended**: 5 Mbps upload (host), 2 Mbps download (viewer)
-   **Optimal**: 10+ Mbps for high-quality sessions

## 🐛 Troubleshooting

### Common Issues

**Screen sharing not working**

```bash
# Check permissions
# macOS: System Preferences → Security & Privacy → Screen Recording
# Windows: Run as administrator if needed
# Linux: Check X11 permissions
```

**Remote control not responding**

```bash
# Check accessibility permissions
# macOS: System Preferences → Security & Privacy → Accessibility
# Ensure the app has the required permissions
```

**Poor connection quality**

-   Reduce quality settings (50-60%)
-   Lower frame rate (5-8 FPS)
-   Check network connectivity
-   Close unnecessary applications

**Cannot connect to room**

-   Verify Room ID is correct
-   Ensure host session is active
-   Check firewall settings
-   Try refreshing the page

### Debug Mode

Enable debug logging:

```bash
DEBUG=* npm start
```

## 🔄 API Endpoints

### REST API

```
GET  /api/health          # Server health check
GET  /api/rooms           # List active rooms
GET  /api/room/:roomId    # Get room statistics
```

### Socket Events

```javascript
// Client to Server
"join-as-host"; // Create and join room as host
"join-as-viewer"; // Join existing room as viewer
"remote-control"; // Send control commands
"update-settings"; // Update room settings

// Server to Client
"host-joined"; // Host successfully created room
"viewer-joined"; // Viewer successfully joined room
"screen-frame"; // New screen frame data
"settings-updated"; // Settings changed notification
```

## 🚀 Deployment

### Production Deployment

1. **Prepare the environment:**

```bash
npm install --production
export NODE_ENV=production
export PORT=80
```

2. **Use a process manager:**

```bash
npm install -g pm2
pm2 start server.js --name "screenshare-pro"
```

3. **Set up reverse proxy (nginx):**

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Docker Deployment

```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🤝 Contributing

### Development Setup

```bash
git clone <repository>
cd screenshare-pro
npm install
npm run dev
```

### Code Style

-   Use ESLint for JavaScript linting
-   Follow semantic commit messages
-   Add tests for new features
-   Update documentation

### Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests and documentation
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

-   **Socket.io** - Real-time communication
-   **RobotJS** - System automation
-   **Tailwind CSS** - Styling framework
-   **Express.js** - Web framework
-   **Screenshot-desktop** - Screen capture

## 📞 Support

For support, please:

1. Check the troubleshooting section
2. Search existing issues
3. Create a new issue with:
    - Operating system
    - Node.js version
    - Error messages
    - Steps to reproduce

---

**Built with ❤️ for seamless remote collaboration**
