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
    <div className={`relative inline-flex ${className}`}>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        aria-label="Language"
        className="appearance-none bg-gray-800 text-gray-200 text-xs font-medium
                   rounded-lg pl-2.5 pr-7 py-1.5 border border-gray-700
                   outline-none focus:border-brand focus:ring-1 focus:ring-brand
                   cursor-pointer transition-colors hover:bg-gray-700"
      >
        <option value="vi">🇻🇳 VI</option>
        <option value="en">🇺🇸 EN</option>
      </select>
      {/* <svg
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400"
        fill="currentColor" viewBox="0 0 24 24"
      >
        <path d="M7 10l5 5 5-5z"/>
      </svg> */}
    </div>
  );
}
