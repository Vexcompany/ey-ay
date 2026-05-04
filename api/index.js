require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const authRoutes   = require('../routes/auth');
const chatRoutes   = require('../routes/chat');
const adminRoutes  = require('../routes/admin');
const profileRoutes = require('../routes/profile');

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' })); // limit diperbesar untuk base64 avatar

app.use('/api/auth',    authRoutes);
app.use('/api/chat',    chatRoutes);
app.use('/api/admin',   adminRoutes);
app.use('/api/profile', profileRoutes);

app.get('/', (req, res) => res.json({ status: 'ok', service: 'Taksaka AI' }));

module.exports = app;
