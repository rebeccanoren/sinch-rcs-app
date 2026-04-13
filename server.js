require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const PROJECT_ID    = process.env.PROJECT_ID;
const CLIENT_ID     = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

if (!PROJECT_ID || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing required environment variables. Copy .env.example to .env and fill in your credentials.');
  process.exit(1);
}
const BASE_URL = 'https://provisioning.api.sinch.com';
const AUTH_URL = 'https://auth.sinch.com/oauth2/token';

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials&scope=openid'
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'agents.html'));
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const CONV_BASE = {
  US:   'https://us.conversation.api.sinch.com',
  EU:   'https://eu.conversation.api.sinch.com',
  APAC: 'https://apac.conversation.api.sinch.com',
};

app.get('/api/questionnaire/:useCase', async (req, res) => {
  try {
    const { useCase } = req.params;
    const { countries } = req.query;
    const token = await getToken();
    let url = `${BASE_URL}/v1/projects/${PROJECT_ID}/rcs/questionnaire/${useCase}`;
    if (countries) url += `?countries=${countries}`;
    const apiRes = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await apiRes.json();
    res.status(apiRes.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/senders', async (req, res) => {
  try {
    const token = await getToken();
    const apiRes = await fetch(
      `${BASE_URL}/v1/projects/${PROJECT_ID}/rcs/senders`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const data = await apiRes.json();
    res.status(apiRes.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/sender/:senderId', async (req, res) => {
  try {
    const { senderId } = req.params;
    const token = await getToken();
    const apiRes = await fetch(
      `${BASE_URL}/v1/projects/${PROJECT_ID}/rcs/senders/${senderId}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const data = await apiRes.json();
    res.status(apiRes.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/send-message', async (req, res) => {
  try {
    const { senderId, to, message, region } = req.body;
    const token = await getToken();
    const baseUrl = CONV_BASE[region] || CONV_BASE.US;
    const payload = {
      app_id: senderId,
      recipient: {
        identified_by: {
          channel_identities: [{ channel: 'RCS', identity: to }]
        }
      },
      message,
    };
    const apiRes = await fetch(
      `${baseUrl}/v1/projects/${PROJECT_ID}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );
    const data = await apiRes.json();
    res.status(apiRes.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  Sinch RCS Questionnaire running at http://localhost:${PORT}\n`);
});
