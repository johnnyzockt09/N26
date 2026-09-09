import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, Spinner } from '../components/ui';
import { useToast } from '../lib/toast';
import { useAuth } from '../lib/auth';

export function LinkPage() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [code, setCode] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'starting' | 'waiting' | 'completed' | 'denied' | 'expired'>('idle');
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<number | null>(null);

  const start = async () => {
    setStatus('starting');
    const res = await api.post<{ code: string; expiresInSeconds: number }>('/api/minecraft/link/start');
    if (!res.success || !res.data) {
      toast.error(res.error?.message ?? 'Linking konnte nicht gestartet werden');
      setStatus('idle');
      return;
    }
    setCode(res.data.code);
    setStatus('waiting');
  };

  const poll = useCallback(async () => {
    if (!code) return;
    const res = await api.get<{ status: string; minecraftUsername?: string }>(`/api/minecraft/link/status?code=${encodeURIComponent(code)}`);
    if (res.success && res.data) {
      if (res.data.status === 'COMPLETED') {
        setStatus('completed');
        if (pollRef.current) window.clearInterval(pollRef.current);
        await refresh();
        setTimeout(() => navigate('/dashboard'), 1800);
      } else if (res.data.status === 'DENIED') {
        setStatus('denied');
        if (pollRef.current) window.clearInterval(pollRef.current);
      } else if (res.data.status === 'EXPIRED') {
        setStatus('expired');
        if (pollRef.current) window.clearInterval(pollRef.current);
      }
    }
  }, [code, refresh, navigate]);

  useEffect(() => {
    if (status === 'waiting' && code) {
      pollRef.current = window.setInterval(() => void poll(), 4000);
      return () => {
        if (pollRef.current) window.clearInterval(pollRef.current);
      };
    }
  }, [status, code, poll]);

  useEffect(() => () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
  }, []);

  const alreadyLinked = Boolean(user?.minecraft);
  const [showCommands, setShowCommands] = useState(false);

  const copyCommand = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(`/function n26:link {code:"${code}"}`);
    toast.success('Befehl kopiert');
  };

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
      <Card className="text-center">
        <div className="text-4xl mb-3">🎮</div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Minecraft Account verbinden</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          Verbinde dein Webkonto sicher mit deinem Minecraft-Account über das N26 Data-Pack.
        </p>
      </Card>

      {alreadyLinked ? (
        <Card className="text-center animate-scale-in">
          <div className="text-emerald-500 font-semibold mb-2">✓ Bereits verknüpft</div>
          <div className="text-sm text-gray-600 dark:text-gray-300 mb-1">
            Minecraft: <strong>{user!.minecraft!.username}</strong>
          </div>
          <div className="text-xs text-gray-400 font-mono mb-4">{user!.minecraft!.uuid}</div>
          <button onClick={() => navigate('/dashboard')} className="btn-primary">Zum Dashboard</button>
        </Card>
      ) : status === 'idle' || status === 'starting' ? (
        <Card>
          <button onClick={() => void start()} disabled={status === 'starting'} className="btn-primary w-full">
            {status === 'starting' ? <Spinner size={18} /> : 'Verknüpfung starten'}
          </button>
          <p className="text-xs text-gray-400 mt-4 text-center">
            Hinweis: Jeder Spieler kann sein Konto verknüpfen – der Code wird im
            Spiel ausgeführt und beweist, dass dir der Minecraft-Account gehört.
          </p>
        </Card>
      ) : null}

      {status === 'waiting' && code && (
        <Card className="animate-scale-in space-y-4">
          <div className="text-center">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Dein Link-Code</div>
            <div className="font-mono text-2xl font-bold text-n26 dark:text-n26-accent tracking-widest select-all">{code}</div>
            <div className="text-xs text-gray-400 mt-1">Gültig für 10 Minuten</div>
          </div>

          <div className={`rounded-xl border p-4 text-sm ${showCommands ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800' : 'border-dashed border-gray-300 dark:border-gray-600'}`}>
            <button onClick={() => setShowCommands((v) => !v)} className="flex items-center justify-between w-full text-left font-medium text-gray-700 dark:text-gray-200">
              <span>Schritte zum Verknüpfen</span>
              <span>{showCommands ? '▲' : '▼'}</span>
            </button>
            {showCommands && (
              <div className="mt-3 space-y-2.5 animate-slide-up">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  1. Ein autorisierter Spieler führt im Minecraft-Chat aus:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-900 px-3 py-2 font-mono text-xs break-all text-gray-800 dark:text-gray-100">
                    /function n26:link {'{'}code:"{code}"{'}'}
                  </code>
                  <button onClick={() => void copyCommand()} className="btn-secondary !px-2.5 !py-1.5 text-xs" title="Kopieren">
                    📋
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  2. Warte, bis das System die Verknüpfung erkennt.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Spinner size={18} className="text-n26" />
            Warte auf Verknüpfung im Spiel…
          </div>
          <button
            onClick={() => {
              setStatus('idle');
              setCode(null);
            }}
            className="btn-secondary w-full"
          >
            Abbrechen
          </button>
        </Card>
      )}

      {status === 'completed' && (
        <Card className="text-center animate-success-pop">
          <svg className="mx-auto mb-3 text-emerald-500" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M4 12.5l5 5L20 6.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="font-semibold text-emerald-600 dark:text-emerald-400">Verknüpfung erfolgreich!</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Du wirst zum Dashboard weitergeleitet…</div>
        </Card>
      )}

      {status === 'denied' && (
        <Card className="text-center animate-error-shake">
          <div className="font-semibold text-red-600 dark:text-red-400 mb-1">Verknüpfung abgelehnt</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Dieser Minecraft-Account darf nicht verknüpft werden.
          </p>
        </Card>
      )}

      {status === 'expired' && (
        <Card className="text-center">
          <div className="font-semibold text-amber-600 dark:text-amber-400 mb-1">Code abgelaufen</div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Starte eine neue Verknüpfung.</p>
          <button onClick={() => { setStatus('idle'); setCode(null); }} className="btn-primary">Erneut starten</button>
        </Card>
      )}
    </div>
  );
}