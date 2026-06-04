const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const { Server } = require("socket.io");
require("dotenv").config();
const { connectDB } = require("./src/config/db");
const { initSocket } = require("./src/socket/socketHandler");
const sanitizeMongo = require("./src/middleware/sanitize");
const { globalLimiter } = require("./src/middleware/rateLimiters");

// Fail fast if the JWT secret is missing or obviously weak. Without this,
// jwt.sign / jwt.verify would throw at request time and 500 every auth call.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error("FATAL: JWT_SECRET must be set and at least 32 characters.");
  process.exit(1);
}

// Import routes
const authRoutes = require("./src/routes/authRoutes");
const orgAuthRoutes = require("./src/routes/orgAuthRoutes");
const streamRoutes = require("./src/routes/streamRoutes");
const profileRoutes = require("./src/routes/profileRoutes");
const staffProfileRoutes = require("./src/routes/staffProfileRoutes");
const teamRoutes = require("./src/routes/teamRoutes");
const organizationRoutes = require("./src/routes/organizationRoutes");
const tournamentRoutes = require("./src/routes/tournamentRoutes");
const statsRoutes = require("./src/routes/statsRoutes");
const chatRoutes = require("./src/routes/chatRoutes");
const adminRoutes = require("./src/routes/adminRoutes");
const notificationRoutes = require("./src/routes/notificationRoutes");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  "http://localhost:5050,http://localhost:3000,http://localhost:3001,https://esports-adda-frontend-c46ea26ff-amresh-kumar-yadav-s-projects.vercel.app,https://esports-adda-frontend.vercel.app"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Connect to database
connectDB();

// Behind Render's proxy — required for express-rate-limit to see real client
// IPs (X-Forwarded-For) and for Secure cookies to be set correctly.
app.set("trust proxy", 1);

// Security headers. crossOriginResourcePolicy is relaxed because the frontend
// is served from a different origin (Vercel) and pulls JSON from this API.
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// gzip responses
app.use(compression());

// Global rate limit (per-IP flood guard). Stricter limiters are applied on
// the auth routes themselves.
app.use(globalLimiter);

// Middleware
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(cookieParser());
app.use(express.json({ limit: "200kb" }));
app.use(express.urlencoded({ extended: true, limit: "200kb" }));

// Ensure req.body is always an object. express.json() leaves it undefined for
// requests sent with no JSON payload (e.g. a PATCH with no body), which makes
// `req.body.x` throw. This guard prevents that class of 500 across all routes.
app.use((req, res, next) => {
  if (req.body == null) req.body = {};
  next();
});

// Strip MongoDB operator keys ($ne, $gt, …) from user input. Must run after
// the body parser and the body-default guard so it has something to walk.
app.use(sanitizeMongo);

// REST Routes
app.get("/", (req, res) => {
  res.json({ message: "Esports Adda Backend is running" });
});

// Health check for Render and uptime pingers
app.get("/health", (req, res) => {
  res.status(200).json({ ok: true, uptime: process.uptime() });
});

app.use("/api/auth", authRoutes);
app.use("/api/org-auth", orgAuthRoutes);
app.use("/api/streams", streamRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/staff-profile", staffProfileRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/tournaments", tournamentRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: "Something went wrong!" });
});

// Socket.io — must use http server, not app.listen
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

initSocket(io);

// Start server (http server wraps express for Socket.io support)
// Bind 0.0.0.0 so Render's port-detect can reach the listener
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Socket.io active`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
});
