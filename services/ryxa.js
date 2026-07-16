/**
 * Ryxa Stories Service
 * Generate dongeng menggunakan GPT-4 dengan persona Ryxa
 * lalu convert ke audio via TTS API
 */
const axios = require('axios');
const https = require('https');

// ── TTS CONFIG ────────────────────────────────────────────────
// Primary: FreeTTS (Microsoft Azure Neural, gratis, no key, 400+ voices)
const FREETTS_BASE  = 'https://freetts.org/api';
const TTS_VOICE     = process.env.TTS_VOICE     || 'id-ID-GadisNeural';    // Indonesian female
const TTS_VOICE_ALT = process.env.TTS_VOICE_ALT || 'id-ID-ArdiNeural';     // Indonesian male

// Secondary: VoiceRSS (gratis 350 req/hari, perlu API key dari voicerss.org)
const VOICERSS_KEY  = process.env.VOICERSS_API_KEY || '';

// Daftar suara Indonesia yang tersedia di FreeTTS
const ID_VOICES = [
  'id-ID-GadisNeural',
  'id-ID-ArdiNeural',
];

// ── SYSTEM PROMPT RYXA ───────────────────────────────────────
const RYXA_SYSTEM_PROMPT = `Kamu adalah Ryxa, AI Pendongeng Resmi PAGASKA (Paskibra Gala Taksaka SMKN 5 Kota Madiun).

IDENTITAS:
- Nama: Ryxa
- Peran: Penjaga Perpustakaan Dongeng Digital PAGASKA
- Motto: "Setiap kisah memiliki cahaya untuk ditemukan."
- Jangan pernah mengaku sebagai AI, chatbot, atau language model.

KEPRIBADIAN:
- Perempuan muda yang hangat, ceria, kreatif, dan penuh imajinasi.
- Berbicara dengan lembut dan bersahabat.
- Selalu antusias saat ada permintaan dongeng.

GAYA BERCERITA — PENTING UNTUK TTS:
- Gunakan paragraf pendek (2-4 kalimat per paragraf), pisahkan dengan baris kosong.
- Kaya deskripsi visual dan suasana, mengalir seperti dibacakan langsung.
- JANGAN gunakan tanda "~", emoji, tanda bintang (*), atau markdown apapun.
- Gunakan "..." untuk jeda dramatis agar TTS terdengar natural.
- Gunakan tanda seru "!" untuk momen menegangkan atau mengejutkan.
- Kalimat pendek dan jelas agar enak didengar, bukan dibaca.
- Batas panjang cerita: maksimal 600 kata.

STRUKTUR CERITA:
1. Pembukaan menarik — langsung masuk suasana, jangan bertele-tele.
2. Perkenalkan tokoh dan latar secara natural dalam alur cerita.
3. Bangun rasa penasaran dan konflik kecil.
4. Resolusi yang hangat.
5. Penutup dengan pesan moral halus — tidak menggurui.

SAAT MEMULAI CERITA:
- Awali SELALU dengan kalimat: "Baik, aku mulai yaa..."
- Langsung masuk ke pembukaan cerita setelah kalimat itu.
- Tidak perlu kata pengantar tambahan.

SAAT PENGGUNA TIDAK SPESIFIK:
- Tanyakan tema, tokoh, atau suasana yang diinginkan.
- Berikan 4 pilihan ide cerita yang menarik dan berbeda.
- Pilihan ditulis dalam format bernomor sederhana, tanpa markdown.
- Contoh format respons saat tidak spesifik:
  "Hii! Aku siap mendongengkan cerita untuk kamu. Kamu mau cerita tentang apa hari ini?

  1. Petualangan seorang prajurit muda yang ingin jadi pengibar bendera
  2. Misteri hutan di balik markas latihan
  3. Persahabatan dua anggota dari generasi berbeda
  4. Kisah bendera tua yang menyimpan kenangan

  Pilih salah satu, atau ceritain ide ceritamu sendiri!"

TEMA YANG COCOK:
- Paskibra, latihan, pengibaran bendera, keberanian, persahabatan
- Petualangan, misteri ringan, kerajaan, alam
- Cerita pengantar tidur yang tenang dan hangat
- Inspirasi dan semangat anak muda

YANG TIDAK BOLEH:
- Konten dewasa, kekerasan berlebihan, atau horor berat
- Jawaban di luar konteks cerita/dongeng (arahkan kembali dengan lembut)`;

// ── GENERATE STORY ────────────────────────────────────────────
async function generateStory(message, historyMessages = []) {
  const messages = [
    ...historyMessages,
    { role: 'user', content: message }
  ];

  const { data } = await axios.post(
    'https://chateverywhere.app/api/chat/',
    {
      model: {
        id: 'gpt-4',
        name: 'GPT-4',
        maxLength: 32000,
        tokenLimit: 8000,
        completionTokenLimit: 5000,
        deploymentName: 'gpt-4'
      },
      messages,
      prompt: RYXA_SYSTEM_PROMPT,
      temperature: 0.85
    },
    {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
      },
      timeout: 45000
    }
  );

  if (typeof data === 'string' && data.trim()) return data.trim();
  if (data?.choices?.[0]?.message?.content) return data.choices[0].message.content.trim();
  if (data?.content) return String(data.content).trim();
  if (data?.text)    return String(data.text).trim();

  throw new Error('Format response tidak dikenali');
}

// ── DETECT IS STORY ───────────────────────────────────────────
function isStoryResponse(text) {
  const lower = text.toLowerCase().trim();
  if (lower.includes('1.') && lower.includes('2.') && (lower.includes('pilih') || lower.includes('cerita tentang apa'))) {
    return false;
  }
  return lower.startsWith('baik') ||
         lower.startsWith('tentu') ||
         lower.startsWith('mari') ||
         lower.startsWith('ini') ||
         lower.startsWith('suatu') ||
         lower.startsWith('pada') ||
         lower.length > 40;
}

// ── TTS HELPERS ───────────────────────────────────────────────

/**
 * Download audio dari URL dan konversi ke base64 data URI.
 */
function downloadAsBase64(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 20000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, { timeout: 20000 }, (r2) => {
          const chunks = [];
          r2.on('data', c => chunks.push(c));
          r2.on('end', () => {
            const buf = Buffer.concat(chunks);
            const mime = r2.headers['content-type'] || 'audio/mpeg';
            resolve(`data:${mime};base64,${buf.toString('base64')}`);
          });
          r2.on('error', reject);
        }).on('error', reject);
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const mime = res.headers['content-type'] || 'audio/mpeg';
        resolve(`data:${mime};base64,${buf.toString('base64')}`);
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Potong teks ke batas karakter, di akhir kalimat terdekat.
 */
function truncateText(text, maxChars) {
  if (text.length <= maxChars) return text;
  let t = text.substring(0, maxChars);
  const last = Math.max(t.lastIndexOf('.'), t.lastIndexOf('!'), t.lastIndexOf('?'));
  if (last > maxChars * 0.5) t = t.substring(0, last + 1);
  return t.trim();
}

// ── TTS PROVIDERS ─────────────────────────────────────────────

/**
 * FreeTTS — Microsoft Azure Neural TTS (gratis, no key)
 * Rate limit: 20 req/min, 1000 chars/req
 */
async function ttsFreeTTS(text) {
  const ttsText = truncateText(text, 950);
  console.log(`[FreeTTS] ${ttsText.length} chars`);

  for (const voice of [TTS_VOICE, TTS_VOICE_ALT, ...ID_VOICES.filter(v => v !== TTS_VOICE && v !== TTS_VOICE_ALT)]) {
    try {
      console.log(`[FreeTTS] Voice: ${voice}`);
      const gen = await axios.post(`${FREETTS_BASE}/tts`,
        { text: ttsText, voice, rate: '-5%', pitch: '+0Hz' },
        { headers: { 'Content-Type': 'application/json' }, timeout: 20000 }
      );

      const fileId = gen.data?.file_id;
      if (!fileId) {
        console.warn(`[FreeTTS] No file_id: ${JSON.stringify(gen.data).slice(0, 150)}`);
        continue;
      }

      const dataUri = await downloadAsBase64(`${FREETTS_BASE}/audio/${fileId}`);
      if (dataUri && dataUri.length > 1000) {
        console.log(`[FreeTTS] OK — ${voice} (${(dataUri.length/1024).toFixed(0)}KB)`);
        return { url: dataUri, model: 'azure-neural', voice_name: voice.replace(/^id-ID-|Neural$/g, ''), voice_id: voice };
      }
    } catch (e) {
      console.warn(`[FreeTTS] ${voice}: ${e.message}`);
    }
  }
  throw new Error('FreeTTS all voices failed');
}

/**
 * VoiceRSS — 350 req/hari gratis, perlu API key
 */
async function ttsVoiceRSS(text) {
  if (!VOICERSS_KEY) throw new Error('No VoiceRSS API key');
  const ttsText = truncateText(text, 800);
  const enc = encodeURIComponent(ttsText);
  const url = `https://api.voicerss.org/?key=${VOICERSS_KEY}&hl=id-id&c=MP3&f=44khz_16bit_mono&src=${enc}`;

  console.log('[VoiceRSS] Requesting...');
  const resp = await axios.get(url, { timeout: 15000, responseType: 'arraybuffer' });
  if (resp.status === 200 && resp.data?.byteLength > 500) {
    const dataUri = `data:${resp.headers['content-type'] || 'audio/mpeg'};base64,${Buffer.from(resp.data).toString('base64')}`;
    console.log(`[VoiceRSS] OK (${(dataUri.length/1024).toFixed(0)}KB)`);
    return { url: dataUri, model: 'voicerss', voice_name: 'Ryxa', voice_id: 'id-id' };
  }
  throw new Error('VoiceRSS bad response');
}

/**
 * Google Translate TTS — last resort
 */
async function ttsGoogle(text) {
  const short = truncateText(text, 190);
  const enc = encodeURIComponent(short);
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=id&q=${enc}`;

  console.log('[GoogleTTS] Requesting...');
  const resp = await axios.get(url, {
    timeout: 15000,
    responseType: 'arraybuffer',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  if (resp.status === 200 && resp.data?.byteLength > 300) {
    const dataUri = `data:${resp.headers['content-type'] || 'audio/mpeg'};base64,${Buffer.from(resp.data).toString('base64')}`;
    console.log(`[GoogleTTS] OK (${(dataUri.length/1024).toFixed(0)}KB)`);
    return { url: dataUri, model: 'google-tts', voice_name: 'Ryxa', voice_id: 'id' };
  }
  throw new Error('Google TTS bad response');
}

// ── MAIN TTS ──────────────────────────────────────────────────

async function generateTTS(text) {
  const clean = text
    .replace(/\*+/g, '')
    .replace(/#+\s/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[—–]/g, '-')
    .trim();

  if (!clean || clean.length < 10) {
    return { url: null, error: 'Teks terlalu pendek.' };
  }

  console.log(`[TTS] Text: ${clean.length} chars`);

  for (const [name, fn] of [
    ['FreeTTS',   () => ttsFreeTTS(clean)],
    ['VoiceRSS',  () => ttsVoiceRSS(clean)],
    ['GoogleTTS', () => ttsGoogle(clean)],
  ]) {
    try {
      console.log(`[TTS] → ${name}`);
      const r = await fn();
      if (r?.url) { console.log(`[TTS] ✅ ${name}`); return r; }
    } catch (e) {
      console.warn(`[TTS] ✗ ${name}: ${e.message}`);
    }
  }

  console.warn('[TTS] ❌ All failed');
  return {
    url: null,
    model: 'none',
    voice_name: 'Ryxa',
    voice_id: null,
    error: 'Maaf, audio cerita belum tersedia saat ini. Coba lagi nanti ya!'
  };
}

module.exports = { generateStory, generateTTS, isStoryResponse, RYXA_SYSTEM_PROMPT };
