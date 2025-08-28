// const express = require('express');
// const http = require('http');
// const socketIo = require('socket.io');
// const cors = require('cors');
// const mongoose = require('mongoose');
// const handleSocketConnection = require('./controllers/socketController');
// const routes = require('./routes/routes'); // Import routes
// require('dotenv').config(); // Load environment variables from .env file

// const app = express();
// const server = http.createServer(app);

// // List of allowed origins
// const allowedOrigins = [
//   'https://undoubt.onrender.com', // Current frontend URL
//   'https://expresso-frontend.onrender.com', // Another frontend URL if applicable
//   'http://192.168.1.100:5173', // Local development frontend
//   'http://localhost:5173', // Local development frontend (localhost)
//   'https://expresso-app.vercel.app', // Vercel frontend URL
//   'https://expresso-backend.vercel.app', // Vercel backend URL
//   'https://undoubt-nine.vercel.app', // Vercel frontend URL
//   'http://undoubt-nine.vercel.app', // Vercel frontend URL (http)
//   'https://undoubt-vercel-4idc4w6q6-md-azhar-hussains-projects.vercel.app',
//    'https://undoubt-vercel-1giwzjnwl-md-azhar-hussains-projects.vercel.app',
//   // Add your actual Vercel URLs here after deployment
// ];

// // Configure CORS for Express
// app.use(cors({
//   origin: (origin, callback) => {
//     if (!origin || allowedOrigins.includes(origin)) {
//       callback(null, true);
//     } else {
//       callback(new Error('Not allowed by CORS'));
//     }
//   },
//   methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allowed HTTP methods
//   credentials: true, // Allow cookies and credentials
// }));

// // Configure CORS for Socket.IO
// const io = socketIo(server, {
//   cors: {
//     origin: allowedOrigins, // Allow requests from multiple origins
//     methods: ['GET', 'POST'], // Allowed HTTP methods
//     credentials: true, // Allow cookies and credentials
//   },
// });

// // Middleware to parse JSON bodies
// app.use(express.json());

// // Use routes with /api prefix
// app.use('/api', routes);

// // Connect to MongoDB Atlas
// const mongoUri = process.env.MONGO_URI; // Use MONGO_URI from .env file
// mongoose.connect(mongoUri)
//   .then(() => console.log('MongoDB connected'))
//   .catch(err => console.log(err));

// // Handle Socket.IO connections
// io.on('connection', (socket) => {
//   console.log('New client connected');
//   handleSocketConnection(io, socket);
//   socket.on('disconnect', () => {
//     console.log('Client disconnected');
//   });
// });

// // Start the server
// const PORT = process.env.PORT || 3000;
// server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

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
  "http://localhost:5173",
  "http://127.0.0.1:5173",
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
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on port ${PORT}`)
);
