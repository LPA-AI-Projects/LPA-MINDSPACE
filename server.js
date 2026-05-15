import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/generate-board', async (req, res) => {
  try {
    const { systemPrompt, userMsg } = req.body;
    
    // In production, fetch this securely from dotenv or secret manager
    const aiApiKey = process.env.ANTHROPIC_API_KEY;
    if (!aiApiKey) {
       return res.status(500).json({ error: 'API key is missing in backend secrets' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': aiApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-opus-20240229',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'API error ' + response.status });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error('AI Proxy Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

// Keep the HTTP server referenced so Node doesn't auto-exit.
if (typeof server.ref === 'function') {
  server.ref();
}

// Some Windows/node shells may not keep the event loop alive for this listener.
// Keep a lightweight timer so the backend remains available during dev.
const serverKeepAlive = setInterval(() => {}, 60 * 60 * 1000);

function shutdown() {
  clearInterval(serverKeepAlive);
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
