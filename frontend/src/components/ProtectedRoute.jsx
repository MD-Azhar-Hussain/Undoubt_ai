import React, { useState, useEffect } from 'react';
import { Navigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { toast } from 'react-toastify';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const ProtectedRoute = ({ children }) => {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking authentication
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

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  // Render the protected component if authenticated
  return children;
};

// New component specifically for protecting host routes
const HostProtectedRoute = ({ children }) => {
  const { user, loading, isAuthenticated } = useAuth();
  const { roomId } = useParams();
  const location = useLocation();
  const [isHost, setIsHost] = useState(null);
  const [checkingHost, setCheckingHost] = useState(true);

  useEffect(() => {
    const checkHostStatus = async () => {
      if (!isAuthenticated || !user || !roomId) {
        console.log('HostProtectedRoute: Missing required data', { 
          isAuthenticated, 
          user: !!user, 
          userId: user?.id,
          roomId 
        });
        setCheckingHost(false);
        return;
      }

      console.log('HostProtectedRoute: Checking host status', { 
        roomId, 
        userId: user.id, 
        userEmail: user.emailAddresses?.[0]?.emailAddress 
      });

      try {
        const response = await axios.get(`${API_BASE_URL}/rooms/${roomId}/host/${user.id}`);
        console.log('HostProtectedRoute: Response from server', response.data);
        setIsHost(response.data.isHost);
      } catch (error) {
        console.error('HostProtectedRoute: Failed to check host status:', error);
        console.error('HostProtectedRoute: Error response:', error.response?.data);
        setIsHost(false);
        if (error.response?.status === 404) {
          toast.error('Room not found');
        } else {
          toast.error('Failed to verify host status');
        }
      } finally {
        setCheckingHost(false);
      }
    };

    checkHostStatus();
  }, [isAuthenticated, user, roomId]);

  // Show loading spinner while checking authentication and host status
  if (loading || checkingHost) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-800 to-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-white text-lg">Verifying host access...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  // If not the host, redirect to participant page for the same room
  if (!isHost) {
    return <Navigate to={`/room/${roomId}`} replace />;
  }

  // Render the protected component if user is the host
  console.log('HostProtectedRoute: Access granted - user is host', { 
    roomId, 
    userId: user?.id,
    userEmail: user?.emailAddresses?.[0]?.emailAddress 
  });
  return children;
};

// Component for participant route that auto-redirects host to host page
const ParticipantProtectedRoute = ({ children }) => {
  const { user, loading, isAuthenticated } = useAuth();
  const { roomId } = useParams();
  const [isHost, setIsHost] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const check = async () => {
      if (!isAuthenticated || !user || !roomId) {
        setChecking(false);
        return;
      }
      try {
        const response = await axios.get(`${API_BASE_URL}/rooms/${roomId}/host/${user.id}`);
        setIsHost(response.data.isHost);
      } catch (e) {
        setIsHost(false);
      } finally {
        setChecking(false);
      }
    };
    check();
  }, [isAuthenticated, user, roomId]);

  if (loading || checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-800 to-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isHost) {
    return <Navigate to={`/host/${roomId}`} replace />;
  }

  return children;
};

export { ProtectedRoute, HostProtectedRoute, ParticipantProtectedRoute };
export default ProtectedRoute;
