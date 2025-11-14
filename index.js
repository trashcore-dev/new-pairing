const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs'); // 👈 add this
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
app.use(bodyParser.json());
app.use(express.static(__dirname));

// ... keep your existing startTrashcore and getPairingCode functions ...

app.post('/pair', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: 'Phone number required' });

  try {
    const code = await getPairingCode(phoneNumber);
    res.json({ pairingCode: code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 👇 NEW route to delete a session
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
    console.error("❌ Error deleting session:", err);
    res.status(500).json({ error: 'Failed to delete session.' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
