import PropTypes from 'prop-types';
import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { logOut } from './config/firebase';
import ProtectedRoute, { HostProtectedRoute, ParticipantProtectedRoute, ManagementProtectedRoute, ReportProtectedRoute } from './components/ProtectedRoute';
import HomePage from './pages/HomePage';
import CreateRoomPage from './pages/CreateRoomPage';
import JoinRoomPage from './pages/JoinRoomPage';
const RoomPage = lazy(() => import('./pages/RoomPage'));
const SessionReportPage = lazy(() => import('./pages/SessionReportPage'));
import LoginPage from './pages/LoginPage';
const AdminPage = lazy(() => import('./pages/AdminPage'));
const OrganisationPage = lazy(() => import('./pages/OrganisationPage'));

import AccessDeniedPage from './pages/AccessDeniedPage';
import { toast } from 'react-toastify';
import './App.css';
import './theme.css';


const Navigation = () => {
  const { user, isAuthenticated } = useAuth();

  const handleLogout = async () => {
    try {
      await logOut();
      toast.success('Successfully logged out!');
    } catch {
      toast.error('Failed to log out');
    }
  };

  return (
    <nav className="app-nav flex justify-between items-center gap-2 px-3 sm:px-5 py-2 sm:py-3 bg-gray-900 text-white shadow-lg">
      <Link className="brand text-2xl sm:text-3xl md:text-5xl font-bold text-gray-300 hover:text-orange-500 transition duration-300 cursor-pointer" to="/">
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
            <span className="text-gray-300 text-sm sm:text-base hidden sm:inline max-w-48 truncate">
              {user.firstName} {user.lastName}
            </span>
            <span className="text-gray-300 text-xs sm:hidden max-w-16 truncate">
              {user.firstName}
            </span>
            <button
              onClick={handleLogout}
              className="logout-button px-2 py-1 sm:px-5 sm:py-2 text-xs sm:text-sm bg-red-600 hover:bg-red-700 rounded transition duration-300"
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
      {isAuthenticated && !isRoomRoute && <WorkspaceNavigation />}
      <Suspense fallback={<p className="p-8 text-center" role="status">Loading your page…</p>}><Routes>
        <Route path="/admin" element={<ManagementProtectedRoute platform><AdminPage /></ManagementProtectedRoute>} />
        <Route path="/organisations" element={<ManagementProtectedRoute><OrganisationPage /></ManagementProtectedRoute>} />
        <Route path="/organisation" element={<ManagementProtectedRoute><OrganisationPage /></ManagementProtectedRoute>} />
        <Route path="/organisations/:organisationId" element={<ManagementProtectedRoute><OrganisationPage /></ManagementProtectedRoute>} />
        <Route path="/organisation/:organisationId" element={<ManagementProtectedRoute><OrganisationPage /></ManagementProtectedRoute>} />
        <Route path="/sessions/:roomId" element={<ReportProtectedRoute><SessionReportPage /></ReportProtectedRoute>} />
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
      <Route path="*" element={<main className="access-screen"><div className="access-card"><h1>Page not found</h1><p>This page may have moved.</p><Link to="/">Back to my sessions</Link></div></main>} />
      </Routes></Suspense>
    </>
  );
};

const WorkspaceNavigation = () => {
  const { access } = useAuth();
  if (!access?.isPlatformAdmin) return null;
  return <nav aria-label="Workspace" className="workspace-nav">
    <Link to="/">My sessions</Link>
    {access?.isPlatformAdmin && <Link to="/admin">Platform admin</Link>}
  </nav>;
};

const App = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;



AppRoutes.propTypes = { isAuthenticated: PropTypes.bool };
