const express       = require('express');
const router        = express.Router();
const { requireAuth } = require('../middleware/auth');
const { supabase }  = require('../db');

router.use(requireAuth);

// ── GET /api/profile ─────────────────────────────────────────
// Ambil profil lengkap user yang sedang login
router.get('/', async (req, res) => {
  const { userId } = req.user;

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select(`
        id, tipe, used, daily, last_reset, created_at,
        avatar_url, bio,
        members (nama, jabatan, generasi)
      `)
      .eq('id', String(userId))
      .maybeSingle();

    if (error) throw error;
    if (!user) return res.status(404).json({ error: 'Profil tidak ditemukan.' });

    res.json({ profile: user });
  } catch (err) {
    console.error('Profile get error:', err);
    res.status(500).json({ error: 'Gagal mengambil profil.' });
  }
});

// ── PATCH /api/profile ───────────────────────────────────────
// Update bio user
router.patch('/', async (req, res) => {
  const { userId } = req.user;
  const { bio } = req.body;

  // Validasi panjang bio
  if (bio && bio.length > 200) {
    return res.status(400).json({ error: 'Bio maksimal 200 karakter.' });
  }

  try {
    const { error } = await supabase
      .from('users')
      .update({ bio: bio ?? null })
      .eq('id', String(userId));

    if (error) throw error;

    res.json({ message: 'Profil berhasil diperbarui.' });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Gagal memperbarui profil.' });
  }
});

// ── POST /api/profile/avatar ─────────────────────────────────
// Upload foto profil ke Supabase Storage
// Kirim sebagai multipart/form-data dengan field "avatar"
// Atau kirim base64 JSON: { "base64": "data:image/...", "ext": "jpg" }
router.post('/avatar', async (req, res) => {
  const { userId } = req.user;

  try {
    const { base64, ext = 'jpg' } = req.body;

    if (!base64) {
      return res.status(400).json({ error: 'Data gambar (base64) wajib dikirim.' });
    }

    // Validasi ekstensi
    const allowedExts = ['jpg', 'jpeg', 'png', 'webp'];
    if (!allowedExts.includes(ext.toLowerCase())) {
      return res.status(400).json({ error: 'Format gambar harus jpg, png, atau webp.' });
    }

    // Decode base64 → buffer
    const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
    const buffer = Buffer.from(base64Data, 'base64');

    // Validasi ukuran (maks 2MB)
    if (buffer.length > 2 * 1024 * 1024) {
      return res.status(400).json({ error: 'Ukuran foto maksimal 2MB.' });
    }

    const fileName  = `avatars/${userId}.${ext}`;
    const mimeType  = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

    // Upload ke Supabase Storage bucket "avatars"
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert: true   // overwrite jika sudah ada
      });

    if (uploadError) throw uploadError;

    // Ambil public URL
    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    const avatarUrl = urlData.publicUrl + `?t=${Date.now()}`; // cache bust

    // Simpan URL ke tabel users
    const { error: updateError } = await supabase
      .from('users')
      .update({ avatar_url: urlData.publicUrl })
      .eq('id', String(userId));

    if (updateError) throw updateError;

    res.json({
      message: 'Foto profil berhasil diperbarui.',
      avatar_url: avatarUrl
    });
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: 'Gagal mengupload foto profil.' });
  }
});

// ── DELETE /api/profile/avatar ───────────────────────────────
// Hapus foto profil (reset ke default)
router.delete('/avatar', async (req, res) => {
  const { userId } = req.user;

  try {
    // Hapus dari storage
    await supabase.storage
      .from('avatars')
      .remove([`avatars/${userId}.jpg`, `avatars/${userId}.png`, `avatars/${userId}.webp`]);

    // Reset URL di database
    const { error } = await supabase
      .from('users')
      .update({ avatar_url: null })
      .eq('id', String(userId));

    if (error) throw error;

    res.json({ message: 'Foto profil berhasil dihapus.' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus foto profil.' });
  }
});

// ── GET /api/profile/leaderboard ────────────────────────────
// Top 10 pengguna berdasarkan total usage (publik, hanya nama + usage)
router.get('/leaderboard', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`
        id, used, daily, tipe, avatar_url,
        members (nama, jabatan, generasi)
      `)
      .eq('banned', false)
      .order('used', { ascending: false })
      .limit(10);

    if (error) throw error;

    res.json({ leaderboard: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil leaderboard.' });
  }
});

module.exports = router;
