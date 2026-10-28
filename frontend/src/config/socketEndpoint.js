// A URL pathname selects a Socket.IO namespace; it does not change its HTTP
// transport path. This application only uses the default namespace and path.
export function socketOrigin(configured, pageOrigin) {
  let url;
  try { url = new URL(configured?.trim() || pageOrigin); }
  catch { throw new Error('VITE_SOCKET_SERVER_URL must be an absolute HTTP(S) origin, or empty for the same origin.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('VITE_SOCKET_SERVER_URL must contain only the backend origin, without /be, /api, credentials or a query. Socket traffic uses /socket.io/.');
  }
  if (pageOrigin) {
    const page = new URL(pageOrigin);
    if (page.protocol === 'https:' && url.protocol !== 'https:') throw new Error('An HTTPS frontend requires an HTTPS socket backend.');
    const loopback = host => ['localhost', '127.0.0.1', '[::1]'].includes(host);
    if (!loopback(page.hostname) && loopback(url.hostname)) throw new Error('A public frontend cannot use a localhost socket backend.');
  }
  return url.origin;
}
