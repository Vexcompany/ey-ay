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
  // Bersihkan input: trim whitespace, normalize spasi ganda
  const cleanNama    = nama.trim().replace(/\s+/g, ' ');
  const cleanJabatan = jabatan.trim().replace(/\s+/g, ' ');
  const cleanGen     = parseInt(generasi);

  const { data, error } = await supabase
    .from('members')
    .select('*')
    .ilike('nama',    cleanNama)
    .ilike('jabatan', cleanJabatan)
    .eq('generasi',   cleanGen)
    .limit(1);

  if (error) throw error;
  return data?.[0] ?? null;
}

// ── USERS ──────────────────────────────────────────────────────

async function getOrCreateUser(userId, tipe = 'gratis') {
  const daily = getLimitForTipe(tipe);

  // Coba insert — abaikan error duplicate key
  await supabase
    .from('users')
    .insert({ id: userId, tipe, daily, used: 0, last_reset: new Date().toISOString() })
    .select()
    .limit(1);

  // Select kolom inti yang pasti ada
  const { data: userCore, error: coreErr } = await supabase
    .from('users')
    .select('id, tipe, used, daily, last_reset')
    .eq('id', userId)
    .maybeSingle();

  if (coreErr) throw coreErr;
  if (!userCore) throw new Error(`User ${userId} tidak ditemukan.`);

  // Coba ambil kolom opsional (suspended, banned, suspend_reason)
  // Kalau belum ada kolom ini, default ke false/null
  let user = { ...userCore, suspended: false, banned: false, suspend_reason: null };
  try {
    const { data: extra } = await supabase
      .from('users')
      .select('suspended, banned, suspend_reason')
      .eq('id', userId)
      .maybeSingle();
    if (extra) {
      user.suspended     = extra.suspended     ?? false;
      user.banned        = extra.banned        ?? false;
      user.suspend_reason = extra.suspend_reason ?? null;
    }
  } catch { /* kolom belum ada — pakai default */ }
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


// ── STORIES (RYXA) ─────────────────────────────────────────────

async function saveStoriesMessage(userId, { role, text, session_id, audio_url }) {
  const payload = { user_id: userId, role, text, session_id: session_id ?? null };
  if (audio_url) payload.audio_url = audio_url;

  const { error } = await supabase.from('stories_chats').insert(payload);
  if (error) {
    // Fallback tanpa audio_url jika kolom belum ada
    if (error.code === '42703' || error.message?.toLowerCase().includes('column')) {
      const { error: e2 } = await supabase
        .from('stories_chats')
        .insert({ user_id: userId, role, text, session_id: session_id ?? null });
      if (e2) {
        // Tabel belum ada — log saja, jangan crash
        console.warn('stories_chats table not found, skipping save:', e2.message);
      }
    } else {
      console.warn('saveStoriesMessage error (non-fatal):', error.message);
    }
  }
}

async function getStoriesHistory(userId) {
  // Coba dengan audio_url dulu
  const { data, error } = await supabase
    .from('stories_chats')
    .select('role, text, session_id, audio_url, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (!error) return data ?? [];

  // Fallback tanpa audio_url
  const { data: d2, error: e2 } = await supabase
    .from('stories_chats')
    .select('role, text, session_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (e2) {
    // Tabel belum ada
    console.warn('stories_chats not available:', e2.message);
    return [];
  }
  return (d2 ?? []).map(m => ({ ...m, audio_url: null }));
}

async function clearStoriesHistory(userId) {
  const { error } = await supabase
    .from('stories_chats')
    .delete()
    .eq('user_id', userId);
  if (error) console.warn('clearStoriesHistory error:', error.message);
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
  getActiveAnnouncements,
  saveStoriesMessage,
  getStoriesHistory,
  clearStoriesHistory
};
