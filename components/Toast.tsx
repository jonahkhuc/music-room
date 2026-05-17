'use client';

import { useCallback, useRef, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return { toasts, addToast };
}

export function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`animate-toast px-4 py-2.5 rounded-xl text-sm font-medium shadow-xl text-white backdrop-blur-sm
            ${toast.type === 'success'
              ? 'bg-green-700/90 border border-green-600/40'
              : toast.type === 'error'
              ? 'bg-red-700/90 border border-red-600/40'
              : 'bg-gray-800/95 border border-gray-600/40'}`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
