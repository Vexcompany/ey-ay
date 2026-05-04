const express        = require('express');
const router         = express.Router();
const { requireAdmin } = require('../middleware/admin');
const { supabase }   = require('../db');

// Semua route admin wajib pakai password admin
router.use(requireAdmin);

// ── GET /api/admin/users ────────────────────────────────────
// List semua user + info member + usage
router.get('/users', async (req, res) => {
  try {
    // Ambil semua users dengan join ke members
    const { data: users, error } = await supabase
      .from('users')
      .select(`
        id, tipe, used, daily, last_reset, suspended, banned,
        suspend_reason, created_at,
        members (nama, jabatan, generasi)
      `)
      .order('used', { ascending: false });

    if (error) throw error;

    res.json({ users: users ?? [] });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Gagal mengambil data users.' });
  }
});

// ── GET /api/admin/users/:userId ────────────────────────────
// Detail satu user
router.get('/users/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select(`
        id, tipe, used, daily, last_reset, suspended, banned,
        suspend_reason, created_at,
        members (nama, jabatan, generasi)
      `)
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });

    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil data user.' });
  }
});

// ── GET /api/admin/chats/:userId ────────────────────────────
// Lihat riwayat chat user tertentu
router.get('/chats/:userId', async (req, res) => {
  const { userId } = req.params;
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;

  try {
    const { data: chats, error, count } = await supabase
      .from('chats')
      .select('id, role, text, persona, created_at', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      chats: chats ?? [],
      total: count ?? 0,
      limit,
      offset
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil riwayat chat.' });
  }
});

// ── GET /api/admin/chats ─────────────────────────────────────
// Lihat semua chat terbaru (lintas user)
router.get('/chats', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;

  try {
    const { data: chats, error } = await supabase
      .from('chats')
      .select(`
        id, user_id, role, text, persona, created_at,
        users (
          members (nama, jabatan)
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json({ chats: chats ?? [] });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil chat terbaru.' });
  }
});

// ── POST /api/admin/suspend/:userId ─────────────────────────
// Suspend user (masih bisa login tapi tidak bisa chat)
router.post('/suspend/:userId', async (req, res) => {
  const { userId } = req.params;
  const { reason = 'Pelanggaran kebijakan penggunaan.' } = req.body;

  try {
    const { error } = await supabase
      .from('users')
      .update({
        suspended: true,
        suspend_reason: reason,
        suspended_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) throw error;

    res.json({ message: `User ${userId} berhasil disuspend.`, reason });
  } catch (err) {
    res.status(500).json({ error: 'Gagal suspend user.' });
  }
});

// ── POST /api/admin/unsuspend/:userId ───────────────────────
// Cabut suspend
router.post('/unsuspend/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const { error } = await supabase
      .from('users')
      .update({
        suspended: false,
        suspend_reason: null,
        suspended_at: null
      })
      .eq('id', userId);

    if (error) throw error;

    res.json({ message: `Suspend user ${userId} berhasil dicabut.` });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mencabut suspend.' });
  }
});

// ── POST /api/admin/ban/:userId ──────────────────────────────
// Ban permanen user (tidak bisa login sama sekali)
router.post('/ban/:userId', async (req, res) => {
  const { userId } = req.params;
  const { reason = 'Pelanggaran berat kebijakan penggunaan.' } = req.body;

  try {
    const { error } = await supabase
      .from('users')
      .update({
        banned: true,
        suspended: true,
        suspend_reason: `[BAN] ${reason}`,
        suspended_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) throw error;

    res.json({ message: `User ${userId} berhasil dibanned permanen.`, reason });
  } catch (err) {
    res.status(500).json({ error: 'Gagal ban user.' });
  }
});

// ── POST /api/admin/unban/:userId ────────────────────────────
// Cabut ban
router.post('/unban/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const { error } = await supabase
      .from('users')
      .update({
        banned: false,
        suspended: false,
        suspend_reason: null,
        suspended_at: null
      })
      .eq('id', userId);

    if (error) throw error;

    res.json({ message: `Ban user ${userId} berhasil dicabut.` });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mencabut ban.' });
  }
});

// ── POST /api/admin/reset/:userId ────────────────────────────
// Reset limit harian user (untuk kompensasi error)
router.post('/reset/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const { error } = await supabase
      .from('users')
      .update({
        used: 0,
        last_reset: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) throw error;

    res.json({ message: `Limit user ${userId} berhasil direset.` });
  } catch (err) {
    res.status(500).json({ error: 'Gagal reset limit.' });
  }
});

// ── POST /api/admin/set-limit/:userId ───────────────────────
// Ubah daily limit user secara manual
router.post('/set-limit/:userId', async (req, res) => {
  const { userId } = req.params;
  const { daily, tipe } = req.body;

  if (!daily || isNaN(daily)) {
    return res.status(400).json({ error: 'daily harus berupa angka.' });
  }

  try {
    const update = { daily: parseInt(daily) };
    if (tipe) update.tipe = tipe;

    const { error } = await supabase
      .from('users')
      .update(update)
      .eq('id', userId);

    if (error) throw error;

    res.json({ message: `Limit user ${userId} diubah ke ${daily}.` });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengubah limit.' });
  }
});

// ── GET /api/admin/stats ─────────────────────────────────────
// Statistik global
router.get('/stats', async (req, res) => {
  try {
    const [
      { count: totalUsers },
      { count: totalChats },
      { data: activeToday },
      { data: topUsers }
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('chats').select('*', { count: 'exact', head: true }),
      supabase.from('users')
        .select('id', { count: 'exact' })
        .gt('used', 0)
        .gte('last_reset', new Date().toISOString().split('T')[0]),
      supabase.from('users')
        .select('id, used, daily, members(nama, jabatan)')
        .order('used', { ascending: false })
        .limit(5)
    ]);

    res.json({
      stats: {
        totalUsers: totalUsers ?? 0,
        totalChats: totalChats ?? 0,
        activeToday: activeToday?.length ?? 0,
        topUsers: topUsers ?? []
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil statistik.' });
  }
});

// ── GET /api/admin/announcements ────────────────────────────
// List pengumuman
router.get('/announcements', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ announcements: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil pengumuman.' });
  }
});

// ── POST /api/admin/announcements ───────────────────────────
// Buat pengumuman baru
router.post('/announcements', async (req, res) => {
  const { title, content, type = 'info' } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: 'title dan content wajib diisi.' });
  }

  try {
    const { data, error } = await supabase
      .from('announcements')
      .insert({ title, content, type })
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Pengumuman berhasil dibuat.', announcement: data });
  } catch (err) {
    res.status(500).json({ error: 'Gagal membuat pengumuman.' });
  }
});

// ── DELETE /api/admin/announcements/:id ─────────────────────
// Hapus pengumuman
router.delete('/announcements/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Pengumuman berhasil dihapus.' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus pengumuman.' });
  }
});

module.exports = router;
