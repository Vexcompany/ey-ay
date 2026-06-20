/**
 * Velya Service
 * AI pendamping psikologis untuk Pagaska.
 * Ditenagai oleh UnlimitedAI (app.unlimitedai.chat) — model reasoning.
 */
const https = require('https');
const { randomUUID } = require('crypto');

const VELYA_SYSTEM_PROMPT = `Kamu adalah Velya, AI pendamping psikologis milik Paskibra Gala Taksaka SMKN 5 Kota Madiun (Pagaska).

IDENTITAS:
- Nama: Velya
- Peran: Pendamping psikologis digital Pagaska
- Jangan pernah mengaku sebagai UnlimitedAI, ChatGPT, chatbot, atau language model. Kamu adalah Velya.

KEPRIBADIAN:
- Hangat, empatik, tenang, dan tidak menghakimi.
- Mendengarkan dengan tulus sebelum memberi tanggapan.
- Memvalidasi perasaan pengguna dan membantu mereka memahami emosinya.

ATURAN:
1. Jawab dalam Bahasa Indonesia yang lembut dan suportif.
2. JANGAN memberikan diagnosis medis atau meresepkan obat/treatment.
3. Sarankan konsultasi ke profesional atau guru BK jika kondisinya serius.
4. Fokus pada dukungan emosional: mendengarkan, memvalidasi, dan menemani.
5. Ingat konteks percakapan sebelumnya agar tetap nyambung dalam satu sesi.
6. Jika ada indikasi bahaya pada diri sendiri/orang lain, dorong dengan lembut untuk segera mencari bantuan profesional atau orang dewasa terpercaya.`;

function buildPrompt(message, history = []) {
  const lines = [VELYA_SYSTEM_PROMPT, ''];
  if (Array.isArray(history)) {
    for (const m of history) {
      const who = m.role === 'assistant' ? 'Velya' : 'Pengguna';
      const content = String(m.content || '').trim();
      if (content) lines.push(`${who}: ${content}`);
    }
  }
  lines.push(`Pengguna: ${message}`, 'Velya:');
  return lines.join('\n');
}

function callUnlimitedAI(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      chatId: randomUUID(),
      messages: [
        { id: randomUUID(), role: 'user', content: prompt, parts: [{ type: 'text', text: prompt }], createdAt: new Date().toISOString() },
        { id: randomUUID(), role: 'assistant', content: '', parts: [{ type: 'text', text: '' }], createdAt: new Date().toISOString() }
      ],
      selectedChatModel: 'chat-model-reasoning',
      selectedCharacter: null,
      selectedStory: null,
      deviceId: randomUUID(),
      locale: 'id'
    });

    const req = https.request(
      {
        hostname: 'app.unlimitedai.chat',
        path: '/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-next-intl-locale': 'id',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
      },
      (res) => {
        let text = '';
        res.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.type === 'delta' && parsed.delta) text += parsed.delta;
            } catch { /* abaikan baris non-JSON */ }
          }
        });
        res.on('end', () => resolve(text.trim()));
        res.on('error', reject);
      }
    );

    req.setTimeout(28000, () => req.destroy(new Error('Velya request timeout')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function callVelya(message, history = []) {
  const prompt = buildPrompt(message, history);
  const text = await callUnlimitedAI(prompt);
  if (!text) throw new Error('Velya sedang tidak bisa menjawab. Coba lagi sebentar ya.');
  return text;
}

module.exports = { callVelya, buildPrompt, VELYA_SYSTEM_PROMPT };
