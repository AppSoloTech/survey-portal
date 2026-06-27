import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

const toastDurationMs = 8000;
const errorToastDurationMs = 12000;

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
      window.setTimeout(
        () => dismiss(id),
        variant === "error" ? errorToastDurationMs : toastDurationMs
      );
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
      <div className="toast-stack">
        <div aria-atomic="false" aria-live="polite" className="toast-live-region" role="status">
          {toasts
            .filter((toast) => toast.variant === "success")
            .map((toast) => (
              <ToastItem dismiss={dismiss} key={toast.id} toast={toast} />
            ))}
        </div>
        <div aria-atomic="false" aria-live="assertive" className="toast-live-region" role="alert">
          {toasts
            .filter((toast) => toast.variant === "error")
            .map((toast) => (
              <ToastItem dismiss={dismiss} key={toast.id} toast={toast} />
            ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  dismiss,
  toast
}: {
  dismiss: (id: number) => void;
  toast: Toast;
}) {
  return (
    <div className={`toast toast-${toast.variant}`}>
      <span>{toast.message}</span>
      <button
        aria-label={`Dismiss notification: ${toast.message}`}
        className="toast-dismiss"
        onClick={() => dismiss(toast.id)}
        type="button"
      >
        Dismiss
      </button>
    </div>
  );
}
