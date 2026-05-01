const axios = require('axios');

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const API_KEYS = {
  taksaka: process.env.GEMINI_API_KEY_TAKSAKA,
  dokter:  process.env.GEMINI_API_KEY_DOKTER
};

async function callGemini(message, systemPrompt, persona = 'taksaka') {
  const apiKey = API_KEYS[persona] ?? API_KEYS.taksaka;

  if (!apiKey) {
    throw new Error(`API key untuk persona "${persona}" tidak ditemukan.`);
  }

  const response = await axios.post(
    `${GEMINI_API_URL}?key=${apiKey}`,
    {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents:           [{ parts: [{ text: message }] }]
    }
  );
  return response.data.candidates[0].content.parts[0].text;
}

module.exports = { callGemini };
