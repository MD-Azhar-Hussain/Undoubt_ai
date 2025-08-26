# Undoubt AI - Real-time Collaborative Platform

A modern full-stack web application built with React and Node.js that provides real-time collaboration features using Socket.IO. The platform includes user authentication, real-time communication, and QR code functionality.

## 🚀 Features

- **Real-time Communication**: Built with Socket.IO for instant messaging and collaboration
- **Modern Frontend**: React 18 with Vite for fast development and optimized builds
- **Responsive Design**: Tailwind CSS for beautiful, mobile-first UI
- **Authentication**: Firebase and Appwrite integration for secure user management
- **QR Code Generation**: Built-in QR code functionality for easy sharing
- **Database**: MongoDB with Mongoose ODM for data persistence
- **Cross-platform**: CORS configured for multiple deployment environments

## 🛠️ Tech Stack

### Frontend
- **React 18** - Modern JavaScript library for building user interfaces
- **Vite** - Next generation frontend tooling
- **Tailwind CSS** - Utility-first CSS framework
- **React Router DOM** - Client-side routing
- **Socket.IO Client** - Real-time bidirectional event-based communication
- **Axios** - HTTP client for API requests
- **React Icons** - Popular icon library
- **React Toastify** - Notification system
- **QRCode.react** - QR code generation

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web framework
- **Socket.IO** - Real-time communication
- **MongoDB** - NoSQL database
- **Mongoose** - MongoDB object modeling
- **CORS** - Cross-origin resource sharing
- **UUID** - Unique identifier generation
- **dotenv** - Environment variable management

## 📁 Project Structure

```
Undoubt_ai/
├── frontend/          # React frontend application
│   ├── src/          # Source files
│   ├── package.json  # Frontend dependencies
│   └── vite.config.js # Vite configuration
├── backend/          # Node.js backend application
│   ├── app.js        # Main server file
│   ├── controllers/  # Socket controllers
│   ├── routes/       # API routes
│   └── package.json  # Backend dependencies
└── README.md         # Project documentation
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- MongoDB Atlas account or local MongoDB installation

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/MD-Azhar-Hussain/Undoubt_ai.git
   cd Undoubt_ai
   ```

2. **Setup Backend**
   ```bash
   cd backend
   npm install
   ```

3. **Setup Frontend**
   ```bash
   cd ../frontend
   npm install
   ```

4. **Environment Configuration**
   
   Create a `.env` file in the backend directory:
   ```env
   MONGO_URI=your_mongodb_connection_string
   PORT=3000
   ```

### Running the Application

1. **Start the Backend Server**
   ```bash
   cd backend
   npm run dev
   ```

2. **Start the Frontend Development Server**
   ```bash
   cd frontend
   npm run dev
   ```

3. **Access the Application**
   - Frontend: `http://localhost:5173`
   - Backend: `http://localhost:3000`

## 🌐 Deployment

The application is configured for deployment on multiple platforms:

### Supported Platforms
- **Vercel** - Frontend deployment
- **Render** - Full-stack deployment
- **Local Development** - Complete development environment

### CORS Configuration
The backend is pre-configured with CORS settings for:
- Production URLs (Vercel, Render)
- Development environments (localhost, LAN)

## 📝 Scripts

### Frontend Scripts
```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

### Backend Scripts
```bash
npm start        # Start production server
npm run dev      # Start development server with nodemon
npm test         # Run tests
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License.

## 👨‍💻 Author

**MD Azhar Hussain**
- GitHub: [@MD-Azhar-Hussain](https://github.com/MD-Azhar-Hussain)

## 🙏 Acknowledgments

- React and Node.js communities for excellent documentation
- Socket.IO for real-time communication capabilities
- Tailwind CSS for the utility-first approach
- All contributors who helped shape this project

---

⭐ If you found this project helpful, please give it a star!
