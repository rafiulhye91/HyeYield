import { useEffect, useRef } from 'react';

const INACTIVITY_MS = 1 * 60 * 1000;   // 1 minute (testing)

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

/**
 * Logs the user out after INACTIVITY_MS of no interaction.
 * Uses timestamps so background tab throttling doesn't prevent logout.
 */
export function useInactivityLogout({ onLogout, enabled }) {
  const lastActivity = useRef(Date.now());
  const intervalRef  = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    lastActivity.current = Date.now();

    const handleActivity = () => { lastActivity.current = Date.now(); };

    const check = () => {
      if (Date.now() - lastActivity.current >= INACTIVITY_MS) {
        onLogout();
      }
    };

    // Check every 10 seconds — works even when timers are throttled
    intervalRef.current = setInterval(check, 10_000);

    // Also check immediately when user returns to tab
    const handleVisible = () => {
      if (document.visibilityState === 'visible') check();
    };

    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      clearInterval(intervalRef.current);
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, handleActivity));
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [enabled, onLogout]);
}
