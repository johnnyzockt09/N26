import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Card, Skeleton, Spinner, StatusBadge, StatusDot } from '../components/ui';
import { formatCents } from '@n26/shared';

interface AccountData {
  minecraft: { uuid: string; username: string; linkedAt: string };
  status: 'ACTIVE' | 'LOCKED';
  balanceCents: number;
  registered: boolean;
  source: string;
}

interface TransactionDto {
  id: string;
  transactionNumber: string;
  amountCents: number;
  from: { uuid: string; name: string };
  to: { uuid: string; name: string };
  description: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
}

interface SystemStatus {
  minecraftServer: 'ONLINE' | 'OFFLINE' | 'CONNECTING';
  rcon: 'ONLINE' | 'OFFLINE' | 'CONNECTING';
  dataPack: 'ONLINE' | 'OFFLINE' | 'CONNECTING';
  database: 'ONLINE' | 'OFFLINE' | 'CONNECTING';
  playit: 'ONLINE' | 'OFFLINE' | 'CONNECTING';
}

function useAccount() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await api.get<AccountData>('/api/account');
    if (res.success && res.data) {
      setAccount(res.data);
      setError(null);
    } else {
      setError(res.error?.message ?? 'Konto konnte nicht geladen werden');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return { account, error, loading, refresh };
}

function useSystemStatus() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await api.get<SystemStatus>('/api/status');
      if (active && res.data) setStatus(res.data);
    };
    void load();
    const id = window.setInterval(load, 10_000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);
  return status;
}

function useTransactions() {
  const [transactions, setTransactions] = useState<TransactionDto[]>([]);
  const [minecraftUuid, setMinecraftUuid] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.get<{ transactions: TransactionDto[] }>('/api/transactions');
    if (res.data) setTransactions(res.data.transactions);
    const acc = await api.get<AccountData>('/api/account');
    if (acc.data) setMinecraftUuid(acc.data.minecraft.uuid);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { transactions, minecraftUuid };
}

function QuickAction({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <Link
      to={to}
      className="card !py-4 text-center hover:shadow-card-hover hover:-translate-y-0.5 transition-all animate-fade-in"
    >
      <div className="text-2xl mb-1.5">{icon}</div>
      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{label}</div>
    </Link>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { account, error, loading } = useAccount();
  const status = useSystemStatus();
  const { transactions, minecraftUuid } = useTransactions();

  const connectionItems = [
    { label: 'Minecraft Server', value: status?.minecraftServer ?? 'CONNECTING', online: status?.minecraftServer === 'ONLINE' },
    { label: 'RCON', value: status?.rcon ?? 'CONNECTING', online: status?.rcon === 'ONLINE' },
    { label: 'N26 Data-Pack', value: status?.dataPack ?? 'CONNECTING', online: status?.dataPack === 'ONLINE' },
    { label: 'Datenbank', value: status?.database ?? 'CONNECTING', online: status?.database === 'ONLINE' },
    { label: 'playit.gg', value: status?.playit ?? 'CONNECTING', online: status?.playit === 'ONLINE' },
  ];

  const recent = transactions.slice(0, 5);

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="card overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Hallo {user?.username} 👋</h1>
              {account && (
                <StatusDot
                  status={account.status === 'ACTIVE' ? 'ACTIVE' : 'LOCKED'}
                  label={account.status === 'ACTIVE' ? 'Konto aktiv' : 'Konto gesperrt'}
                />
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              N26 · Virtuelles Minecraft-Konto
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">Kontostand</div>
            {loading ? (
              <Skeleton className="h-9 w-40 mt-1" />
            ) : account ? (
              <div className="text-3xl font-extrabold text-n26 dark:text-white tabular-nums">
                {formatCents(account.balanceCents)}
              </div>
            ) : (
              <div className="text-xl font-semibold text-red-500">–</div>
            )}
            {account && (
              <div className="text-xs text-gray-400 mt-1">
                {account.minecraft.username} · {account.minecraft.uuid.slice(0, 8)}
              </div>
            )}
          </div>
        </div>
        {error && !account && (
          <div className="mt-4 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 p-3.5 text-sm text-amber-800 dark:text-amber-200">
            {error}{' '}
            {error.includes('verknüpft') && (
              <Link to="/link" className="underline font-semibold">Minecraft-Account verknüpfen</Link>
            )}
          </div>
        )}
      </section>

      {account && (
        <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction to="/transfer" icon="➡️" label="Überweisen" />
          <QuickAction to="/invoices" icon="🧾" label="Rechnung bezahlen" />
          <QuickAction to="/transactions" icon="📜" label="Transaktionen" />
          <QuickAction to="/link" icon="🎮" label="Konto verknüpfen" />
        </section>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Letzte Transaktionen</h2>
              <Link to="/transactions" className="text-sm font-medium text-n26 hover:underline">Alle anzeigen</Link>
            </div>
            {recent.length === 0 ? (
              <p className="text-sm text-gray-400">
                {account ? 'Noch keine Transaktionen vorhanden.' : 'Verbinde dein Minecraft-Account, um loszulegen.'}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {recent.map((tx) => {
                  const isIncoming = minecraftUuid && tx.to.uuid === minecraftUuid;
                  return (
                    <li key={tx.id} className="flex items-center justify-between gap-3 py-3 animate-fade-in">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center text-lg ${isIncoming ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-red-100 dark:bg-red-900/40'}`}>
                          {isIncoming ? '◀' : '▶'}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                            {isIncoming ? `Von ${tx.from.name}` : `An ${tx.to.name}`}
                          </div>
                          <div className="text-xs text-gray-400 truncate">{tx.description || tx.transactionNumber}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`font-bold tabular-nums ${isIncoming ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-gray-100'}`}>
                          {isIncoming ? '+' : '−'} {formatCents(tx.amountCents)}
                        </div>
                        <StatusBadge status={tx.status} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <Card>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Verbindungen</h2>
          <div className="space-y-3">
            {connectionItems.map((item) => (
              <div key={item.label} className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-300">{item.label}</span>
                {item.value === 'CONNECTING' ? (
                  <span className="inline-flex items-center gap-2 text-amber-500">
                    <Spinner size={14} />
                    Verbindung…
                  </span>
                ) : (
                  <StatusDot status={item.online ? 'ONLINE' : 'OFFLINE'} label={item.online ? 'Online' : 'Nicht verbunden'} />
                )}
              </div>
            ))}
          </div>
          {!status && <Skeleton className="h-20 mt-4" />}
          {account?.source === 'datapack' && (
            <p className="mt-4 text-xs text-gray-400">
              Kontostand wird live vom Minecraft-Data-Pack gelesen.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}