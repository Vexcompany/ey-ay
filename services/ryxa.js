/**
 * Ryxa Stories Service
 * Generate dongeng menggunakan GPT-4 dengan persona Ryxa
 * lalu convert ke audio via TTS API
 */
const axios = require('axios');

const TTS_API_BASE = 'https://api.theresav.biz.id/tools/tts';
const TTS_API_KEY  = process.env.TTS_API_KEY  || 'FKbI4';
const TTS_MODEL    = process.env.TTS_MODEL    || 'nahida';

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
      temperature: 0.85 // sedikit lebih kreatif dari chat biasa
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
// Cek apakah response adalah cerita (bukan menu pilihan awal)
function isStoryResponse(text) {
  const lower = text.toLowerCase().trim();
  // Jika berisi pilihan menu (ada angka 1. sampai 4. dan teks tanya pilihan), bukan cerita
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

// ── GENERATE TTS ──────────────────────────────────────────────
async function generateTTS(text) {
  // Bersihkan teks: hapus karakter yang tidak perlu untuk TTS
  const cleanText = text
    .replace(/\*+/g, '')        // hapus markdown bold/italic
    .replace(/#+\s/g, '')       // hapus heading markdown
    .replace(/\n{3,}/g, '\n\n') // max 2 baris kosong berturut
    .trim();

  // Encode untuk URL
  const encoded = encodeURIComponent(cleanText);

  const url = `${TTS_API_BASE}?text=${encoded}&model=${TTS_MODEL}&apikey=${TTS_API_KEY}`;

  try {
    const { data } = await axios.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (data?.status && data?.result?.[0]?.url) {
      return {
        url:        data.result[0].url,
        model:      data.result[0].model      || TTS_MODEL,
        voice_name: data.result[0].voice_name || 'Ryxa',
        voice_id:   data.result[0].voice_id   || null
      };
    }
  } catch (err) {
    console.error('TTS API error (fallback used):', err.message);
  }

  // Fallback audio agar tidak pernah null / error di frontend
  return {
    url:        'https://actions.google.com/sounds/v1/ambiences/rain_heavy.ogg',
    model:      TTS_MODEL,
    voice_name: 'Ryxa',
    voice_id:   null
  };
}

module.exports = { generateStory, generateTTS, isStoryResponse, RYXA_SYSTEM_PROMPT };
