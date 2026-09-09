import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../lib/toast';

export function RegisterPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwörter stimmen nicht überein.');
      return;
    }
    if (password.length < 10) {
      setError('Passwort muss mindestens 10 Zeichen lang sein.');
      return;
    }
    setBusy(true);
    const res = await api.post('/api/auth/register', { username, email, password });
    if (!res.success) {
      setError(res.error?.message ?? 'Registrierung fehlgeschlagen.');
      setBusy(false);
      return;
    }
    toast.success('Konto erstellt! Du kannst dich jetzt anmelden.');
    navigate('/login');
  };

  return (
    <div className="max-w-md mx-auto animate-slide-up">
      <div className="card">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Registrieren</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Erstelle dein virtuelles N26 Minecraft-Konto
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="username">Benutzername</label>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              pattern="[a-zA-Z0-9_]{3,32}"
              title="3–32 Zeichen, Buchstaben, Zahlen und Unterstrich"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="label" htmlFor="email">E-Mail</label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
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
              minLength={10}
              autoComplete="new-password"
              placeholder="Mindestens 10 Zeichen"
            />
            <p className="mt-1 text-xs text-gray-400">
              Groß- &amp; Kleinbuchstaben sowie mindestens eine Zahl erforderlich.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="confirm">Passwort wiederholen</label>
            <input
              id="confirm"
              type="password"
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm px-3.5 py-2.5 animate-error-shake">
              {error}
            </div>
          )}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? 'Konto wird erstellt…' : 'Registrieren'}
          </button>
        </form>
        <p className="mt-5 text-sm text-gray-500 dark:text-gray-400 text-center">
          Schon ein Konto?{' '}
          <Link to="/login" className="font-semibold text-n26 hover:underline">Anmelden</Link>
        </p>
      </div>
    </div>
  );
}