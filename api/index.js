require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const authRoutes = require('../routes/auth');
const chatRoutes = require('../routes/chat');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

app.get('/', (req, res) => res.json({ status: 'ok', service: 'Taksaka AI' }));

module.exports = app;
