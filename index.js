const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
app.use(bodyParser.json());
app.use(express.static(__dirname)); // serve public.html

async function startTrashcore(number) {
  const sessionPath = path.join(__dirname, 'temp', number);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'info' }), // show logs
    auth: state,
    browser: Browsers.windows('Firefox'),
    printQRInTerminal: false
  });

  // Save creds whenever they update
  sock.ev.on('creds.update', async () => {
    await saveCreds();
    const sessionBase64 = Buffer.from(JSON.stringify(state.creds)).toString('base64');
    const jid = state.creds.me?.id;
    if (jid) {
      console.log(`✅ Session registered for ${jid}`);
      await sock.sendMessage(jid, { text: `✅ Your Trashcore session ID:\n${sessionBase64}` });
    }
  });

  // Log connection updates
  sock.ev.on('connection.update', (update) => {
    console.log("🔌 Connection update:", update);
  });

  return sock;
}

async function getPairingCode(phoneNumber) {
  const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
  const sock = await startTrashcore(cleanNumber);

  // Only generate pairing code if not registered
  if (!sock.authState.creds.registered) {
    try {
      const code = await sock.requestPairingCode(cleanNumber, "TRASHBOT");
      console.log(`📲 Pairing code for ${cleanNumber}: ${code}`);
      return code;
    } catch (err) {
      console.error("❌ Error generating pairing code:", err);
      throw err;
    }
  } else {
    throw new Error("Session already registered, cannot generate new pairing code.");
  }
}

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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
