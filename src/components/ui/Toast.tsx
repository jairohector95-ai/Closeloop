"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Info, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type ToastKind = "success" | "info" | "warning";

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toast: (t: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = Date.now() + Math.random();
      setToasts((all) => [...all, { ...t, id }]);
      window.setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rise pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-float",
              t.kind === "success" ? "border-success-100" : t.kind === "warning" ? "border-warning-100" : "border-ink-200",
            )}
          >
            {t.kind === "success" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-600" />
            ) : t.kind === "warning" ? (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-700" />
            ) : (
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-900">{t.title}</p>
              {t.description ? <p className="mt-0.5 text-sm text-ink-500">{t.description}</p> : null}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} className="rounded-md p-1 text-ink-400 hover:bg-ink-100" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
