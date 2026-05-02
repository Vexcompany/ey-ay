const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const DAILY_LIMITS = { jabatan: 60, gratis: 40 };

function getLimitForTipe(tipe) {
  return DAILY_LIMITS[tipe] ?? DAILY_LIMITS.gratis;
}

// ── MEMBERS (validasi login) ───────────────────────────────────

async function findMember(nama, jabatan, generasi) {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .ilike('nama', nama.trim())
    .ilike('jabatan', jabatan.trim())
    .eq('generasi', parseInt(generasi))
    .maybeSingle();

  if (error) throw error;
  return data; // null jika tidak ditemukan
}

// ── USERS (rate limit) ─────────────────────────────────────────

async function getOrCreateUser(userId, tipe = 'gratis') {
  const daily = getLimitForTipe(tipe);

  // Insert jika belum ada, abaikan conflict
  await supabase
    .from('users')
    .insert({ id: userId, tipe, daily, used: 0, last_reset: new Date().toISOString() })
    .maybeSingle();

  // Fetch state terkini
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!user) throw new Error(`User ${userId} tidak ditemukan.`);

  // Sync tipe jika berubah
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

function canUseAI(user) {
  return user.used < user.daily;
}

async function incrementUsage(userId) {
  const { error } = await supabase.rpc('increment_usage', { uid: userId });
  if (error) throw error;
}

// ── CHATS ──────────────────────────────────────────────────────

async function saveMessage(userId, { role, text, persona }) {
  const { error } = await supabase
    .from('chats')
    .insert({ user_id: userId, role, text, persona: persona ?? null });
  if (error) throw error;
}

async function getHistory(userId) {
  const { data, error } = await supabase
    .from('chats')
    .select('role, text, persona, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function clearHistory(userId) {
  const { error } = await supabase.from('chats').delete().eq('user_id', userId);
  if (error) throw error;
}

module.exports = {
  supabase,
  DAILY_LIMITS,
  findMember,
  getOrCreateUser,
  applyResetIfNeeded,
  canUseAI,
  incrementUsage,
  saveMessage,
  getHistory,
  clearHistory
};
