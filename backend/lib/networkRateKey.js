const { isIP } = require('node:net');
const { ipKeyGenerator } = require('express-rate-limit');

function railwayRateKey(env = process.env) {
  // Railway documents X-Real-IP as the public edge's client address. Do not
  // trust arbitrary forwarded headers on local/self-hosted installations.
  // This assumes public HTTP ingress through Railway, not an exposed TCP proxy.
  if (!env.RAILWAY_PROJECT_ID || !env.RAILWAY_ENVIRONMENT_ID) return undefined;
  return req => {
    const address = req.headers['x-real-ip'];
    return ipKeyGenerator(typeof address === 'string' && isIP(address) ? address : req.socket.remoteAddress);
  };
}
module.exports = { railwayRateKey };
