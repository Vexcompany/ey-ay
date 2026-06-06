const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const DAILY_LIMITS = { jabatan: 60, gratis: 40 };

function getLimitForTipe(tipe) {
  return DAILY_LIMITS[tipe] ?? DAILY_LIMITS.gratis;
}

// ── MEMBERS ────────────────────────────────────────────────────

async function findMember(nama, jabatan, generasi) {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .ilike('nama', nama.trim())
    .ilike('jabatan', jabatan.trim())
    .eq('generasi', parseInt(generasi))
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

// ── USERS ──────────────────────────────────────────────────────

async function getOrCreateUser(userId, tipe = 'gratis') {
  const daily = getLimitForTipe(tipe);
  // upsert dengan ignoreDuplicates — aman dipanggil berkali-kali
  await supabase
    .from('users')
    .insert({
      id: userId, tipe, daily, used: 0,
      last_reset: new Date().toISOString(),
      suspended: false, banned: false
    })
    .select()
    .limit(1);
  // Abaikan error insert (kemungkinan duplicate key) — yang penting select di bawah berhasil
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!user) throw new Error(`User ${userId} tidak ditemukan.`);
  if (user.tipe !== tipe) {
    await supabase.from('users').update({ tipe, daily }).eq('id', userId);
    user.tipe  = tipe;
    user.daily = daily;
  }
  return user;
}

async function applyResetIfNeeded(user) {
  const lastReset = new Date(user.last_reset);
  const now       = new Date();
  const isSameDay =
    lastReset.getFullYear() === now.getFullYear() &&
    lastReset.getMonth()    === now.getMonth()    &&
    lastReset.getDate()     === now.getDate();
  if (!isSameDay) {
    await supabase
      .from('users')
      .update({ used: 0, last_reset: now.toISOString() })
      .eq('id', user.id);
    user.used       = 0;
    user.last_reset = now.toISOString();
  }
  return user;
}

function canUseAI(user) { return user.used < user.daily; }

function checkUserStatus(user) {
  if (user.banned)    return { blocked: true, type: 'banned',    reason: user.suspend_reason ?? 'Akun kamu telah dibanned secara permanen. Hubungi admin Pagaska.' };
  if (user.suspended) return { blocked: true, type: 'suspended', reason: user.suspend_reason ?? 'Akun kamu sedang disuspend. Hubungi admin Pagaska.' };
  return { blocked: false };
}

async function incrementUsage(userId) {
  const { error } = await supabase.rpc('increment_usage', { uid: userId });
  if (error) throw error;
}

// ── CHATS ──────────────────────────────────────────────────────

async function saveMessage(userId, { role, text, persona, session_id, songs }) {
  // Coba dengan semua kolom baru dulu
  const payload = {
    user_id:    userId,
    role,
    text,
    persona:    persona    ?? null,
    session_id: session_id ?? null,
  };
  if (songs) {
    try { payload.songs = songs; } catch {}
  }

  const { error } = await supabase.from('chats').insert(payload);
  if (!error) return; // sukses

  // Jika gagal karena kolom belum ada (42703 = undefined_column)
  const isColMissing = error.code === '42703'
    || error.message?.toLowerCase().includes('column')
    || error.message?.toLowerCase().includes('does not exist');

  if (isColMissing) {
    // Fallback: insert tanpa kolom baru
    const { error: e2 } = await supabase
      .from('chats')
      .insert({ user_id: userId, role, text, persona: persona ?? null });
    if (e2) throw e2;
    return;
  }

  throw error;
}

async function getHistory(userId) {
  // Coba dengan kolom baru (session_id, songs) dulu
  const { data, error } = await supabase
    .from('chats')
    .select('role, text, persona, session_id, songs, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (!error) {
    return (data ?? []).map(m => ({
      ...m,
      songs: m.songs
        ? (typeof m.songs === 'string'
            ? (() => { try { return JSON.parse(m.songs); } catch { return null; } })()
            : m.songs)
        : null
    }));
  }

  // Fallback: kolom belum ada di DB — select kolom dasar saja
  const { data: d2, error: e2 } = await supabase
    .from('chats')
    .select('role, text, persona, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (e2) throw e2;
  // session_id = undefined (bukan null) agar grouping tahu kolom tidak ada
  return (d2 ?? []).map(m => ({ ...m, session_id: undefined, songs: null }));
}

async function clearHistory(userId) {
  const { error } = await supabase.from('chats').delete().eq('user_id', userId);
  if (error) throw error;
}

// ── ANNOUNCEMENTS ──────────────────────────────────────────────

async function getActiveAnnouncements() {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, content, type, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw error;
  return data ?? [];
}

module.exports = {
  supabase,
  DAILY_LIMITS,
  findMember,
  getOrCreateUser,
  applyResetIfNeeded,
  canUseAI,
  checkUserStatus,
  incrementUsage,
  saveMessage,
  getHistory,
  clearHistory,
  getActiveAnnouncements
};
