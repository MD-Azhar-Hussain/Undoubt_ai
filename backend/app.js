const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const handleSocketConnection = require("./controllers/socketController");
const routes = require("./routes/routes");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

// ✅ Single list of allowed origins (production + local dev)
const allowedOrigins = [
  "https://undoubt-ai.vercel.app",
  "http://localhost:3108",
  "http://127.0.0.1:3108",
];

// ✅ Express CORS middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      // Allow localhost on any port for development
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
      
      // Allow Vercel preview deployments
      if (origin.includes('vercel.app')) {
        return callback(null, true);
      }
      
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

// ✅ Socket.IO shares same CORS config
const io = socketIo(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      // Allow localhost on any port for development
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
      
      // Allow Vercel preview deployments
      if (origin.includes('vercel.app')) {
        return callback(null, true);
      }
      
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    optionsSuccessStatus: 200,
  },
});

// Middleware
app.use(express.json());

// Routes
app.use("/api", routes);

// ✅ MongoDB connection
const mongoUri = process.env.MONGO_URI;
mongoose
  .connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });

// ✅ Socket.IO handlers
io.on("connection", (socket) => {
  console.log("New client connected");
  handleSocketConnection(io, socket);
  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// ✅ Start server with 0.0.0.0 binding
const PORT = process.env.PORT || 6108;
server.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on port ${PORT}`)
);
