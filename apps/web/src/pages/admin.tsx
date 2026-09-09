import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, StatusBadge } from '../components/ui';
import { useToast } from '../lib/toast';
import { AdminLevelsTab } from './adminLevels';

interface AdminStatus {
  minecraftServer: 'ONLINE' | 'OFFLINE' | 'CONNECTING';
  rcon: 'ONLINE' | 'OFFLINE' | 'CONNECTING';
  dataPack: 'ONLINE' | 'OFFLINE' | 'CONNECTING';
  database: 'ONLINE' | 'OFFLINE' | 'CONNECTING';
  playit: 'ONLINE' | 'OFFLINE' | 'CONNECTING';
}

interface AdminAccount {
  userId: string;
  username: string;
  role: string;
  locked: boolean;
  minecraft: { uuid: string; username: string } | null;
}

interface AuditEntry {
  id: number;
  event: string;
  actorUserId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export function AdminPage() {
  const toast = useToast();
  const [tab, setTab] = useState<'status' | 'accounts' | 'audit' | 'levels'>('status');
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [lockedUuids, setLockedUuids] = useState<Record<string, boolean>>({});

  const loadStatus = async () => {
    const res = await api.get<AdminStatus>('/api/admin/status');
    if (res.data) setStatus(res.data);
  };

  const loadAccounts = async () => {
    const res = await api.get<{ accounts: AdminAccount[] }>('/api/admin/accounts');
    if (res.data) setAccounts(res.data.accounts);
  };

  const loadAudit = async () => {
    const res = await api.get<{ logs: AuditEntry[] }>('/api/admin/audit?limit=100');
    if (res.data) setAudit(res.data.logs);
  };

  useEffect(() => {
    if (tab === 'status') void loadStatus();
    if (tab === 'accounts') void loadAccounts();
    if (tab === 'audit') void loadAudit();
  }, [tab]);

  const toggleLock = async (uuid: string, lock: boolean) => {
    const res = await api.post(lock ? '/api/admin/account/lock' : '/api/admin/account/unlock', { uuid });
    if (res.success) {
      toast.success(lock ? 'Konto gesperrt' : 'Konto entsperrt');
      setLockedUuids((p) => ({ ...p, [uuid]: lock }));
      await loadAccounts();
    } else {
      toast.error(res.error?.message ?? 'Aktion fehlgeschlagen');
    }
  };

  const kickPlayer = async (username: string) => {
    const reason = window.prompt('Kick-Grund (optional):', 'Du wurdest von einem Administrator entfernt.');
    if (reason === null) return;
    const res = await api.post('/api/admin/kick', { username, reason: reason.trim() || undefined });
    if (res.success) {
      toast.success(`${username} wurde vom Server gekickt`);
    } else {
      toast.error(res.error?.message ?? 'Kick fehlgeschlagen');
    }
  };

  const tabs = [
    { id: 'status', label: 'Status' },
    { id: 'accounts', label: 'Accounts' },
    { id: 'audit', label: 'Audit-Log' },
    { id: 'levels', label: 'Level-Editor' },
  ] as const;

  const statusRows = status
    ? [
        { label: 'Minecraft Server', v: status.minecraftServer },
        { label: 'RCON', v: status.rcon },
        { label: 'N26 Data-Pack', v: status.dataPack },
        { label: 'Datenbank', v: status.database },
        { label: 'playit.gg', v: status.playit },
      ]
    : [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Admin-Rolle wird automatisch vergeben · serverseitige Rollenprüfung
        </p>
      </div>

      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              tab === t.id ? 'bg-n26 text-white' : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'status' && (
        <Card>
          <div className="space-y-3">
            {statusRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-300">{row.label}</span>
                <StatusBadge status={row.v} />
              </div>
            ))}
          </div>
          {!status && <div className="animate-pulse h-24 mt-2 rounded-lg bg-gray-100 dark:bg-gray-800" />}
        </Card>
      )}

      {tab === 'accounts' && (
        <div className="space-y-3">
          {accounts.map((acc) => (
            <Card key={acc.userId} className="!p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    {acc.username}
                    {acc.role === 'admin' && <span className="badge bg-n26 text-white">Admin</span>}
                    {acc.locked && <span className="badge bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Gesperrt</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {acc.minecraft ? `${acc.minecraft.username} · ${acc.minecraft.uuid}` : 'Kein Minecraft-Link'}
                  </div>
                </div>
                {acc.minecraft && acc.username !== 'admin' && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => void kickPlayer(acc.minecraft!.username)}
                      className="btn-secondary !px-3 !py-1.5 text-xs text-amber-600 dark:text-amber-300"
                      title="Spieler vom Server kicken"
                    >
                      Rauswerfen
                    </button>
                    <button
                      onClick={() => void toggleLock(acc.minecraft!.uuid, !(lockedUuids[acc.minecraft!.uuid] ?? acc.locked))}
                      className={`btn-secondary !px-3 !py-1.5 text-xs ${acc.locked || lockedUuids[acc.minecraft!.uuid] ? 'text-emerald-600' : 'text-red-600'}`}
                    >
                      {acc.locked || lockedUuids[acc.minecraft!.uuid] ? 'Entsperren' : 'Sperren'}
                    </button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'levels' && <AdminLevelsTab />}

      {tab === 'audit' && (
        <Card className="overflow-x-auto">
          {audit.length === 0 ? (
            <p className="text-sm text-gray-400">Keine Audit-Einträge.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-100 dark:border-gray-800">
                  <th className="pb-2 pr-3">Zeit</th>
                  <th className="pb-2 pr-3">Ereignis</th>
                  <th className="pb-2 pr-3">User</th>
                  <th className="pb-2">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {audit.map((entry) => (
                  <tr key={entry.id} className="text-gray-700 dark:text-gray-300">
                    <td className="py-2 pr-3 whitespace-nowrap text-xs">
                      {new Date(entry.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{entry.event}</td>
                    <td className="py-2 pr-3 text-xs">{entry.actorUserId?.slice(0, 8) ?? '–'}</td>
                    <td className="py-2 text-xs text-gray-400 max-w-xs truncate">
                      {entry.details ? JSON.stringify(entry.details) : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}