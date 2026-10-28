import { useEffect, useRef } from 'react';

// Coalesce focus/visibility events. Mounting still performs the initial check.
export default function useForegroundRefresh(refresh, interval = 60_000) {
  const callback = useRef(refresh);
  callback.current = refresh;
  useEffect(() => {
    let lastAttempt = Date.now();
    const resume = () => {
      if (document.visibilityState === 'hidden' || Date.now() - lastAttempt < interval) return;
      lastAttempt = Date.now();
      callback.current();
    };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [interval]);
}
