const axios = require('axios');

/**
 * Kirim pesan ke GPT via chateverywhere.app dengan dukungan
 * riwayat percakapan (multi-turn context) agar obrolan nyambung.
 *
 * @param {string} message        - Pesan terbaru dari user
 * @param {string} systemPrompt   - System prompt persona
 * @param {string} personaKey     - 'taksaka' | 'dokter'
 * @param {Array}  historyMessages - Array { role, content } dari riwayat sebelumnya
 */
async function callGemini(message, systemPrompt, personaKey, historyMessages = []) {
  // Bangun array messages: system + history + pesan baru
  const messages = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,          // riwayat sebelumnya sebagai konteks
    { role: 'user', content: message }
  ];

  try {
    const response = await axios.post(
      'https://chateverywhere.app/api/chat/',
      {
        model: 'gpt-3.5-turbo',
        messages,
        temperature: 0.8,
        max_tokens: 1000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Referer': 'https://chateverywhere.app/',
          'Origin':  'https://chateverywhere.app'
        },
        timeout: 30000
      }
    );

    const reply = response.data?.choices?.[0]?.message?.content;
    if (!reply) throw new Error('Respons AI kosong.');
    return reply.trim();

  } catch (err) {
    console.error('callGemini error:', err?.response?.data || err.message);
    throw err;
  }
}

module.exports = { callGemini };
