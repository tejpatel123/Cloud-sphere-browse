const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;

let browserInstance = null;
let pageInstance = null;

// Serve interactive frontend interface
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Cloud-Sphere Interactive Browser</title>
            <style>
                body { margin: 0; background: #111; color: white; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; overflow: hidden; }
                #controls { margin-bottom: 10px; width: 100%; max-width: 800px; display: flex; gap: 5px; }
                input { flex: 1; padding: 10px; border-radius: 4px; border: none; }
                button { padding: 10px 20px; background: #8a2be2; color: white; border: none; border-radius: 4px; cursor: pointer; }
                #browser-view { width: 100%; max-width: 800px; height: 500px; background: #000; border: 2px solid #333; position: relative; cursor: crosshair; }
                img { width: 100%; height: 100%; object-fit: contain; }
            </style>
        </head>
        <body>
            <div id="controls">
                <input type="text" id="url-input" value="https://google.com" placeholder="Enter URL...">
                <button onclick="navigateToUrl()">Go</button>
            </div>
            <div id="browser-view" id="view-box">
                <img id="screen-stream" src="" alt="Waiting for browser engine to launch..." />
            </div>

            <script>
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const ws = new WebSocket(protocol + '//' + window.location.host);
                const screen = document.getElementById('screen-stream');
                const viewBox = document.getElementById('browser-view');

                ws.onmessage = (event) => {
                    if (typeof event.data === 'string') {
                        const msg = JSON.parse(event.data);
                        if (msg.type === 'screenshot') {
                            screen.src = 'data:image/jpeg;base64,' + msg.data;
                        }
                    }
                };

                // Track and send interactive click coordinates back to server
                viewBox.addEventListener('click', (e) => {
                    const rect = viewBox.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 800;
                    const y = ((e.clientY - rect.top) / rect.height) * 500;
                    ws.send(JSON.stringify({ type: 'click', x, y }));
                });

                function navigateToUrl() {
                    const url = document.getElementById('url-input').value;
                    ws.send(JSON.stringify({ type: 'navigate', url }));
                }
            </script>
        </body>
        </html>
    `);
});

// Handle live streaming connections and interactions
wss.on('connection', async (ws) => {
    console.log('Client connected to interactive socket stream');
    
    if (!browserInstance) {
        browserInstance = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-sandbox', '--site-per-process', '--user-data-dir=./.browser-sessions/profile-1']
        });
        pageInstance = await browserInstance.newPage();
        await pageInstance.setViewport({ width: 800, height: 500 });
        await pageInstance.goto('https://google.com');
    }

    // Interval stream to pipe visual browser updates down to the canvas client
    const streamInterval = setInterval(async () => {
        if (pageInstance && ws.readyState === WebSocket.OPEN) {
            try {
                const screenshot = await pageInstance.screenshot({ type: 'jpeg', quality: 60, encoding: 'base64' });
                ws.send(JSON.stringify({ type: 'screenshot', data: screenshot }));
            } catch (err) {
                // Ignore transient frame errors
            }
        }
    }, 200);

    ws.on('message', async (message) => {
        const action = JSON.parse(message);
        try {
            if (action.type === 'click' && pageInstance) {
                await pageInstance.mouse.click(action.x, action.y);
            } else if (action.type === 'navigate' && pageInstance) {
                await pageInstance.goto(action.url);
            }
        } catch (e) {
            console.error(e);
        }
    });

    ws.on('close', () => {
        clearInterval(streamInterval);
    });
});

server.listen(PORT, () => {
    console.log(`Interactive platform running on port ${PORT}`);
});
