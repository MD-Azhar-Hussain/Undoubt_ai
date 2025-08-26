import React, { useEffect, useState, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { logOut } from './config/firebase';
import ProtectedRoute, { HostProtectedRoute, ParticipantProtectedRoute } from './components/ProtectedRoute';
import HomePage from './pages/HomePage';
import CreateRoomPage from './pages/CreateRoomPage';
import JoinRoomPage from './pages/JoinRoomPage';
import RoomPage from './pages/RoomPage';
import LoginPage from './pages/LoginPage';
import { account } from './utils/appwrite';
import AccessDeniedPage from './pages/AccessDeniedPage';
import { toast } from 'react-toastify';
import './App.css';

const UserContext = createContext({ user: null, setUser: () => {} });
export const useUser = () => useContext(UserContext);

const Navigation = () => {
  const { user, isAuthenticated } = useAuth();

  const handleLogout = async () => {
    try {
      await logOut();
      toast.success('Successfully logged out!');
    } catch (error) {
      toast.error('Failed to log out');
    }
  };

  return (
    <nav className="flex justify-between items-center px-3 sm:px-5 py-2 sm:py-3 bg-gray-900 shadow-lg">
      <Link className="text-2xl sm:text-3xl md:text-5xl font-bold text-gray-300 hover:text-orange-500 transition duration-300 cursor-pointer" to="/">
        <span className="text-orange-500">Un</span>Doubt
      </Link>

      <div className="flex items-center gap-2 sm:gap-4">
        {isAuthenticated ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full overflow-hidden bg-gray-600 flex items-center justify-center">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt="Profile"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <span
                className="text-white text-xs sm:text-sm font-semibold"
                style={{ display: user.photoURL ? 'none' : 'flex' }}
              >
                {user.firstName?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <span className="text-gray-300 text-sm sm:text-base hidden sm:inline">
              {user.firstName} {user.lastName}
            </span>
            <span className="text-gray-300 text-xs sm:hidden">
              {user.firstName}
            </span>
            <button
              onClick={handleLogout}
              className="px-2 py-1 sm:px-5 sm:py-2 text-xs sm:text-sm bg-red-600 hover:bg-red-700 rounded transition duration-300"
            >
              Logout
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className="px-3 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 rounded transition duration-300"
          >
            Login
          </Link>
        )}
      </div>
    </nav>
  );
};

const AppContent = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-800 to-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <AppRoutes isAuthenticated={isAuthenticated} />
    </Router>
  );
};

const AppRoutes = ({ isAuthenticated }) => {
  const location = useLocation();
  
  // Check if current route is a room route
  const isRoomRoute = location.pathname.startsWith('/room/') || location.pathname.startsWith('/host/');

  return (
    <>
      {isAuthenticated && !isRoomRoute && <Navigation />}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/access-denied" element={<AccessDeniedPage />} />
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <ProtectedRoute><HomePage /></ProtectedRoute>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/create-room"
          element={
            <ProtectedRoute><CreateRoomPage /></ProtectedRoute>
          }
        />
        <Route
          path="/join-room"
          element={
            <ProtectedRoute><JoinRoomPage /></ProtectedRoute>
          }
        />
        <Route
          path="/join-room/:roomId"
          element={
            <ProtectedRoute><JoinRoomPage /></ProtectedRoute>
          }
        />
        <Route
          path="/room/:roomId"
          element={
            <ParticipantProtectedRoute><RoomPage role="participant" /></ParticipantProtectedRoute>
          }
        />
        <Route
          path="/host/:roomId"
          element={
            <HostProtectedRoute><RoomPage role="host" /></HostProtectedRoute>
          }
        />
      </Routes>
    </>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;


