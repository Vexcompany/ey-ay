const express       = require('express');
const router        = express.Router();
const db            = require('../db');
const { getPersona }   = require('../personas');
const { callGemini }   = require('../services/gemini');
const { requireAuth }  = require('../middleware/auth');

// Semua route chat wajib login
router.use(requireAuth);

// POST /api/chat/gemini
router.post('/gemini', async (req, res) => {
  const { message, persona: personaKey } = req.body;
  const { userId, tipe } = req.user; // dari JWT, tidak bisa dimanipulasi

  if (!message) return res.status(400).json({ error: 'message is required' });

  try {
    const user = await db.getOrCreateUser(String(userId), tipe);
    await db.applyResetIfNeeded(user);

    if (!db.canUseAI(user)) {
      return res.status(429).json({
        error: 'Limit harian habis. Coba lagi besok!',
        used:  user.used,
        daily: user.daily
      });
    }

    const persona = getPersona(personaKey);
    const reply   = await callGemini(message, persona.systemPrompt, personaKey);

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
