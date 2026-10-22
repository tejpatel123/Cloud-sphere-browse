const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', async (req, res) => {
    res.send('Cloud-Sphere Engine is Active on Port 3000!');
});

// Endpoint initialization for your stream interface interaction
app.get('/launch', async (req, res) => {
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--enable-sandbox',
                '--site-per-process',
                '--user-data-dir=./.browser-sessions/profile-1' // Local free session persistence directory
            ]
        });
        console.log("Secure isolation browser running.");
        res.json({ status: "running" });
    } catch (err) {
        res.status(500).send(err.toString());
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
