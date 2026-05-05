const express          = require('express');
const router           = express.Router();
const db               = require('../db');
const { getPersona }   = require('../personas');
const { callGemini }   = require('../services/gemini');
const { requireAuth }  = require('../middleware/auth');

router.use(requireAuth);

// POST /api/chat/gemini
router.post('/gemini', async (req, res) => {
  const { message, persona: personaKey } = req.body;
  const { userId, tipe } = req.user;

  if (!message) return res.status(400).json({ error: 'message is required' });

  try {
    const user = await db.getOrCreateUser(String(userId), tipe);
    await db.applyResetIfNeeded(user);

    // Cek status suspend / ban
    const status = db.checkUserStatus(user);
    if (status.blocked) {
      return res.status(403).json({ error: status.reason, type: status.type });
    }

    if (!db.canUseAI(user)) {
      return res.status(429).json({
        error: 'Limit harian habis. Coba lagi besok!',
        used:  user.used,
        daily: user.daily
      });
    }

    // Ambil riwayat chat untuk konteks percakapan (maks 20 pesan terakhir)
    const rawHistory = await db.getHistory(String(userId));
    const recentHistory = rawHistory.slice(-20); // ambil 20 terakhir

    // Format ke struktur messages untuk GPT
    const historyMessages = recentHistory.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.text
    }));

    const persona = getPersona(personaKey);

    // Kirim ke GPT dengan history sebagai konteks
    const reply = await callGemini(message, persona.systemPrompt, personaKey, historyMessages);

    await db.incrementUsage(String(userId));
    await db.saveMessage(String(userId), { role: 'user',      text: message });
    await db.saveMessage(String(userId), { role: 'assistant', text: reply, persona: persona.name });

    res.json({
      reply,
      persona: persona.name,
      usage: { used: user.used + 1, daily: user.daily, tipe }
    });

  } catch (err) {
    console.error('Chat error:', err);
    const status = err.response?.status || 500;
    const errMsg = err.response?.data?.error?.message || 'Server error';
    res.status(status).json({ error: errMsg });
  }
});

// GET /api/chat/history
router.get('/history', async (req, res) => {
  try {
    const history = await db.getHistory(String(req.user.userId));
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil history.' });
  }
});

// DELETE /api/chat/history
router.delete('/history', async (req, res) => {
  try {
    await db.clearHistory(String(req.user.userId));
    res.json({ message: 'Chat history cleared.' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus history.' });
  }
});

module.exports = router;
