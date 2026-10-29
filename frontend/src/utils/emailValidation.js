const domains = (import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
export const isEmailAllowed = email => !!email && (!domains.length || domains.includes(email.toLowerCase().split('@')[1]));
