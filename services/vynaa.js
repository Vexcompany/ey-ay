const axios = require('axios');

async function callVynaa(message) {
  try {
    const response = await axios.post(
      'https://vynaa-ai.vercel.app/api/chat',
      {
        message
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.reply || response.data.message;

  } catch (err) {
    console.error('Vynaa Error:', err.message);
    return 'AI sedang error.';
  }
}

module.exports = {
  callVynaa
};
