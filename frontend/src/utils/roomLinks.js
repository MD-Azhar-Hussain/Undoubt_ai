export function parseRoomCode(input, allowedOrigins) {
  let value = input.trim();
  if (/^https?:\/\//i.test(value)) {
    let url;
    try { url = new URL(value); } catch { throw new Error('That room link is incomplete. Paste the full link or enter its room code.'); }
    if (url.username || url.password || !allowedOrigins.includes(url.origin)) throw new Error('Use a link from this UnDoubt site, or enter the room code directly.');
    const match = /^\/(?:room|host|join-room)\/([a-zA-Z0-9-]{5,64})\/?$/.exec(url.pathname);
    if (!match) throw new Error('This link does not point to a room. Enter the code shared by your host.');
    value = match[1];
  }
  if (/^\d{3}[\s-]+\d{3}$/.test(value)) value = value.replace(/[\s-]/g, '');
  if (!/^[a-zA-Z0-9-]{5,64}$/.test(value)) throw new Error('Enter your six-digit room code or paste a room link. Older room codes also work.');
  return value;
}

export async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return; } catch { /* Try the legacy browser fallback. */ }
  }
  const previousFocus = document.activeElement;
  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.cssText = 'position:fixed;left:-9999px;top:0;';
  document.body.appendChild(input);
  try {
    input.select();
    if (!document.execCommand?.('copy')) throw new Error('Copy unavailable');
  } finally { input.remove(); previousFocus?.focus(); }
}
