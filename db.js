const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const DAILY_LIMITS = { jabatan: 60, gratis: 40 };

function getLimitForTipe(tipe) {
  return DAILY_LIMITS[tipe] ?? DAILY_LIMITS.gratis;
}

// ── USERS ─────────────────────────────────────────────────────

async function getOrCreateUser(userId, tipe = 'gratis') {
  const daily = getLimitForTipe(tipe);

  // Upsert: insert if not exists, update tipe+daily if tipe changed
  const { data, error } = await supabase
    .from('users')
    .upsert(
      { id: userId, tipe, daily, used: 0, last_reset: new Date().toISOString() },
      { onConflict: 'id', ignoreDuplicates: true }
    )
    .select()
    .single();

  if (error && error.code !== '23505') throw error;

  // Fetch current state
  const { data: user, error: fetchErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (fetchErr) throw fetchErr;

  // Sync daily limit if tipe changed
  if (user.tipe !== tipe) {
    await supabase
      .from('users')
      .update({ tipe, daily })
      .eq('id', userId);
    user.tipe  = tipe;
    user.daily = daily;
  }

  return user;
}

function resetLimitIfNeeded(user) {
  const lastReset = new Date(user.last_reset);
  const now       = new Date();
  const isSameDay =
    lastReset.getFullYear() === now.getFullYear() &&
    lastReset.getMonth()    === now.getMonth()    &&
    lastReset.getDate()     === now.getDate();

  return !isSameDay; // caller handles the reset
}

async function applyResetIfNeeded(user) {
  if (resetLimitIfNeeded(user)) {
    const { error } = await supabase
      .from('users')
      .update({ used: 0, last_reset: new Date().toISOString() })
      .eq('id', user.id);
    if (error) throw error;
    user.used       = 0;
    user.last_reset = new Date().toISOString();
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

// ── CHATS ─────────────────────────────────────────────────────

async function saveMessage(userId, { role, text, persona }) {
  const { error } = await supabase
    .from('chats')
    .insert({ user_id: userId, role, text, persona: persona ?? null });
  if (error) throw error;
}

async function getHistory(userId) {
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function clearHistory(userId) {
  const { error } = await supabase
    .from('chats')
    .delete()
    .eq('user_id', userId);
  if (error) throw error;
}

module.exports = {
  DAILY_LIMITS,
  getOrCreateUser,
  applyResetIfNeeded,
  canUseAI,
  incrementUsage,
  saveMessage,
  getHistory,
  clearHistory
};
