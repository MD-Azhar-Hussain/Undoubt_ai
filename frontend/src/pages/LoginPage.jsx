import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithGoogle, getGoogleRedirectResult, logOut } from '../config/firebase';
import { isEmailAllowed } from '../utils/emailValidation';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { FaGoogle } from 'react-icons/fa';

const LoginPage = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Check for redirect result on component mount
  useEffect(() => {
    const checkRedirectResult = async () => {
      try {
        const result = await getGoogleRedirectResult();
        if (result) {
          const userEmail = result.user.email;
          
          // Check if email is allowed
          if (!isEmailAllowed(userEmail)) {
            // Sign out the user immediately
            await logOut();
            toast.error('Access denied: This website is only for VNRVJIET students and faculty.');
            navigate('/access-denied');
            return;
          }
          
          toast.success('Successfully signed in with Google!');
          navigate('/');
        }
      } catch (error) {
        console.error('Redirect result error:', error);
        toast.error('Failed to complete Google sign-in');
      }
    };

    checkRedirectResult();
  }, [navigate]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const result = await signInWithGoogle();
      const userEmail = result.user.email;
      
      // Check if email is allowed
      if (!isEmailAllowed(userEmail)) {
        // Sign out the user immediately
        await logOut();
        toast.error('Access denied: This website is only for VNRVJIET students and faculty.');
        navigate('/access-denied');
        return;
      }
      
      toast.success('Successfully signed in with Google!');
      navigate('/');
    } catch (error) {
      console.error('Google sign-in error:', error);
      toast.error('Failed to sign in with Google. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-800 to-black text-white">
      <main className="max-w-7xl mx-auto px-4 py-8 sm:py-12">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start lg:items-center">
          {/* Login card (kept familiar; placed first on mobile for quick access) */}
          <aside className="order-1 lg:order-2 w-full max-w-sm sm:max-w-md mx-auto lg:mx-0 lg:justify-self-center">
            <div className="p-5 sm:p-8 bg-gray-900/70 rounded-2xl shadow-2xl backdrop-blur border border-gray-700 transition-transform duration-300 hover:scale-[1.01]">
              <div className="text-center mb-6 sm:mb-8">
                <h1 className="text-3xl sm:text-4xl font-bold mb-2">
                  <span className="text-orange-500">Un</span>Doubt
                </h1>
                <p className="text-base sm:text-lg text-gray-300 mb-4">Welcome to UnDoubt!</p>
                <div className="bg-blue-900/50 rounded-lg p-2 sm:p-3 border border-blue-600/70">
                  <p className="text-xs sm:text-sm text-blue-200">🎓 For VNRVJIET Students & Faculty Only</p>
                  <p className="text-xs text-blue-300 mt-1">Use your @vnrvjiet.in email address</p>
                </div>
              </div>

              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 sm:gap-3 px-4 py-3 sm:px-6 sm:py-4 mb-4 sm:mb-6 text-sm sm:text-lg font-semibold bg-white text-gray-900 hover:bg-gray-100 rounded-lg shadow-lg transform hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                <FaGoogle className="text-base sm:text-xl text-red-500" />
                {loading ? 'Signing in...' : 'Continue with Google'}
              </button>

              <div className="text-center">
                <p className="text-xs sm:text-sm text-gray-400 mb-2">Sign in with your VNRVJIET Google account</p>
                <p className="text-xs text-gray-500">Only @vnrvjiet.in email addresses are allowed</p>
              </div>
            </div>
          </aside>

          {/* Landing content */}
          <section className="order-2 lg:order-1">
            {/* Hero */}
            <div className="mb-8 sm:mb-10">
              <p className="inline-block text-xs sm:text-sm px-3 py-1 rounded-full bg-white/10 border border-white/20">Real-time Q&A for VNRVJIET</p>
              <h2 className="mt-3 text-3xl sm:text-5xl font-extrabold leading-tight">
                Clear doubts, faster.
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-yellow-300 to-pink-400">Collaborate in real-time.</span>
              </h2>
              <p className="mt-3 sm:mt-4 text-sm sm:text-lg text-gray-200 max-w-2xl">
                Students ask and upvote doubts. Faculty focus on what matters. Simple, fast, and built for classrooms.
              </p>
            </div>

            {/* Features */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="p-4 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition">
                <div className="text-xl">⚡</div>
                <p className="mt-2 font-semibold">Live updates</p>
                <p className="text-sm text-gray-300 mt-1">No refresh required.</p>
              </div>
              <div className="p-4 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition">
                <div className="text-xl">🗳️</div>
                <p className="mt-2 font-semibold">Upvote to prioritize</p>
                <p className="text-sm text-gray-300 mt-1">Surface top doubts first.</p>
              </div>
              <div className="p-4 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition">
                <div className="text-xl">📷</div>
                <p className="mt-2 font-semibold">Easy joining</p>
                <p className="text-sm text-gray-300 mt-1">Share a QR or room ID.</p>
              </div>
            </div>

            {/* How it works */}
            <div className="mt-8 sm:mt-10">
              <h3 className="text-lg sm:text-xl font-bold">How it works</h3>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="rounded-lg bg-white/5 border border-white/10 p-4">
                  <p className="font-semibold">1. Sign in</p>
                  <p className="text-sm text-gray-300 mt-1">Use your campus Google account.</p>
                </div>
                <div className="rounded-lg bg-white/5 border border-white/10 p-4">
                  <p className="font-semibold">2. Create or join</p>
                  <p className="text-sm text-gray-300 mt-1">Teachers create, students join via ID/QR.</p>
                </div>
                <div className="rounded-lg bg-white/5 border border-white/10 p-4">
                  <p className="font-semibold">3. Ask & upvote</p>
                  <p className="text-sm text-gray-300 mt-1">Get answers prioritized by votes.</p>
                </div>
              </div>
            </div>

            {/* Roles */}
            <div className="mt-8 sm:mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="rounded-lg bg-white/5 border border-white/10 p-4">
                <p className="font-semibold">For Students</p>
                <ul className="mt-2 text-sm text-gray-300 space-y-1 list-disc list-inside">
                  <li>Join quickly with room ID/QR</li>
                  <li>Ask doubts and upvote similar ones</li>
                  <li>Mobile-first, distraction-free UI</li>
                </ul>
              </div>
              <div className="rounded-lg bg-white/5 border border-white/10 p-4">
                <p className="font-semibold">For Faculty/Admin</p>
                <ul className="mt-2 text-sm text-gray-300 space-y-1 list-disc list-inside">
                  <li>Create and moderate rooms</li>
                  <li>Mark as answered, close rooms</li>
                  <li>Focus on top-voted doubts</li>
                </ul>
              </div>
            </div>
          </section>
        </div>
      </main>

      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
    </div>
  );
};

export default LoginPage;

