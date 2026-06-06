const express          = require('express');
const router           = express.Router();
const db               = require('../db');
const { getPersona }   = require('../personas');
const { callGemini }   = require('../services/gemini');
const { callVynaa }    = require('../services/vynaa');
const { processSongTags } = require('../services/music');
const { requireAuth }  = require('../middleware/auth');

router.use(requireAuth);

// POST /api/chat/gemini
router.post('/gemini', async (req, res) => {
  const { message, persona: personaKey, sessionId } = req.body;
  const { userId, tipe } = req.user;

  if (!message) return res.status(400).json({ error: 'message is required' });

  try {
    const user = await db.getOrCreateUser(String(userId), tipe);
    await db.applyResetIfNeeded(user);

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

    // Ambil riwayat untuk konteks (maks 20 pesan terakhir)
    const rawHistory = await db.getHistory(String(userId));
    const recentHistory = rawHistory.slice(-20);
    const historyMessages = recentHistory.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.text
    }));

    const persona = getPersona(personaKey);
    const rawReply = await callGemini(message, persona.systemPrompt, personaKey, historyMessages);

    // Proses tag [SEND_SONG:mood=xxx] jika ada
    const { text: reply, songs, moods } = await processSongTags(rawReply);

    await db.incrementUsage(String(userId));

    // Simpan session_id agar bisa dikelompokkan di riwayat
    const sid = sessionId || null;
    await db.saveMessage(String(userId), { role: 'user',      text: message, session_id: sid });
    await db.saveMessage(String(userId), { role: 'assistant', text: reply,   persona: persona.name, session_id: sid, songs: songs.length ? songs : null });

    res.json({
      reply,
      persona: persona.name,
      songs: songs.length ? songs : undefined,
      moods: moods?.length ? moods : undefined,
      usage: { used: user.used + 1, daily: user.daily, tipe }
    });

  } catch (err) {
    console.error('Chat error:', err);
    const status = err.response?.status || 500;
    const errMsg = err.response?.data?.error?.message || 'Server error';
    res.status(status).json({ error: errMsg });
  }
});

// POST /api/chat/vynaa
router.post('/vynaa', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    const reply = await callVynaa(message);
    res.json({ success: true, reply });
  } catch (err) {
    console.error('Vynaa error:', err);
    res.status(500).json({ error: 'AI request failed' });
  }
});

// GET /api/chat/history
// Mengembalikan history yang sudah dikelompokkan per sesi
router.get('/history', async (req, res) => {
  try {
    const raw = await db.getHistory(String(req.user.userId));

    // Kelompokkan per sesi: jika ada session_id pakai itu,
    // jika tidak (data lama) kelompokkan berdasarkan gap waktu > 30 menit
    const SESSION_GAP_MS = 30 * 60 * 1000; // 30 menit
    const sessions = [];
    let currentSession = null;

    for (const msg of raw) {
      const msgTime = new Date(msg.created_at).getTime();
      const sid = msg.session_id || null;

      // Tentukan apakah pesan ini bagian dari sesi yang sama
      let sameSession = false;
      if (currentSession) {
        if (sid && currentSession.session_id === sid) {
          sameSession = true;
        } else if (!sid && !currentSession.session_id) {
          const lastTime = new Date(currentSession.messages[currentSession.messages.length - 1].created_at).getTime();
          if (msgTime - lastTime < SESSION_GAP_MS) {
            sameSession = true;
          }
        }
      }

      if (sameSession) {
        currentSession.messages.push(msg);
        currentSession.last_at = msg.created_at;
      } else {
        currentSession = {
          session_id: sid || `auto_${sessions.length}`,
          started_at: msg.created_at,
          last_at:    msg.created_at,
          messages:   [msg]
        };
        sessions.push(currentSession);
      }
    }

    // Tambahkan metadata ringkas per sesi
    const enriched = sessions.map(s => {
      const firstUser = s.messages.find(m => m.role === 'user');
      const lastAI    = [...s.messages].reverse().find(m => m.role === 'assistant');
      const persona   = lastAI?.persona || 'Kak Taksaka';
      return {
        session_id:  s.session_id,
        started_at:  s.started_at,
        last_at:     s.last_at,
        title:       firstUser?.text?.slice(0, 80) || 'Sesi Chat',
        persona,
        message_count: s.messages.length,
        messages:    s.messages
      };
    });

    // Urutkan terbaru dulu
    enriched.reverse();

    res.json({ sessions: enriched, total_messages: raw.length });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Gagal mengambil history.' });
  }
});

// DELETE /api/chat/history
router.delete('/history', async (req, res) => {
  try {
    await db.clearHistory(String(req.user.userId));
    res.json({ message: 'Chat history cleared.' });
  } catch (err) {
    console.error('Clear history error:', err);
    res.status(500).json({ error: 'Gagal menghapus history.' });
  }
});

module.exports = router;
