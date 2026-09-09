import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl text-center animate-fade-in py-10">
      <div className="text-5xl font-mono font-bold tracking-[0.2em] text-gray-300 dark:text-gray-600">
        404
      </div>
      <div className="mt-3 font-mono text-sm tracking-widest text-amber-500">
        SECTOR NOT FOUND
      </div>
      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
        Dieser Bereich existiert nicht – vielleicht ist er noch nicht kartiert,
        oder der Eintrag wurde aus der Datenbank entfernt.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/" className="btn-primary">Zur Startseite</Link>
        <Link to="/levels" className="btn-secondary">UNKNOWN WORLD · Kampagne</Link>
      </div>
    </div>
  );
}