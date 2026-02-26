const express = require('express');
const cors = require('cors');
require('dotenv').config();
const {connectDB} = require('./src/config/db');

// Import routes
const authRoutes = require('./src/routes/authRoutes');
const orgAuthRoutes = require('./src/routes/orgAuthRoutes');
const streamRoutes = require('./src/routes/streamRoutes');
const profileRoutes = require('./src/routes/profileRoutes');
const staffProfileRoutes = require('./src/routes/staffProfileRoutes');
const teamRoutes = require('./src/routes/teamRoutes');
const organizationRoutes = require('./src/routes/organizationRoutes');
const tournamentRoutes = require('./src/routes/tournamentRoutes');
const statsRoutes = require('./src/routes/statsRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to database
connectDB();

// Middleware
app.use(cors({
  origin: ['http://localhost:5050', 'http://localhost:3000', 'http://localhost:3001'], // Frontend URLs
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Esports Adda Backend is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/org-auth', orgAuthRoutes);
app.use('/api/streams', streamRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/staff-profile', staffProfileRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/stats', statsRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});