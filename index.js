const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
app.use(bodyParser.json());
app.use(express.static(__dirname)); // serve public.html

// --- Request tracking ---
const requestTracker = {};
const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes
const MAX_REQUESTS = 10;            // max requests per day

function resetDailyCounters() {
  const today = new Date().toDateString();
  for (const number in requestTracker) {
    if (requestTracker[number].day !== today) {
      requestTracker[number].count = 0;
      requestTracker[number].day = today;
    }
  }
}
// Run reset every hour
setInterval(resetDailyCounters, 60 * 60 * 1000);

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
    console.log("🔌 Connection update:", update);
  });

  return { sock, state };
}

// --- Pairing code logic ---
async function getPairingCode(phoneNumber) {
  const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
  const today = new Date().toDateString();

  // Initialize tracker
  if (!requestTracker[cleanNumber]) {
    requestTracker[cleanNumber] = { count: 0, lastRequest: 0, day: today };
  }

  const now = Date.now();
  const tracker = requestTracker[cleanNumber];

  // Reset if new day
  if (tracker.day !== today) {
    tracker.count = 0;
    tracker.day = today;
  }

  // Cooldown check
  if (now - tracker.lastRequest < COOLDOWN_MS) {
    throw new Error("⏳ Please wait before requesting another pairing code.");
  }

  // Max requests check
  if (tracker.count >= MAX_REQUESTS) {
    throw new Error("🚫 Maximum pairing code requests reached for today.");
  }

  // Update tracker
  tracker.count++;
  tracker.lastRequest = now;

  // --- Baileys pairing ---
  const { sock, state } = await startTrashcore(cleanNumber);

  if (!state.creds.registered) {
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

// --- Routes ---
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
