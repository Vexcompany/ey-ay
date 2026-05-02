const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Silakan login terlebih dahulu.' });
  }

  try {
    const payload = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    req.user = payload; // { userId, nama, jabatan, generasi, tipe }
    next();
  } catch {
    res.status(401).json({ error: 'Token tidak valid atau sudah expired. Silakan login ulang.' });
  }
}

module.exports = { requireAuth };
