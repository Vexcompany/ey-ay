const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { getPersona }  = require('../personas');
const { callGemini }  = require('../services/gemini');

// POST /api/chat/gemini
router.post('/gemini', async (req, res) => {
  const { message, userId, tipe, persona: personaKey } = req.body;

  if (!message) return res.status(400).json({ error: 'message is required' });
  if (!userId)  return res.status(400).json({ error: 'userId is required' });

  try {
    const user = await db.getOrCreateUser(userId, tipe);
    await db.applyResetIfNeeded(user);

    if (!db.canUseAI(user)) {
      return res.status(429).json({
        error: 'Daily limit reached. Try again tomorrow.',
        used:  user.used,
        daily: user.daily
      });
    }

    const persona = getPersona(personaKey);
    const reply   = await callGemini(message, persona.systemPrompt, personaKey);

    await db.incrementUsage(userId);
    await db.saveMessage(userId, { role: 'user',      text: message });
    await db.saveMessage(userId, { role: 'assistant', text: reply, persona: persona.name });

    res.json({
      reply,
      persona: persona.name,
      usage: { used: user.used + 1, daily: user.daily, tipe: user.tipe }
    });

  } catch (err) {
    console.error(err);
    const status = err.response?.status || 500;
    const errMsg = err.response?.data?.error?.message || 'Server error';
    res.status(status).json({ error: errMsg });
  }
});

// GET /api/chat/history/:userId
router.get('/history/:userId', async (req, res) => {
  try {
    const history = await db.getHistory(req.params.userId);
    res.json({ userId: req.params.userId, history });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// DELETE /api/chat/history/:userId
router.delete('/history/:userId', async (req, res) => {
  try {
    await db.clearHistory(req.params.userId);
    res.json({ message: 'Chat history cleared.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

module.exports = router;
