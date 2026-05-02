const axios = require('axios');

// ── PERSONAS DOKTRIN ──────────────────────────────────────────

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

function buildPromptTaksaka(message) {
  const { jam, tgl } = getDateTime();
  return `
Kamu adalah Kak Taksaka, asisten AI santai dan friendly milik ${PAGASKA_DATA.namaLengkap}.

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

Pesan user: ${message}
`.trim();
}

function buildPromptDokter(message) {
  const { jam, tgl } = getDateTime();
  return `
Kamu adalah Dokter Taksaka, asisten AI empatik dan tenang milik ${PAGASKA_DATA.namaLengkap}.

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

Pesan user: ${message}
`.trim();
}

// ── SCRAPER ENGINE ────────────────────────────────────────────

async function callScrape(fullPrompt) {
  const { data } = await axios.post(
    "https://chateverywhere.app/api/chat/",
    {
      model: {
        id: "gpt-4",
        name: "GPT-4",
        maxLength: 32000,
        tokenLimit: 8000,
        completionTokenLimit: 5000,
        deploymentName: "gpt-4"
      },
      messages: [{ role: "user", content: fullPrompt }],
      prompt: "",
      temperature: 0.7
    },
    {
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
      },
      timeout: 30000
    }
  );

  // Response bisa string langsung atau object
  if (typeof data === "string") return data;
  if (data?.choices?.[0]?.message?.content) return data.choices[0].message.content;
  if (data?.content) return data.content;
  if (data?.text)    return data.text;

  throw new Error("Format response tidak dikenali: " + JSON.stringify(data).slice(0, 200));
}

// ── MAIN EXPORT ───────────────────────────────────────────────

async function callGemini(message, _systemPrompt, persona = "taksaka") {
  const fullPrompt = persona === "dokter"
    ? buildPromptDokter(message)
    : buildPromptTaksaka(message);

  const reply = await callScrape(fullPrompt);

  if (!reply) throw new Error("Tidak ada response dari AI.");
  return reply;
}

module.exports = { callGemini };
