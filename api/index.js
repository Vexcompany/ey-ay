require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const chatRoutes = require('../routes/chat');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/chat', chatRoutes);

// Health check
app.get('/', (req, res) => res.json({ status: 'ok', service: 'Taksaka AI' }));

// Export for Vercel serverless — no app.listen()
module.exports = app;
