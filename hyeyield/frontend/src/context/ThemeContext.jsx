import { createContext, useContext, useState, useEffect } from 'react';

export const LIGHT = {
  pageBg: '#F9FAFB',
  cardBg: '#ffffff',
  cardBorder: 'rgba(0,0,0,0.08)',
  sectionBorder: 'rgba(0,0,0,0.12)',
  tableRowBorder: '#F3F4F6',
  tableRowHover: '#FAFBFC',
  tableHeadBg: '#F9FAFB',
  tableHeadBorder: '#E5E7EB',
  inputBg: '#ffffff',
  inputBorder: 'rgba(0,0,0,0.2)',
  inputBorderLight: '#D1D5DB',
  textPrimary: '#111827',
  textSecondary: '#4B5563',
  textMuted: '#6B7280',
  textFaint: '#9CA3AF',
  navBg: '#1e3a5f',
  heroBg: '#1e3a5f',
  modalOverlay: 'rgba(0,0,0,0.45)',
  modalBg: '#ffffff',
  toggleBg: '#F3F4F6',
  expandedRowBg: '#F0F7FF',
  expandedRowBorder: '#DBEAFE',
  expandedDetailBg: '#F8FBFF',
  expandedHeaderBg: '#EEF4FF',
  expandedColHeader: '#93C5FD',
  expandedOrderBorder: '#EDF2FB',
  hrColor: 'rgba(0,0,0,0.07)',
};

export const DARK = {
  pageBg: '#0f172a',
  cardBg: '#1e293b',
  cardBorder: 'rgba(255,255,255,0.08)',
  sectionBorder: 'rgba(255,255,255,0.1)',
  tableRowBorder: 'rgba(255,255,255,0.06)',
  tableRowHover: '#253348',
  tableHeadBg: '#162032',
  tableHeadBorder: 'rgba(255,255,255,0.08)',
  inputBg: '#0f172a',
  inputBorder: 'rgba(255,255,255,0.15)',
  inputBorderLight: 'rgba(255,255,255,0.15)',
  textPrimary: '#f1f5f9',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  textFaint: '#64748b',
  navBg: '#0a1628',
  heroBg: '#1e3a5f',
  modalOverlay: 'rgba(0,0,0,0.65)',
  modalBg: '#1e293b',
  toggleBg: '#253348',
  expandedRowBg: '#1a2942',
  expandedRowBorder: '#2d4a7a',
  expandedDetailBg: '#162032',
  expandedHeaderBg: '#1a2942',
  expandedColHeader: '#5b8ec4',
  expandedOrderBorder: '#1e3655',
  hrColor: 'rgba(255,255,255,0.07)',
};

const ThemeContext = createContext(null);

const mq = window.matchMedia('(prefers-color-scheme: dark)');

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
    return mq.matches;
  });

  // Keep body background in sync
  useEffect(() => {
    document.body.style.background = isDark ? DARK.pageBg : LIGHT.pageBg;
  }, [isDark]);

  // Follow OS changes only when no manual preference is saved
  useEffect(() => {
    const handler = (e) => {
      if (!localStorage.getItem('theme')) setIsDark(e.matches);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Manual toggle: save to localStorage
  const toggle = () => {
    setIsDark(d => {
      const next = !d;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  };

  const t = isDark ? DARK : LIGHT;

  return <ThemeContext.Provider value={{ t, isDark, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
