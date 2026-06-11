import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

const toastDurationMs = 4000;

type ToastVariant = "success" | "error";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message: string, variant: ToastVariant) => {
      const id = nextIdRef.current;
      nextIdRef.current += 1;
      setToasts((current) => [...current, { id, message, variant }]);
      window.setTimeout(() => dismiss(id), toastDurationMs);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (message: string) => push(message, "success"),
      error: (message: string) => push(message, "error")
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="toast-stack">
        {toasts.map((toast) => (
          <button
            className={`toast toast-${toast.variant}`}
            key={toast.id}
            onClick={() => dismiss(toast.id)}
            type="button"
          >
            {toast.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
