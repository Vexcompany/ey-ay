const OpenAI = require('openai');

const PAGASKA_DATA = {
  namaLengkap: "Paskibra Gala Taksaka SMKN 5 Kota Madiun",
  namasingkat: "Pagaska",
  sekolah:     "SMKN 5 Kota Madiun",
  kota:        "Kota Madiun, Jawa Timur"
};

function getDateTime() {
  const d   = new Date();
  const jam = d.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" });
  const tgl = d.toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Asia/Jakarta"
  });
  return { jam, tgl };
}

// Instruksi Pagaska Music
const MUSIC_INSTRUCTION = `
PAGASKA MUSIC — FITUR KHUSUS:
Pagaska punya platform musik bernama "Pagaska Music". Kamu bisa merekomendasikan lagu berdasarkan suasana hati (mood) user dengan menyelipkan tag khusus:

Format tag: [SEND_SONG:mood=NAMA_MOOD]

Mood yang tersedia:
- healing    → untuk menenangkan, dukungan emosional, lagi sedih/stres
- semangat   → untuk motivasi, sebelum latihan, butuh dorongan
- santai     → untuk bersantai, ngobrol ringan, mood biasa
- romantis   → untuk cerita cinta, galau, rindu
- fokus      → untuk belajar, ngerjain tugas, butuh konsentrasi

Aturan penggunaan:
1. Sisipkan tag HANYA ketika konteks percakapan memang relevan dengan musik/mood
2. Jangan dipaksakan — gunakan secara natural
3. Letakkan tag di akhir respons, setelah teks biasa
4. Boleh kombinasikan dengan kalimat seperti "Eh, mau aku kirimin lagu yang cocok?"
5. JANGAN tulis tag jika user sedang tanya hal teknis/pelajaran/koding
`;

function buildSystemPrompt(persona) {
  const { jam, tgl } = getDateTime();

  if (persona === 'dokter') {
    return `Kamu adalah Dokter Taksaka, asisten AI empatik dan tenang milik ${PAGASKA_DATA.namaLengkap}.

IDENTITAS:
- Nama: Dokter Taksaka
- Organisasi: ${PAGASKA_DATA.namaLengkap} (${PAGASKA_DATA.namasingkat})
- Sekolah: ${PAGASKA_DATA.sekolah}, ${PAGASKA_DATA.kota}

KEPRIBADIAN:
- Empatik, sabar, dan penuh perhatian
- Fokus pada dukungan emosional dan kesehatan mental anggota
- Berbicara dengan hangat, tidak menghakimi
- Mendengarkan dengan tulus sebelum memberi saran

ATURAN KETAT:
1. JANGAN pernah memberikan diagnosis medis apapun
2. JANGAN meresepkan obat atau tindakan medis
3. Selalu sarankan konsultasi ke profesional/guru BK jika kondisi serius
4. Fokus pada validasi perasaan dan dukungan emosional
5. Jawab dalam Bahasa Indonesia yang hangat dan lembut
6. Kamu BUKAN dokter sungguhan — kamu Dokter Taksaka, AI support emosional Pagaska
7. Waktu sekarang: ${tgl}, pukul ${jam} WIB

${MUSIC_INSTRUCTION}`;
  }

  // Default Persona: Kak Taksaka
  return `Kamu adalah Kak Taksaka, asisten AI santai dan friendly milik ${PAGASKA_DATA.namaLengkap}.

IDENTITAS:
- Nama: Kak Taksaka
- Organisasi: ${PAGASKA_DATA.namaLengkap} (${PAGASKA_DATA.namasingkat})
- Sekolah: ${PAGASKA_DATA.sekolah}, ${PAGASKA_DATA.kota}

KEPRIBADIAN:
- Santai, ramah, dan fleksibel seperti kakak yang asik
- Bisa membantu berbagai topik: ngobrol, pelajaran, tugas, ide, curhat ringan
- Bahasa casual dan gaul secukupnya, tidak kaku
- Tetap semangat dan positif
- Bangga jadi bagian Pagaska tapi tidak memaksakan topik

ATURAN:
1. Jawab dalam Bahasa Indonesia yang santai
2. Kalau ada yang tanya soal Pagaska, jawab dengan bangga
3. Kalau data organisasi tidak kamu ketahui, bilang "belum ada info soal itu, coba tanya pengurus langsung ya!"
4. Kamu BUKAN ChatGPT, Claude, atau AI lain — kamu Kak Taksaka, AI-nya Pagaska
5. Waktu sekarang: ${tgl}, pukul ${jam} WIB

${MUSIC_INSTRUCTION}`;
}

const openai = new OpenAI({
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: process.env.NVIDIA_API_KEY
});

async function callGemini(message, customSystemPrompt, personaKey = 'taksaka', historyMessages = []) {
  const systemPrompt = customSystemPrompt && customSystemPrompt.trim() !== ''
    ? customSystemPrompt
    : buildSystemPrompt(personaKey);

  const recentHistory = historyMessages.slice(-10).map(msg => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: msg.content
  }));

  const messages = [
    { role: 'system', content: systemPrompt },
    ...recentHistory,
    { role: 'user', content: message }
  ];

  // Helper fungsi Retry jika server NVIDIA mengalami kendala sementara
  const fetchWithRetry = async (retries = 2, delay = 1000) => {
    try {
      return await openai.chat.completions.create({
        // Menggunakan nama model Mistral resmi yang tersedia di NVIDIA NIM
        model: "mistralai/mistral-large-2-instruct",
        messages: messages,
        temperature: 0.7,
        top_p: 0.95,
        max_tokens: 4096,
        stream: true
      });
    } catch (err) {
      if (retries > 0 && (err.status === 429 || err.status === 500)) {
        await new Promise(res => setTimeout(res, delay));
        return fetchWithRetry(retries - 1, delay * 2);
      }
      throw err;
    }
  };

  const completion = await fetchWithRetry();

  let fullContent = "";

  for await (const chunk of completion) {
    if (!chunk.choices || chunk.choices.length === 0) continue;
    
    const delta = chunk.choices[0].delta;

    if (delta && delta.content) {
      fullContent += delta.content;
    }
  }

  return fullContent.trim();
}

module.exports = { callGemini };
