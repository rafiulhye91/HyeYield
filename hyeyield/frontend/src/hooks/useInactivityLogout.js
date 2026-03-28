import { useEffect, useRef, useCallback } from 'react';

const INACTIVITY_MS = 1 * 60 * 1000;   // 1 minute (testing)
const WARNING_MS    = 60 * 1000;        // show warning 60s before logout

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

/**
 * Calls onWarn() when the user has been inactive for (INACTIVITY_MS - WARNING_MS),
 * then calls onLogout() WARNING_MS later unless activity resets the timer.
 * Returns a reset() function so the warning modal's "Stay logged in" button can call it.
 */
export function useInactivityLogout({ onWarn, onLogout, enabled }) {
  const warnTimer   = useRef(null);
  const logoutTimer = useRef(null);
  const warned      = useRef(false);

  const clearTimers = () => {
    clearTimeout(warnTimer.current);
    clearTimeout(logoutTimer.current);
  };

  const reset = useCallback(() => {
    clearTimers();
    warned.current = false;

    warnTimer.current = setTimeout(() => {
      warned.current = true;
      onWarn();
      logoutTimer.current = setTimeout(onLogout, WARNING_MS);
    }, INACTIVITY_MS - WARNING_MS);
  }, [onWarn, onLogout]);

  useEffect(() => {
    if (!enabled) return;

    reset();

    const handleActivity = () => {
      // Don't reset once the warning is showing — let the modal handle it
      if (!warned.current) reset();
    };

    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, handleActivity));
    };
  }, [enabled, reset]);

  return { reset };
}
