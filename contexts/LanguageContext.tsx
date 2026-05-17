'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { translations, type Locale } from '@/lib/i18n';

interface LanguageContextValue {
  locale:    Locale;
  t:         (typeof translations)[Locale];
  setLocale: (l: Locale) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  locale:    'vi',
  t:         translations.vi,
  setLocale: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('vi');

  useEffect(() => {
    const saved = localStorage.getItem('mr.locale') as Locale | null;
    if (saved === 'en' || saved === 'vi') setLocaleState(saved);
  }, []);

  function setLocale(l: Locale) {
    setLocaleState(l);
    localStorage.setItem('mr.locale', l);
  }

  return (
    <LanguageContext.Provider value={{ locale, t: translations[locale], setLocale }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT() {
  return useContext(LanguageContext);
}

export function LanguageSelector({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useT();
  return (
    <div className={`flex items-center gap-1 bg-gray-800 rounded-lg p-0.5 text-xs font-medium ${className}`}>
      {(['vi', 'en'] as Locale[]).map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          className={`px-2 py-1 rounded-md transition-colors ${
            locale === l
              ? 'bg-brand text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          {l === 'vi' ? '🇻🇳 VI' : '🇺🇸 EN'}
        </button>
      ))}
    </div>
  );
}
