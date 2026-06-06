/**
 * Pagaska Music Service
 * Fetch lagu dari Pagaska Music API berdasarkan mood/tag
 * 
 * Env yang diperlukan:
 *   PAGASKA_MUSIC_URL  — base URL API Pagaska Music
 *                        contoh: https://pagaskamusic.vercel.app
 *   (optional) PAGASKA_MUSIC_KEY — API key jika diperlukan
 */
const axios = require('axios');

const MUSIC_BASE = process.env.PAGASKA_MUSIC_URL || 'https://pagaskamusic.vercel.app';
const MUSIC_KEY  = process.env.PAGASKA_MUSIC_KEY  || '';

/**
 * Parse tag [SEND_SONG:mood=xxx] dari teks AI
 * Mengembalikan array { mood } atau [] jika tidak ada
 */
function parseSongTags(text) {
  const regex = /\[SEND_SONG:mood=([a-zA-Z0-9_\-]+)\]/g;
  const tags = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    tags.push({ mood: match[1].toLowerCase() });
  }
  return tags;
}

/**
 * Ambil lagu dari Pagaska Music API berdasarkan mood
 * Return: array of song objects, atau [] jika gagal
 */
async function fetchSongsByMood(mood) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (MUSIC_KEY) headers['Authorization'] = `Bearer ${MUSIC_KEY}`;

    const res = await axios.get(`${MUSIC_BASE}/api/songs`, {
      params: { mood, limit: 3 },
      headers,
      timeout: 8000
    });

    const data = res.data;
    // Support berbagai format response
    const songs = data?.songs ?? data?.data ?? data ?? [];
    if (!Array.isArray(songs)) return [];

    return songs.map(s => ({
      id:       s.id       ?? s._id        ?? null,
      title:    s.title    ?? s.judul      ?? s.name      ?? 'Unknown',
      artist:   s.artist   ?? s.artis      ?? s.by        ?? 'Pagaska Music',
      mood:     s.mood     ?? mood,
      duration: s.duration ?? s.durasi     ?? null,
      cover:    s.cover    ?? s.thumbnail  ?? s.image     ?? null,
      url:      s.url      ?? s.audio      ?? s.stream    ?? null,
      // Boleh ada field tambahan dari API
      ...s
    }));
  } catch (err) {
    console.error('Pagaska Music fetch error:', err.message);
    return [];
  }
}

/**
 * Proses teks AI: ekstrak [SEND_SONG] tags, fetch lagu, return cleaned text + songs
 */
async function processSongTags(text) {
  const tags = parseSongTags(text);
  if (!tags.length) return { text, songs: [] };

  // Hapus semua tag dari teks
  const cleanText = text.replace(/\[SEND_SONG:mood=[a-zA-Z0-9_\-]+\]/g, '').trim();

  // Fetch semua mood (dedup)
  const moods = [...new Set(tags.map(t => t.mood))];
  const songArrays = await Promise.all(moods.map(m => fetchSongsByMood(m)));
  const songs = songArrays.flat();

  return { text: cleanText, songs, moods };
}

module.exports = { parseSongTags, fetchSongsByMood, processSongTags };
