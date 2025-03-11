const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();
const port = 3000;

const API_KEY = 'app-YW3tO7R7xvNtRtxKjYMnrDL7'; // 您的API Key
const API_BASE_URL = 'http://127.0.0.1:80/v1';

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

// 代理聊天消息API
app.post('/v1/chat-messages', async (req, res) => {
    const { query, inputs, response_mode, conversation_id, user } = req.body;

    const requestBody = {
        inputs: inputs || {},
        query: query || '',
        response_mode: response_mode || 'blocking',
        conversation_id: conversation_id || '',
        user: user || 'anonymous'
    };

    try {
        const response = await fetch(`${API_BASE_URL}/chat-messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (response_mode === 'streaming') {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            response.body.pipe(res);
        } else {
            const data = await response.json();
            res.json(data);
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch from API', details: error.message });
    }
});

// 代理获取会话列表API
app.get('/v1/conversations', async (req, res) => {
    const { user, last_id, limit, sort_by } = req.query;
    const queryParams = new URLSearchParams({
        user: user || 'anonymous',
        last_id: last_id || '',
        limit: limit || '20',
        sort_by: sort_by || '-updated_at'
    }).toString();

    try {
        const response = await fetch(`${API_BASE_URL}/conversations?${queryParams}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch conversations', details: error.message });
    }
});

// 代理获取历史消息API
app.get('/v1/messages', async (req, res) => {
    const { conversation_id, user, first_id, limit } = req.query;
    const queryParams = new URLSearchParams({
        conversation_id: conversation_id || '',
        user: user || 'anonymous',
        first_id: first_id || '',
        limit: limit || '20'
    }).toString();

    try {
        const response = await fetch(`${API_BASE_URL}/messages?${queryParams}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch messages', details: error.message });
    }
});

// 代理删除会话API
app.delete('/v1/conversations/:conversation_id', async (req, res) => {
    const { conversation_id } = req.params;
    const { user } = req.body;

    try {
        const response = await fetch(`${API_BASE_URL}/conversations/${conversation_id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ user })
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete conversation', details: error.message });
    }
});

// 代理重命名会话API
app.post('/v1/conversations/:conversation_id/name', async (req, res) => {
    const { conversation_id } = req.params;
    const { name, auto_generate, user } = req.body;

    const requestBody = {
        name: name || '',
        auto_generate: auto_generate || false,
        user: user || 'anonymous'
    };

    try {
        const response = await fetch(`${API_BASE_URL}/conversations/${conversation_id}/name`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to rename conversation', details: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});