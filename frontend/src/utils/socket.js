import { io } from 'socket.io-client';
import { auth } from '../config/firebase';
import { socketOrigin } from '../config/socketEndpoint';
const socket = io(socketOrigin(import.meta.env.VITE_SOCKET_SERVER_URL, window.location.origin), {
  path: '/socket.io/',
  autoConnect: false,
  // Skip the polling handshake on healthy networks; retain polling for campuses
  // and proxies that block WebSockets. Requires Socket.IO client 4.8+.
  transports: ['websocket', 'polling'],
  tryAllTransports: true,
  auth: async callback => {
    try { callback({ token: await auth.currentUser?.getIdToken() }); }
    catch { callback({ token: null }); }
  },
  timeout: 10000,
});
export default socket;
