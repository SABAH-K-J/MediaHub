import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const TONE_STYLES: Record<ToastTone, { border: string; iconColor: string }> = {
  info: { border: 'border-[#323744]', iconColor: 'text-[#9ca3af]' },
  success: { border: 'border-[#22c55e]/40', iconColor: 'text-[#22c55e]' },
  warning: { border: 'border-[#f59e0b]/40', iconColor: 'text-[#f59e0b]' },
  error: { border: 'border-[#ef4444]/40', iconColor: 'text-[#ef4444]' },
};

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0 pointer-events-none"
    >
      {toasts.map((toast) => {
        const style = TONE_STYLES[toast.tone];
        const Icon =
          toast.tone === 'success'
            ? CheckCircle2
            : toast.tone === 'error' || toast.tone === 'warning'
              ? AlertCircle
              : Info;

        return (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border ${style.border} bg-[#15171c] px-4 py-3 text-sm text-[#f3f4f6] shadow-lg`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.iconColor}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-snug">{toast.title}</p>
              {toast.description && (
                <p className="mt-1 text-xs leading-relaxed text-[#9ca3af]">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label={`Dismiss ${toast.title}`}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#9ca3af] transition-colors hover:bg-[#21252e] hover:text-[#f3f4f6]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

