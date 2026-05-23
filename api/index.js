require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const jwt          = require('jsonwebtoken');
const authRoutes   = require('../routes/auth');
const chatRoutes   = require('../routes/chat');
const adminRoutes  = require('../routes/admin');
const profileRoutes = require('../routes/profile');
const { supabase } = require('../db');

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.use('/api/auth',    authRoutes);
app.use('/api/chat',    chatRoutes);
app.use('/api/admin',   adminRoutes);
app.use('/api/profile', profileRoutes);

// ── GET /api/admin/announcements (public, pakai Bearer token biasa) ──
// Duplikat endpoint agar frontend user bisa baca pengumuman tanpa admin password
app.get('/api/announcements', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  try {
    jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token tidak valid.' });
  }
  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, content, type, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    res.json({ announcements: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil pengumuman.' });
  }
});

app.get('/', (req, res) => res.json({ status: 'ok', service: 'Taksaka AI' }));

module.exports = app;
