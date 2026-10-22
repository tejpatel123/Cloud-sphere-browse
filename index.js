const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { chromium } = require('playwright-core');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;

let browserInstance = null;
let contextInstance = null;
let pageInstance = null;

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Cloud-Sphere Stream</title>
            <style>
                body { margin: 0; background: #111; color: white; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; overflow: hidden; }
                #controls { margin-bottom: 10px; width: 100%; max-width: 800px; display: flex; gap: 5px; }
                input { flex: 1; padding: 10px; border-radius: 4px; border: none; }
                button { padding: 10px 20px; background: #8a2be2; color: white; border: none; border-radius: 4px; cursor: pointer; }
                #browser-view { width: 100%; max-width: 800px; height: 500px; background: #000; border: 2px solid #333; position: relative; }
                img { width: 100%; height: 100%; object-fit: contain; }
            </style>
        </head>
        <body>
            <div id="controls">
                <input type="text" id="url-input" value="https://google.com">
                <button onclick="navigateToUrl()">Go</button>
            </div>
            <div id="browser-view">
                <img id="screen-stream" src="" alt="Launching ultra-lightweight engine..." />
            </div>
            <script>
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const ws = new WebSocket(protocol + '//' + window.location.host);
                const screen = document.getElementById('screen-stream');
                const viewBox = document.getElementById('browser-view');

                ws.onmessage = (event) => {
                    if (typeof event.data === 'string') {
                        const msg = JSON.parse(event.data);
                        if (msg.type === 'screenshot') screen.src = 'data:image/jpeg;base64,' + msg.data;
                    }
                };

                viewBox.addEventListener('click', (e) => {
                    const rect = viewBox.getBoundingClientRect();
                    const x = Math.round(((e.clientX - rect.left) / rect.width) * 800);
                    const y = Math.round(((e.clientY - rect.top) / rect.height) * 500);
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

wss.on('connection', async (ws) => {
    if (!browserInstance) {
        try {
            browserInstance = await chromium.launch({
                headless: true,
                executablePath: '/usr/bin/chromium-browser', // Uses Render's native minimal binary
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage', // Saves memory usage
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process', // Forces low RAM foot-print
                    '--user-data-dir=./.browser-sessions/profile-1'
                ]
            });
            contextInstance = await browserInstance.newContext({ viewport: { width: 800, height: 500 } });
            pageInstance = await contextInstance.newPage();
            await pageInstance.goto('https://google.com');
        } catch (e) { console.error("Launch error: ", e); }
    }

    const streamInterval = setInterval(async () => {
        if (pageInstance && ws.readyState === WebSocket.OPEN) {
            try {
                const buffer = await pageInstance.screenshot({ type: 'jpeg', quality: 40 });
                ws.send(JSON.stringify({ type: 'screenshot', data: buffer.toString('base64') }));
            } catch (err) {}
        }
    }, 300);

    ws.on('message', async (message) => {
        try {
            const action = JSON.parse(message);
            if (action.type === 'click' && pageInstance) await pageInstance.mouse.click(action.x, action.y);
            if (action.type === 'navigate' && pageInstance) await pageInstance.goto(action.url);
        } catch (e) {}
    });

    ws.on('close', () => clearInterval(streamInterval));
});

server.listen(PORT, () => console.log(`Server listening`));
