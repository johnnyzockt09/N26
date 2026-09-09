import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { StatusDot } from '../components/ui';
import { useAuth } from '../lib/auth';
import { DISCLAIMER_TEXT } from '@n26/shared';

interface SystemStatus {
  minecraftServer: 'ONLINE' | 'OFFLINE' | 'CONNECTING';
  rcon: 'ONLINE' | 'OFFLINE' | 'CONNECTING';
  dataPack: 'ONLINE' | 'OFFLINE' | 'CONNECTING';
  database: 'ONLINE' | 'OFFLINE' | 'CONNECTING';
  playit: 'ONLINE' | 'OFFLINE' | 'CONNECTING';
}

const POLL_MS = 10_000;

function useSystemStatus() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await api.get<SystemStatus>('/api/status');
      if (active && res.data) setStatus(res.data);
    };
    void load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);
  return status;
}

function StatusPanel() {
  const status = useSystemStatus();
  const items = [
    { label: 'Minecraft Server', value: status?.minecraftServer, isOnline: status?.minecraftServer === 'ONLINE' },
    { label: 'RCON', value: status?.rcon, isOnline: status?.rcon === 'ONLINE' },
    { label: 'N26 Data-Pack', value: status?.dataPack, isOnline: status?.dataPack === 'ONLINE' },
    { label: 'Datenbank', value: status?.database, isOnline: status?.database === 'ONLINE' },
    { label: 'playit.gg', value: status?.playit, isOnline: status?.playit === 'ONLINE' },
  ];
  return (
    <div className="card animate-slide-up space-y-3">
      <h2 className="font-semibold text-gray-900 dark:text-gray-100">Verbindungsstatus</h2>
      <div className="space-y-2.5">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-300">{item.label}</span>
            {status ? (
              <StatusDot status={item.isOnline ? 'ONLINE' : item.value ?? 'OFFLINE'} label={item.isOnline ? 'Online' : item.value === 'CONNECTING' ? 'Verbindung wird hergestellt...' : 'Nicht verbunden'} />
            ) : (
              <span className="text-sm text-gray-400">Prüfe…</span>
            )}
          </div>
        ))}
      </div>
      {!status && (
        <div className="mt-2">
          <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div className="h-full w-1/3 bg-n26 rounded-full animate-pulse" />
          </div>
        </div>
      )}
    </div>
  );
}

export function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-8 animate-fade-in">
      <section className="rounded-2xl border border-emerald-800/60 bg-black p-6 sm:p-8 overflow-hidden relative">
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 20% 0%, rgba(16,185,129,0.2), transparent 60%), radial-gradient(circle at 90% 100%, rgba(5,150,105,0.12), transparent 60%)' }}
        />
        <div className="relative text-left">
          <div className="text-xs tracking-[0.35em] text-emerald-500/80 font-mono">DARK BLOCKWORLD MYSTERY PUZZLE</div>
          <h2 className="mt-2 font-mono text-3xl md:text-4xl font-bold text-emerald-300">UNKNOWN WORLD</h2>
          <p className="mt-3 text-sm text-gray-400 max-w-2xl">
            Der Serverraum erwachte ohne Server. 20 Sektoren, jede Antwort öffnet die nächste:
            Morsecode, Koordinaten, gespiegelte Nachrichten und mehr. Manche Geheimnisse werden über
            mehrere Level verkettet gelöst.
          </p>
          <p className="mt-2 text-xs text-gray-600 font-mono">
            THIS PUZZLE REQUIRES A DESKTOP COMPUTER.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={user ? '/levels' : '/register'} className="btn-primary font-mono">
              Kampagne starten →
            </Link>
            {!user && <Link to="/login" className="btn-secondary font-mono">Anmelden</Link>}
          </div>
        </div>
      </section>

      <section className="text-center pt-4 pb-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-4 py-1.5 text-xs font-medium mb-5">
          Fan-/Spielsystem für MinigamesV2 · Kein echtes Finanzprodukt
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-n26 dark:text-white tracking-tight">
          N26 Minecraft Banking
        </h1>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
          Virtuelles Bank- und Minispielsystem für den Minecraft-Server von
          Johnny &amp; David. Überweise virtuelle Münzen, stelle Rechnungen und
          verwalte dein Minecraft-Konto – komplett integriert mit dem Server über playit.gg.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {user ? (
            <Link to="/dashboard" className="btn-primary text-base !px-6 !py-3">Zum Dashboard</Link>
          ) : (
            <>
              <Link to="/register" className="btn-primary text-base !px-6 !py-3">Konto erstellen</Link>
              <Link to="/login" className="btn-secondary text-base !px-6 !py-3">Anmelden</Link>
            </>
          )}
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        <div className="card animate-slide-up">
          <div className="text-2xl mb-2">💳</div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Virtuelles Konto</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Guildingen im Minecraft-Server – die Bankdaten liegen direkt im Data-Pack auf dem Server.
          </p>
        </div>
        <div className="card animate-slide-up" style={{ animationDelay: '60ms' }}>
          <div className="text-2xl mb-2">↔️</div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Überweisungen &amp; Rechnungen</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Überweise virtuelle Beträge zwischen Spielern und stelle animierte Rechnungen.
          </p>
        </div>
        <div className="card animate-slide-up" style={{ animationDelay: '120ms' }}>
          <div className="text-2xl mb-2">🔒</div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Sicher &amp; verbunden</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Argon2id-Passwörter, sichere Sessions und eine geschützte RCON-Brücke zum Server.
          </p>
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <StatusPanel />
        <div className="card animate-slide-up space-y-3">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">So funktioniert es</h2>
          <ol className="space-y-2.5 text-sm text-gray-600 dark:text-gray-300 list-decimal list-inside">
            <li>Registriere dich mit einem sicheren Passwort.</li>
            <li>Verknüpfe deinen Minecraft-Account über <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-n26 font-mono text-xs">/function n26:link</code>.</li>
            <li>Overweisungen, Rechnungen und dein Kontostand erscheinen hier im Dashboard.</li>
          </ol>
          <p className="text-xs text-gray-400 mt-3">{DISCLAIMER_TEXT}</p>
        </div>
      </div>
    </div>
  );
}