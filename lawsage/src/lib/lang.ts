export type Lang = 'auto' | 'en' | 'hi' | 'mr';

export const LANGS: { id: Lang; label: string; full: string }[] = [
  { id: 'auto', label: 'Auto', full: 'Same language as my question' },
  { id: 'en', label: 'EN', full: 'English' },
  { id: 'hi', label: 'हिं', full: 'Hindi' },
  { id: 'mr', label: 'मरा', full: 'Marathi' },
];

// Language used by the browser's speech recognition for each answer language.
export const SPEECH_LANG: Record<Lang, string> = { auto: 'en-IN', en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };

const KEY = 'lawsage_lang';
export const getLang = (): Lang => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'en' || v === 'hi' || v === 'mr' ? v : 'auto';
  } catch {
    return 'auto';
  }
};
export const saveLang = (l: Lang) => {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignore */
  }
};

export const FALLBACK_FOLLOWUPS: Record<Lang, string[]> = {
  auto: ['Explain in simpler words', 'Give a real-life example', 'What are the exceptions?'],
  en: ['Explain in simpler words', 'Give a real-life example', 'What are the exceptions?'],
  hi: ['आसान शब्दों में समझाइए', 'एक उदाहरण दीजिए', 'अपवाद क्या हैं?'],
  mr: ['सोप्या शब्दांत समजावा', 'एक उदाहरण द्या', 'अपवाद कोणते?'],
};
