import React from 'react';
import { useNavigate } from 'react-router-dom';
import { logOut } from '../config/firebase';
import { toast } from 'react-toastify';
import { FaUniversity, FaExclamationTriangle } from 'react-icons/fa';

const AccessDeniedPage = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logOut();
      toast.success('Successfully logged out');
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Failed to log out');
    }
  };

  const handleBackToLogin = () => {
    handleLogout();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-800 to-black flex flex-col items-center justify-center text-white px-4">
      <div className="max-w-sm sm:max-w-md w-full text-center">
        {/* Warning Icon */}
        <div className="mb-6 sm:mb-8">
          <FaExclamationTriangle className="text-4xl sm:text-6xl text-red-500 mx-auto mb-2 sm:mb-4" />
          <FaUniversity className="text-3xl sm:text-4xl text-orange-500 mx-auto" />
        </div>

        {/* Main Message */}
        <div className="bg-gray-900 bg-opacity-50 rounded-lg p-4 sm:p-8 backdrop-blur-sm border border-gray-700">
          <h1 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4 text-red-400">
            Access Denied
          </h1>

          <div className="mb-4 sm:mb-6">
            <p className="text-base sm:text-lg mb-3 sm:mb-4 text-gray-300">
              This website is exclusively for
            </p>
            <p className="text-lg sm:text-xl font-semibold text-orange-500 mb-3 sm:mb-4">
              VNRVJIET Students & Faculty
            </p>
            <p className="text-sm sm:text-base text-gray-400 mb-4 sm:mb-6">
              Please use your official <span className="text-blue-400 font-mono text-xs sm:text-sm">@vnrvjiet.in</span> email address to access this application.
            </p>
          </div>

          {/* Instructions */}
          <div className="bg-gray-800 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6 text-left">
            <h3 className="text-base sm:text-lg font-semibold mb-2 text-orange-400">How to get access:</h3>
            <ul className="text-xs sm:text-sm text-gray-300 space-y-1">
              <li>• Use your college email ending with @vnrvjiet.in</li>
              <li>• Students and faculty only</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 sm:space-y-3">
            <button
              onClick={handleBackToLogin}
              className="w-full px-4 py-2 sm:px-6 sm:py-3 text-sm sm:text-lg font-semibold bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg transform hover:scale-105 transition-all duration-300"
            >
              Try Different Account
            </button>

            <button
              onClick={() => window.location.href = 'mailto:support@vnrvjiet.in'}
              className="w-full px-4 py-2 sm:px-6 sm:py-3 text-xs sm:text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-all duration-300"
            >
              Contact Support
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 sm:mt-8 text-center">
          <p className="text-xs sm:text-sm text-gray-500">
            <span className="text-orange-500">Un</span>Doubt - VNRVJIET
          </p>
        </div>
      </div>
    </div>
  );
};

export default AccessDeniedPage;
