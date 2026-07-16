const express              = require('express');
const router               = express.Router();
const db                   = require('../db');
const { generateStory, generateTTS, isStoryResponse } = require('../services/ryxa');
const { requireAuth }      = require('../middleware/auth');

router.use(requireAuth);

// POST /api/stories/chat
// Kirim pesan ke Ryxa, dapat balasan teks + audio URL jika itu cerita
router.post('/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  const { userId, tipe }       = req.user;

  if (!message) return res.status(400).json({ error: 'message is required' });

  try {
    // Cek status user (banned/suspended/limit)
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

    // Ambil riwayat stories untuk konteks (max 10 pesan terakhir)
    const rawHistory = await db.getStoriesHistory(String(userId));
    const historyMessages = rawHistory.slice(-10).map(m => ({
      role:    m.role === 'assistant' ? 'assistant' : 'user',
      content: m.text
    }));

    // Generate cerita dari Ryxa
    const reply = await generateStory(message, historyMessages);
    const isStory = isStoryResponse(reply);

    // Kalau ini cerita → generate TTS
    let audio = null;
    if (isStory) {
      try {
        audio = await generateTTS(reply);
      } catch (ttsErr) {
        console.error('TTS error (non-fatal):', ttsErr.message);
        audio = { url: null, error: 'Gagal generate TTS: ' + ttsErr.message };
      }
    }

    // Increment usage & simpan ke history
    await db.incrementUsage(String(userId));
    const sid = sessionId || null;
    await db.saveStoriesMessage(String(userId), { role: 'user',      text: message,                session_id: sid });
    await db.saveStoriesMessage(String(userId), { role: 'assistant', text: reply, session_id: sid, audio_url: audio?.url || null });

    // Ambil usage terbaru
    const updatedUser = await db.getOrCreateUser(String(userId), tipe);

    res.json({
      reply,
      is_story: isStory,
      audio:    audio || null,
      usage:    { used: updatedUser.used, daily: updatedUser.daily, tipe }
    });

  } catch (err) {
    console.error('Stories chat error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// GET /api/stories/history
router.get('/history', async (req, res) => {
  try {
    const raw = await db.getStoriesHistory(String(req.user.userId));

    if (!raw || !raw.length) {
      return res.json({ sessions: [], total_messages: 0 });
    }

    // Deteksi apakah kolom session_id tersedia
    const hasSessionId = raw.some(m => m.session_id !== undefined && m.session_id !== null);

    const sessions = [];
    let cur = null;

    for (const msg of raw) {
      // Jangan tambahkan fallback audio_url untuk pesan lama
      // Biarkan null jika memang tidak ada — frontend yang handle

      const sid = hasSessionId ? (msg.session_id || null) : null;
      const day = new Date(msg.created_at).toDateString();

      let same = false;
      if (cur) {
        if (hasSessionId && sid && cur.session_id === sid) {
          same = true;
        } else if (hasSessionId && !sid && !cur.session_id) {
          same = (cur._day === day);
        } else if (!hasSessionId) {
          same = (cur._day === day);
        }
      }

      if (same) {
        cur.messages.push(msg);
        cur.last_at = msg.created_at;
        cur.message_count = (cur.message_count || 1) + 1;
      } else {
        cur = {
          session_id:    sid || `day_${day.replace(/ /g, '_')}`,
          _day:          day,
          started_at:    msg.created_at,
          last_at:       msg.created_at,
          title:         msg.role === 'user' ? (msg.text?.slice(0, 80) || 'Sesi Dongeng') : 'Sesi Dongeng',
          message_count: 1,
          messages:      [msg]
        };
        sessions.push(cur);
      }
    }

    res.json({
      sessions:       sessions.reverse(),
      total_messages: raw.length
    });
  } catch (err) {
    console.error('Stories history error:', err);
    res.status(500).json({ error: 'Gagal mengambil riwayat.', detail: err.message });
  }
});

// DELETE /api/stories/history
router.delete('/history', async (req, res) => {
  try {
    await db.clearStoriesHistory(String(req.user.userId));
    res.json({ message: 'Riwayat stories dihapus.' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus riwayat.' });
  }
});

module.exports = router;
