import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, StatusBadge } from '../components/ui';
import { formatCents } from '@n26/shared';

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
  idempotencyKey?: string | null;
}

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<TransactionDto[]>([]);
  const [minecraftUuid, setMinecraftUuid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [txRes, accRes] = await Promise.all([
      api.get<{ transactions: TransactionDto[] }>('/api/transactions'),
      api.get<{ minecraft: { uuid: string } }>('/api/account'),
    ]);
    if (txRes.data) setTransactions(txRes.data.transactions);
    if (accRes.data) setMinecraftUuid(accRes.data.minecraft.uuid);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Transaktionen</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Alle Überweisungen deines virtuellen Kontos</p>
      </div>

      {loading ? (
        <div className="card animate-pulse h-48" />
      ) : transactions.length === 0 ? (
        <Card className="text-center py-10 text-gray-400">Noch keine Transaktionen.</Card>
      ) : (
        <div className="space-y-2.5">
          {transactions.map((tx, i) => {
            const isIncoming = minecraftUuid ? tx.to.uuid === minecraftUuid : null;
            return (
              <Card key={tx.id} className="!p-4 animate-slide-up" >
                <div style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`shrink-0 h-11 w-11 rounded-xl flex items-center justify-center ${isIncoming ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-red-100 dark:bg-red-900/30 text-red-600'}`}>
                        {isIncoming ? '↓' : '↑'}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                          {isIncoming ? `${tx.from.name} → dir` : `dir → ${tx.to.name}`}
                        </div>
                        <div className="text-xs text-gray-400 truncate">{tx.description || '–'}</div>
                        <div className="text-xs text-gray-400 font-mono">{tx.transactionNumber}</div>
                      </div>
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                      <div className={`font-bold tabular-nums ${isIncoming ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-gray-100'}`}>
                        {isIncoming ? '+' : '−'} {formatCents(tx.amountCents)}
                      </div>
                      <div className="flex items-center gap-2 justify-start sm:justify-end mt-0.5">
                        <StatusBadge status={tx.status} />
                        <span className="text-xs text-gray-400">
                          {new Date(tx.createdAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}