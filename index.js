const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
app.use(bodyParser.json());
app.use(express.static(__dirname));

// --- Stats ---
let totalRequests = 0;
const serverStart = Date.now();

// --- Baileys setup ---
async function startTrashcore(number) {
  const sessionPath = path.join(__dirname, 'temp', number);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'info' }),
    auth: state,
    browser: Browsers.windows('Firefox'),
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (update) => {
    console.log('🔌 Connection update:', update);
  });

  return { sock, state };
}

// --- Pairing code logic (ENSURE THIS EXISTS) ---
async function getPairingCode(phoneNumber) {
  const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
  const { sock, state } = await startTrashcore(cleanNumber);

  if (!state.creds.registered) {
    try {
      const code = await sock.requestPairingCode(cleanNumber, 'TRASHBOT');
      console.log(`📲 Pairing code for ${cleanNumber}: ${code}`);
      return code;
    } catch (err) {
      console.error('❌ Error generating pairing code:', err);
      throw err;
    }
  } else {
    throw new Error('Session already registered, cannot generate new pairing code.');
  }
}

// --- Routes ---
app.post('/pair', async (req, res) => {
  totalRequests++;
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: 'Phone number required' });

  try {
    const code = await getPairingCode(phoneNumber);
    res.json({ pairingCode: code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete session for a number
app.post('/delete-session', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: 'Phone number required' });

  try {
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    const sessionPath = path.join(__dirname, 'temp', cleanNumber);

    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      console.log(`🗑️ Deleted session for ${cleanNumber}`);
      res.json({ success: true, message: 'Session deleted successfully.' });
    } else {
      res.status(404).json({ error: 'No session found for this number.' });
    }
  } catch (err) {
    console.error('❌ Error deleting session:', err);
    res.status(500).json({ error: 'Failed to delete session.' });
  }
});

// Stats endpoint
app.get('/stats', (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - serverStart) / 1000);
  res.json({ requests: totalRequests, uptime: uptimeSeconds });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
