import { ReactNode } from 'react';

export function Spinner({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      className={`animate-spin-slow ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Lädt"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800 ${className}`} />;
}

export function StatusDot({ status, label }: { status: 'ONLINE' | 'OFFLINE' | 'CONNECTING' | 'ACTIVE' | 'LOCKED'; label?: string }) {
  const styles: Record<string, string> = {
    ONLINE: 'bg-emerald-500 animate-pulse-dot',
    ACTIVE: 'bg-emerald-500 animate-pulse-dot',
    OFFLINE: 'bg-red-500',
    LOCKED: 'bg-red-500',
    CONNECTING: 'bg-amber-400 animate-pulse-dot',
  };
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium">
      <span className={`h-2.5 w-2.5 rounded-full ${styles[status] ?? 'bg-gray-400'}`} />
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    SUCCESS: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    PENDING_VERIFICATION: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    PENDING_RECONCILIATION: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    CANCELLED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    EXPIRED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    OPEN: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    PAID: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    ACTIVE: 'bg-emerald-100 text-emerald-700',
    LOCKED: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`badge ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="card w-full max-w-md animate-scale-in shadow-card-hover">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            aria-label="Schließen"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  text: string;
}

export function ToastStack({ toasts, dismiss }: { toasts: ToastMessage[]; dismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`card !p-3.5 animate-slide-in shadow-card-hover border-l-4 ${
            toast.type === 'success'
              ? 'border-l-emerald-500'
              : toast.type === 'error'
                ? 'border-l-red-500'
                : 'border-l-blue-500'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-gray-800 dark:text-gray-100">{toast.text}</p>
            <button onClick={() => dismiss(toast.id)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0" aria-label="Toast schließen">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function successCheck() {
  return (
    <svg className="animate-success-pop text-emerald-500" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M4 12.5l5 5L20 6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}