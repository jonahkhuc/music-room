'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import type { SearchResult, Song } from '@/types';

interface Props {
  onAdd: (song: Omit<Song, 'id'>) => void;
}

export function SearchBar({ onAdd }: Props) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function search(q: string) {
    if (!q.trim()) { setResults([]); return; }

    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.error) { setError(data.error); setResults([]); }
      else setResults(data.results ?? []);
    } catch {
      setError('Search failed');
    } finally {
      setLoading(false);
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 500);
  }

  function handleAdd(r: SearchResult) {
    const song: Omit<Song, 'id'> = {
      source:    r.source,
      source_id: r.source_id,
      title:     r.title,
      thumbnail: r.thumbnail,
      duration:  r.duration,
      channel:   r.channel,
    };
    onAdd(song);
    setQuery('');
    setResults([]);
  }

  return (
    <div className="relative">
      {/* Input */}
      <div className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2.5">
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={handleInput}
          placeholder="Search YouTube or paste a URL…"
          className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 outline-none"
        />
        {loading && <Spinner />}
      </div>

      {/* Dropdown */}
      {(results.length > 0 || error) && (
        <div className="absolute left-0 right-0 bottom-full mb-2 z-50
                        bg-gray-900 border border-gray-700 rounded-xl shadow-2xl
                        max-h-72 overflow-y-auto">
          {error && (
            <p className="px-4 py-3 text-sm text-red-400">{error}</p>
          )}
          {results.map((r) => (
            <button
              key={`${r.source}-${r.source_id}`}
              onClick={() => handleAdd(r)}
              className="w-full flex items-center gap-3 px-3 py-2.5
                         hover:bg-gray-800 transition-colors text-left"
            >
              {r.thumbnail ? (
                <div className="relative w-14 h-10 flex-shrink-0 rounded overflow-hidden bg-gray-800">
                  <Image src={r.thumbnail} alt={r.title} fill className="object-cover" sizes="56px" />
                </div>
              ) : (
                <div className="w-14 h-10 flex-shrink-0 rounded bg-gray-800" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{r.title}</p>
                <p className="text-xs text-gray-400 truncate">
                  {r.channel}{r.duration ? ` · ${r.duration}` : ''}
                </p>
              </div>
              <svg className="w-5 h-5 text-brand flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" fill="none"/>
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  );
}
