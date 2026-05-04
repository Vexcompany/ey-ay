const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'PagaskaAI';

/**
 * Middleware untuk proteksi route admin.
 * Client kirim header: Authorization: Admin <password>
 */
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith('Admin ')) {
    return res.status(401).json({ error: 'Akses ditolak. Header Authorization: Admin <password> diperlukan.' });
  }

  const password = auth.split(' ')[1];
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Password admin salah.' });
  }

  next();
}

module.exports = { requireAdmin };
