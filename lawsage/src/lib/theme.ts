export type Theme = 'light' | 'dark';
const KEY = 'lawsage_theme';

export const getTheme = (): Theme => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const applyTheme = (t: Theme) => {
  document.documentElement.classList.toggle('dark', t === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0B1626' : '#101F36');
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
};
