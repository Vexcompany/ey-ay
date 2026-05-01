const axios = require('axios');

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

async function callGemini(message, systemPrompt) {
  const response = await axios.post(
    `${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
    {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents:           [{ parts: [{ text: message }] }]
    }
  );
  return response.data.candidates[0].content.parts[0].text;
}

module.exports = { callGemini };
