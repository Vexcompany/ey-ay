const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const db      = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
console.log('JWT_SECRET loaded:', !!JWT_SECRET);

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { nama, jabatan, generasi } = req.body;

  if (!nama || !jabatan || !generasi) {
    return res.status(400).json({ error: 'nama, jabatan, dan generasi wajib diisi.' });
  }

  try {
    const member = await db.findMember(nama, jabatan, generasi);

    if (!member) {
      return res.status(401).json({ error: 'Data tidak ditemukan. Periksa nama, jabatan, dan generasi.' });
    }

    // Buat token JWT — expire 7 hari
    const token = jwt.sign(
      {
        userId:   member.id,
        nama:     member.nama,
        jabatan:  member.jabatan,
        generasi: member.generasi,
        tipe:     member.tipe
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Pastikan user ada di tabel users (untuk rate limit)
    await db.getOrCreateUser(String(member.id), member.tipe);

    res.json({
      token,
      user: {
        id:       member.id,
        nama:     member.nama,
        jabatan:  member.jabatan,
        generasi: member.generasi,
        tipe:     member.tipe
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error saat login.' });
  }
});

// GET /api/auth/me — validasi token & return user info
router.get('/me', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token tidak ada.' });
  }

  try {
    const payload = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    res.json({ user: payload });
  } catch {
    res.status(401).json({ error: 'Token tidak valid atau expired.' });
  }
});

module.exports = router;
