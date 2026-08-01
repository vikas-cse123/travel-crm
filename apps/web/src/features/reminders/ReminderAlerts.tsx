import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { apiClient } from '@/api/client';
import { useAuth } from '@/features/auth/AuthProvider';
import type { Notification, Page } from './reminders.api';

/** Categories that should ring + pop a desktop alert (reminders due/overdue). */
const ALERT_CATEGORIES = new Set(['REMINDER', 'REMINDER_OVERDUE', 'ESCALATION']);
const SEEN_KEY = 'interscale-reminder-alerts-seen';
const POLL_MS = 30_000;

interface Toast {
  id: string;
  title: string;
  message: string;
  actionUrl: string | null;
}

/** A soft two-tone chime synthesised with the Web Audio API (no asset needed). */
function useChime() {
  const ctxRef = useRef<AudioContext | null>(null);

  // Browsers block audio until the user interacts; create/resume on first gesture.
  useEffect(() => {
    const unlock = () => {
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        ctxRef.current ??= new Ctor();
        void ctxRef.current.resume();
      } catch {
        // Audio is best-effort; ignore failures.
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  return useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    [880, 1174.66].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(now + index * 0.18);
      osc.stop(now + index * 0.18 + 0.5);
    });
  }, []);
}

/** Ask once (on first gesture) for OS notification permission. */
function useOsNotificationPermission() {
  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
    const ask = () => {
      void Notification.requestPermission();
      window.removeEventListener('pointerdown', ask);
      window.removeEventListener('keydown', ask);
    };
    window.addEventListener('pointerdown', ask);
    window.addEventListener('keydown', ask);
    return () => {
      window.removeEventListener('pointerdown', ask);
      window.removeEventListener('keydown', ask);
    };
  }, []);
}

function loadSeen(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function persistSeen(seen: Set<string>) {
  try {
    // Cap stored ids so the key cannot grow unbounded.
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
  } catch {
    // ignore
  }
}

/**
 * Global watcher for due-reminder notifications. Polls unread notifications and,
 * for newly-arrived reminder alerts, plays a soft chime, raises an OS
 * notification and shows an in-app toast. Mounted once inside the app shell.
 */
export function ReminderAlerts() {
  const { hasPermission } = useAuth();
  const enabled = hasPermission(PERMISSIONS.NOTIFICATIONS_VIEW);
  const chime = useChime();
  useOsNotificationPermission();

  const seenRef = useRef<Set<string> | null>(null);
  const baselineRef = useRef(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const query = useQuery({
    queryKey: ['reminder-alerts', 'unread'],
    queryFn: ({ signal }) =>
      apiClient.get<Page<Notification>>('/notifications?status=UNREAD&pageSize=25', signal),
    enabled,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!query.data) return;
    if (seenRef.current === null) seenRef.current = loadSeen();
    const seen = seenRef.current;
    const rows = Array.isArray(query.data.data) ? query.data.data : [];

    // First successful load establishes a baseline so we do not alert for the
    // backlog of unread notifications the user already knows about.
    if (!baselineRef.current) {
      baselineRef.current = true;
      rows.forEach((row) => seen.add(row.id));
      persistSeen(seen);
      return;
    }

    const fresh = rows.filter((row) => !seen.has(row.id) && ALERT_CATEGORIES.has(row.category));
    if (fresh.length === 0) return;

    fresh.forEach((row) => seen.add(row.id));
    rows.forEach((row) => seen.add(row.id));
    persistSeen(seen);

    chime();
    setToasts((current) => [
      ...fresh.map((row) => ({
        id: row.id,
        title: row.title,
        message: row.message,
        actionUrl: row.actionUrl,
      })),
      ...current,
    ]);

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      fresh.forEach((row) => {
        try {
          new Notification(row.title, { body: row.message, tag: row.id });
        } catch {
          // ignore
        }
      });
    }
  }, [query.data, chime]);

  // Auto-dismiss toasts after 10s.
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) =>
      window.setTimeout(() => dismiss(toast.id), 10_000),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [toasts, dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className="pointer-events-auto overflow-hidden rounded-xl border border-brand-200 bg-card shadow-lg"
        >
          <div className="flex items-start gap-3 p-3">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <Bell className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
              <p className="mt-0.5 line-clamp-3 text-sm text-slate-600">{toast.message}</p>
              {toast.actionUrl && (
                <Link
                  to={toast.actionUrl}
                  onClick={() => dismiss(toast.id)}
                  className="mt-1 inline-block text-xs font-semibold text-brand-700 hover:underline"
                >
                  View
                </Link>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(toast.id)}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
