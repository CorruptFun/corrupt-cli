"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

interface ToastContextValue {
  showToast: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const showToast = useCallback((msg: string, duration = 4000) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setMessage(msg);
    setVisible(false);
    // Two frames so the transition replays for back-to-back toasts
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    timers.current.push(
      setTimeout(() => {
        setVisible(false);
        timers.current.push(setTimeout(() => setMessage(null), 400));
      }, duration)
    );
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message && (
        <div className={`toast-notification ${visible ? "toast-visible" : ""}`}>{message}</div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
