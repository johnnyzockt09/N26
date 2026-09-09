import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Card, Modal, StatusBadge } from '../components/ui';
import { useToast } from '../lib/toast';
import { formatCents, TRANSFER_LIMIT_CENTS } from '@n26/shared';

interface InvoiceDto {
  id: string;
  invoiceNumber: string;
  from: { uuid: string; name: string };
  to: { uuid: string; name: string };
  amountCents: number;
  description: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
}

export function InvoicesPage() {
  const toast = useToast();
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [toUuid, setToUuid] = useState('');
  const [amountCents, setAmountCents] = useState<string>('');
  const [description, setDescription] = useState('');
  const [payingId, setPayingId] = useState<string | null>(null);
  const [verify, setVerify] = useState<{ id: string; token: string; ttl: number } | null>(null);
  const [verifyText, setVerifyText] = useState('');

  const amountCentsValue = useMemo(() => {
    const parsed = Number(amountCents.replace(/[^\d]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }, [amountCents]);

  const load = useCallback(async () => {
    const res = await api.get<{ invoices: InvoiceDto[] }>('/api/invoices');
    if (res.data) setInvoices(res.data.invoices);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    const res = await api.post<{ invoice: InvoiceDto }>('/api/invoices', {
      toUuid: toUuid.trim(),
      amountCents: amountCentsValue,
      description: description.trim(),
    });
    if (!res.success || !res.data) {
      toast.error(res.error?.message ?? 'Rechnung konnte nicht erstellt werden');
      return;
    }
    toast.success('Rechnung erstellt');
    setShowCreate(false);
    setToUuid('');
    setAmountCents('');
    setDescription('');
    await load();
  };

  const onPay = async (invoice: InvoiceDto) => {
    if (payingId) return;
    setPayingId(invoice.id);
    try {
      const res = await api.post<{ status: string; verificationToken?: string; ttlSeconds?: number }>(`/api/invoices/${invoice.id}/pay`, undefined);
      if (res.success && res.data) {
        if (res.data.status === 'SUCCESS') {
          toast.success(`Rechnung ${invoice.invoiceNumber} bezahlt`);
          await load();
        } else if (res.data.status === 'PENDING_VERIFICATION' && res.data.verificationToken) {
          setVerify({ id: invoice.id, token: res.data.verificationToken, ttl: res.data.ttlSeconds ?? 900 });
          setVerifyText('');
        } else if (res.data.status === 'PENDING_RECONCILIATION') {
          toast.info('Zahlung wird geprüft.');
        }
      } else {
        toast.error(res.error?.message ?? 'Zahlung fehlgeschlagen');
      }
    } finally {
      setPayingId(null);
    }
  };

  const onCancelInvoice = async (invoice: InvoiceDto) => {
    const res = await api.post(`/api/invoices/${invoice.id}/cancel`, undefined);
    if (res.success) {
      toast.info('Rechnung storniert');
      await load();
    } else {
      toast.error(res.error?.message ?? 'Stornieren fehlgeschlagen');
    }
  };

  const onConfirmVerify = async () => {
    if (!verify || verifyText !== verify.token) return;
    const res = await api.post<{ status: string }>(`/api/payments/${verify.id}/verify`, { token: verify.token });
    if (res.success) {
      toast.success('Rechnung bezahlt ✓');
      setVerify(null);
      await load();
    } else {
      toast.error(res.error?.message ?? 'Verifizierung fehlgeschlagen');
    }
  };

  const open = invoices.filter((i) => i.status === 'OPEN');

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Rechnungen</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Offene Rechnungen bezahlen oder erstellen</p>
        </div>
        <button onClick={() => setShowCreate((v) => !v)} className="btn-primary">
          {showCreate ? 'Schließen' : '+ Rechnung erstellen'}
        </button>
      </div>

      {showCreate && (
        <Card className="animate-slide-up">
          <form onSubmit={onCreate} className="space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Neue Rechnung</h2>
            <div>
              <label className="label" htmlFor="inv-to">Empfänger (Minecraft UUID)</label>
              <input
                id="inv-to"
                className="input font-mono"
                value={toUuid}
                onChange={(e) => setToUuid(e.target.value)}
                required
                pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                placeholder="00000000-0000-0000-0000-000000000000"
              />
            </div>
            <div>
              <label className="label" htmlFor="inv-amount">Betrag (Cent)</label>
              <input
                id="inv-amount"
                className="input font-mono"
                value={amountCents}
                onChange={(e) => setAmountCents(e.target.value.replace(/[^\d]/g, ''))}
                required
                min={1}
                inputMode="numeric"
              />
              {amountCentsValue > 0 && (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="font-semibold text-n26 dark:text-white">{formatCents(amountCentsValue)}</span>
                  {amountCentsValue > TRANSFER_LIMIT_CENTS && (
                    <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Verifizierung nötig</span>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="label" htmlFor="inv-desc">Beschreibung</label>
              <input id="inv-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="z.B. Minecraft Server" />
            </div>
            <button type="submit" disabled={amountCentsValue <= 0} className="btn-primary w-full">Rechnung erstellen</button>
          </form>
        </Card>
      )}

      {loading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse h-40" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <Card className="text-center py-10 text-gray-400">Noch keine Rechnungen.</Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {invoices.map((invoice) => {
            const needsVerify = invoice.amountCents > TRANSFER_LIMIT_CENTS;
            return (
              <div key={invoice.id} className="card animate-slide-up hover:shadow-card-hover transition-all">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-n26">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M9 13h6M9 17h6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="font-mono text-sm font-semibold text-gray-700 dark:text-gray-200">{invoice.invoiceNumber}</span>
                  </div>
                  <StatusBadge status={invoice.status} />
                </div>

                <div className="rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 mb-3">
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-gray-500 dark:text-gray-400">Von</span>
                    <span className="font-medium text-gray-800 dark:text-gray-100">{invoice.from.name}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-gray-500 dark:text-gray-400">An</span>
                    <span className="font-medium text-gray-800 dark:text-gray-100">{invoice.to.name}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-gray-500 dark:text-gray-400">Betrag</span>
                    <span className="font-bold text-n26 dark:text-n26-accent text-base tabular-nums">{formatCents(invoice.amountCents)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Beschreibung</span>
                    <span className="max-w-[60%] text-right text-gray-700 dark:text-gray-200 truncate">{invoice.description}</span>
                  </div>
                  {needsVerify && (
                    <div className="mt-2 text-xs text-blue-600 dark:text-blue-300">Verifizierung auf der Website erforderlich</div>
                  )}
                </div>

                <div className="flex gap-2">
                  {invoice.status === 'OPEN' ? (
                    <>
                      <button
                        onClick={() => onPay(invoice)}
                        disabled={Boolean(payingId)}
                        className="btn-primary flex-1 text-sm"
                      >
                        {payingId === invoice.id ? 'Bezahle…' : 'Bezahlen'}
                      </button>
                      <button onClick={() => onCancelInvoice(invoice)} className="btn-secondary flex-1 text-sm">Ablehnen</button>
                    </>
                  ) : (
                    <div className="text-xs text-gray-400 py-2.5">
                      {invoice.status === 'PAID' ? 'Bezahlt ✓' : invoice.status === 'CANCELLED' ? 'Storniert' : 'Abgelaufen'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Verification modal for invoices >100 EUR */}
      <Modal open={Boolean(verify)} onClose={() => setVerify(null)} title="Rechnungszahlung bestätigen">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Diese Rechnung überschreitet 100&nbsp;€. Bestätige die Zahlung mit dem einmaligen Token.
          </p>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-center py-4 px-3">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Token</div>
            <div className="font-mono text-sm break-all text-n26 dark:text-n26-accent select-all">{verify?.token}</div>
          </div>
          <div>
            <label className="label" htmlFor="inv-vtoken">Token eingeben</label>
            <input
              id="inv-vtoken"
              className="input font-mono"
              value={verifyText}
              onChange={(e) => setVerifyText(e.target.value)}
              placeholder="vt_…"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={onConfirmVerify}
              disabled={!verify || verifyText !== verify.token}
              className="btn-primary flex-1"
            >
              Bestätigen
            </button>
            <button onClick={() => setVerify(null)} className="btn-secondary flex-1">Abbrechen</button>
          </div>
        </div>
      </Modal>

      {open.length === 0 && invoices.length > 0 && (
        <p className="text-center text-sm text-gray-400">Keine offenen Rechnungen.</p>
      )}
    </div>
  );
}