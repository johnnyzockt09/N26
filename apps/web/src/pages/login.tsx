import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

export function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(identifier, password);
      toast.success('Willkommen zurück!');
      navigate('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto animate-slide-up">
      <div className="card">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Anmelden</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          N26 · Virtuelles Minecraft-Konto
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="identifier">Benutzername oder E-Mail</label>
            <input
              id="identifier"
              className="input"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Passwort</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm px-3.5 py-2.5 animate-error-shake">
              {error}
            </div>
          )}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? 'Anmelden…' : 'Anmelden'}
          </button>
        </form>
        <p className="mt-5 text-sm text-gray-500 dark:text-gray-400 text-center">
          Noch kein Konto?{' '}
          <Link to="/register" className="font-semibold text-n26 hover:underline">Registrieren</Link>
        </p>
      </div>
    </div>
  );
}