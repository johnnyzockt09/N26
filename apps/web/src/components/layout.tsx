import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { DISCLAIMER_TEXT } from '@n26/shared';

function Logo({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="30" fill="#0B3A28" />
        <text x="32" y="43" fontFamily="Inter, Arial" fontSize="24" fontWeight="700" fill="#fff" textAnchor="middle">
          N26
        </text>
      </svg>
      {size >= 32 && (
        <div className="leading-tight">
          <div className="font-bold text-gray-900 dark:text-gray-100">N26</div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 -mt-0.5">Minecraft Banking</div>
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  return (
    <button
      onClick={() => setDark((d) => !d)}
      className="rounded-xl p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition"
      aria-label="Design umschalten"
    >
      {dark ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M16.66 7.34l1.41-1.41" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    toast.info('Abgemeldet');
    navigate('/login');
  };

  const navLink = ({ isActive }: { isActive: boolean }) =>
    `rounded-xl px-3 py-2 text-sm font-medium transition ${
      isActive ? 'bg-n26 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-n26-dark transition-colors">
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-gray-900/90 backdrop-blur border-b border-gray-100 dark:border-gray-800">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between gap-4">
          <Link to="/" aria-label="N26 Startseite">
            <Logo />
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {user && (
              <>
                <NavLink to="/levels" className={navLink}>UNKNOWN WORLD</NavLink>
                <NavLink to="/dashboard" className={navLink}>Banking</NavLink>
                <NavLink to="/transfer" className={navLink}>Überweisen</NavLink>
                <NavLink to="/invoices" className={navLink}>Rechnungen</NavLink>
                <NavLink to="/transactions" className={navLink}>Transaktionen</NavLink>
                {user.role === 'admin' && <NavLink to="/admin" className={navLink}>Admin</NavLink>}
              </>
            )}
          </nav>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            {user ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:block text-right">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{user.username}</div>
                  <div className="text-xs text-gray-400">{user.minecraft?.username ?? 'Nicht verknüpft'}</div>
                </div>
                <button onClick={handleLogout} className="btn-secondary !px-3 !py-2 text-sm">
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" className="btn-secondary !px-3 !py-2 text-sm">Login</Link>
                <Link to="/register" className="btn-primary !px-3 !py-2 text-sm">Registrieren</Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 mt-10">
        <div className="mx-auto max-w-6xl px-4 py-6 space-y-3">
          <div className="max-w-3xl rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3.5 text-xs text-amber-800 dark:text-amber-200">
            {DISCLAIMER_TEXT}
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>N26 Minecraft Banking · Fan-/Spielsystem für MinigamesV2</span>
            <Link to="/" className="hover:underline">Startseite</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}