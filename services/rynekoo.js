const axios = require('axios');

const MODELS = {
  gemma: 'cf/gemma-7b',
  llama: 'cf/llama-3-8b',
  mistral: 'cf/mistral-7b-v0.2'
};

async function callRynekoo(message, model = 'gemma') {
  const selected = MODELS[model] || MODELS.gemma;

  const url = `https://rynekoo-api.hf.space/text.gen/${selected}?text=${encodeURIComponent(message)}`;

  const { data } = await axios.get(url, {
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  });

  if (typeof data === 'string') {
    return data;
  }

  if (data?.response) {
    return data.response;
  }

  if (data?.text) {
    return data.text;
  }

  return JSON.stringify(data);
}

module.exports = {
  callRynekoo,
  MODELS
};
