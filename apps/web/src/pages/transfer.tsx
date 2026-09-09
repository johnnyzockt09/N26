import { FormEvent, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Card, Modal } from '../components/ui';
import { useToast } from '../lib/toast';
import { formatCents, TRANSFER_LIMIT_CENTS } from '@n26/shared';

interface TransferResponse {
  status: 'SUCCESS' | 'PENDING_VERIFICATION' | 'PENDING_RECONCILIATION' | 'IN_PROGRESS';
  verificationToken?: string;
  ttlSeconds?: number;
  transaction?: { id: string; transactionNumber: string };
}

export function TransferPage() {
  const toast = useToast();
  const [toUuid, setToUuid] = useState('');
  const [amountCents, setAmountCents] = useState<string>('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creditNote, setCreditNote] = useState<string | null>(null);
  const [pending, setPending] = useState<{ token: string; ttl: number; txId: string } | null>(null);
  const [verifyToken, setVerifyToken] = useState('');
  const [verifyBusy, setVerifyBusy] = useState(false);

  const amountCentsValue = useMemo(() => {
    const parsed = Number(amountCents.replace(/[,.]/, '').replace(/[^\d]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }, [amountCents]);

  const formatted = useMemo(() => formatCents(amountCentsValue), [amountCentsValue]);
  const needsVerification = amountCentsValue > TRANSFER_LIMIT_CENTS;
  const verifiedCorrectly = Boolean(creditNote && creditNote === verifyToken);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreditNote(null);
    setPending(null);
    setBusy(true);
    const res = await api.post<TransferResponse>('/api/transfer', {
      toUuid: toUuid.trim(),
      amountCents: amountCentsValue,
      description: description.trim(),
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error?.message ?? 'Überweisung fehlgeschlagen');
      return;
    }
    const data = res.data!;
    if (data.status === 'SUCCESS') {
      toast.success(`Überweisung ausgeführt: ${formatted}`);
      setToUuid('');
      setAmountCents('');
      setDescription('');
      return;
    }
    if (data.status === 'PENDING_RECONCILIATION') {
      toast.info('Die Überweisung wird geprüft (Reconciliation).');
      return;
    }
    if (data.status === 'PENDING_VERIFICATION' && data.verificationToken) {
      setCreditNote(data.verificationToken);
      setPending({ token: data.verificationToken, ttl: data.ttlSeconds ?? 900, txId: data.transaction?.id ?? '' });
      setVerifyToken('');
    }
  };

  const onVerify = async () => {
    if (!pending || !verifiedCorrectly) return;
    setVerifyBusy(true);
    const res = await api.post(`/api/payments/${pending.txId}/verify`, { token: creditNote });
    setVerifyBusy(false);
    if (res.success) {
      toast.success('Zahlung freigegeben und ausgeführt ✓');
      setPending(null);
      setCreditNote(null);
      setVerifyToken('');
      setToUuid('');
      setAmountCents('');
      setDescription('');
    } else {
      toast.error(res.error?.message ?? 'Verifizierung fehlgeschlagen');
    }
  };

  const onCancel = async () => {
    if (!pending) return;
    const res = await api.post(`/api/transactions/${pending.txId}/cancel`, undefined);
    if (res.success) {
      setPending(null);
      setCreditNote(null);
      toast.info('Zahlung abgebrochen');
    } else {
      toast.error(res.error?.message ?? 'Abbruch fehlgeschlagen');
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
      <Card>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Überweisen</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Virtuelle Überweisung an einen verknüpften Spieler
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="toUuid">Empfänger (Minecraft UUID)</label>
            <input
              id="toUuid"
              className="input font-mono"
              value={toUuid}
              onChange={(e) => setToUuid(e.target.value)}
              required
              placeholder="00000000-0000-0000-0000-000000000000"
              pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
            />
          </div>
          <div>
            <label className="label" htmlFor="amount">Betrag (in Cent einfügen, Vorschau unten)</label>
            <input
              id="amount"
              className="input font-mono"
              value={amountCents}
              onChange={(e) => setAmountCents(e.target.value.replace(/[^\d]/g, ''))}
              required
              min={1}
              placeholder="z.B. 5000 für 50,00 €"
              inputMode="numeric"
            />
            {amountCentsValue > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-lg font-bold text-n26 dark:text-white tabular-nums">{formatted}</span>
                {needsVerification && (
                  <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    Verifizierung erforderlich (&gt;&nbsp;100&nbsp;€)
                  </span>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="label" htmlFor="description">Beschreibung</label>
            <input
              id="description"
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              placeholder="z.B. Testzahlung"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm px-3.5 py-2.5 animate-error-shake">
              {error}
            </div>
          )}
          {needsVerification && amountCentsValue > 0 && !creditNote && (
            <div className="rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-sm px-3.5 py-3">
              Diese Zahlung überschreitet 100&nbsp;€ und muss auf der Webseite bestätigt werden. Nach dem Absenden
              erhältst du einen einmaligen Verifizierungs-Token.
            </div>
          )}
          <button type="submit" disabled={busy || amountCentsValue <= 0} className="btn-primary w-full">
            {busy ? 'Wird ausgeführt…' : needsVerification && amountCentsValue > 0 ? 'Überweisen & verifizieren' : 'Überweisen'}
          </button>
        </form>
      </Card>

      <Modal open={Boolean(pending)} onClose={onCancel} title="Zahlungsbestätigung erforderlich">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Diese Überweisung überschreitet 100&nbsp;€. Bestätige die Zahlung mit dem einmaligen Token.
          </p>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-center py-4 px-3">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Dein Verifizierungs-Token</div>
            <div className="font-mono text-sm break-all text-n26 dark:text-n26-accent select-all">{creditNote}</div>
            <div className="mt-1 text-xs text-gray-400">Gültig für {pending?.ttl ?? 900} Sekunden · nur einmal verwendbar</div>
          </div>
          <div>
            <label className="label" htmlFor="vtoken">Token eingeben</label>
            <input
              id="vtoken"
              className="input font-mono"
              value={verifyToken}
              onChange={(e) => setVerifyToken(e.target.value)}
              placeholder="vt_…"
            />
          </div>
          {creditNote && verifyToken.length > 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {verifiedCorrectly ? (
                <span className="text-emerald-600 dark:text-emerald-400">✓ Token stimmt überein – Zahlung kann freigegeben werden.</span>
              ) : (
                <span>Token stimmt noch nicht überein.</span>
              )}
            </div>
          )}
          {pending?.ttl !== undefined && pending.ttl <= 60 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-200 text-xs px-3 py-2">
              Der Token läuft gleich ab.
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={onVerify} disabled={!verifiedCorrectly || verifyBusy} className="btn-primary flex-1">
              {verifyBusy ? 'Wird freigegeben…' : 'Zahlung freigeben'}
            </button>
            <button onClick={onCancel} className="btn-secondary flex-1">Abbrechen</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}