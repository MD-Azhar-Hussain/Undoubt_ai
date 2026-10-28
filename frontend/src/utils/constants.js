const DEFAULT_FRONTEND_ORIGIN = window.location.origin;
const RAW_FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || DEFAULT_FRONTEND_ORIGIN;

export const FRONTEND_URL = (() => {
  try {
    const parsed = new URL(RAW_FRONTEND_URL);
    return parsed.origin;
  } catch {
    return DEFAULT_FRONTEND_ORIGIN;
  }
})();
