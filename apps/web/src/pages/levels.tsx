import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { difficultyBlocks } from '@n26/shared';
import type { LevelMeta } from '@n26/shared';
import { fetchLevels, fetchProgress, resetAllLevels } from '../lib/game';
import { useToast } from '../lib/toast';
import { Skeleton } from '../components/ui';

function storyLabel(key: LevelMeta['storyKey']): string | null {
  switch (key) {
    case 'PROJECT_NULL':
      return 'EIN NAME TAUSCHT AM SCHILD: PROJECT NULL.';
    case 'WORLD_01':
      return 'WORLD_01: DIE WELT IST EIN SERVERRAUM.';
    case 'WORLD_02':
      return 'WORLD_02: UNTER DER MINE SCHLÄFT MEHR.';
    case 'WORLD_03':
      return 'WORLD_03: DAS PORTAL WARTET.';
    default:
      return null;
  }
}

export function LevelsPage() {
  const [levels, setLevels] = useState<LevelMeta[] | null>(null);
  const [progress, setProgress] = useState<{ solvedCount: number; totalActive: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const [lv, pr] = await Promise.all([fetchLevels(), fetchProgress()]);
      setLevels(lv);
      setProgress({ solvedCount: pr.solvedCount, totalActive: pr.totalActive });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Level konnten nicht geladen werden');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="card border-red-700/50 bg-red-950/30">
        <div className="text-sm text-red-300">{error}</div>
        <button className="btn-secondary mt-3" onClick={() => void load()}>
          Erneut versuchen
        </button>
      </div>
    );
  }

  if (!levels || !progress) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  const pct = progress.totalActive > 0 ? Math.round((progress.solvedCount / progress.totalActive) * 100) : 0;
  const currentId = levels.find((l) => l.unlocked && !l.solved)?.id;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-emerald-800/60 bg-black p-5 sm:p-6 overflow-hidden relative">
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 50% 0%, rgba(16,185,129,0.15), transparent 70%)' }}
        />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs tracking-[0.35em] text-emerald-500/80 font-mono">UNKNOWN WORLD · MYSTERY PROTOKOL</div>
            <h1 className="mt-1 text-2xl md:text-3xl font-mono font-bold text-emerald-300">DIE KAMPAGNE</h1>
            <p className="mt-2 text-sm text-gray-400 max-w-xl">
              20 Sektoren. Jede Antwort öffnet den nächsten. Löse die letzten Zellen, um PROJECT NULL zu erreichen.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-mono text-3xl font-bold text-emerald-300 tabular-nums">
              {progress.solvedCount}<span className="text-gray-500 text-xl">/{progress.totalActive}</span>
            </div>
            <div className="mt-2 h-2 w-48 ml-auto rounded-full bg-gray-800 overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {levels.map((level) => {
          const isCurrent = level.id === currentId && !level.solved;
          return (
            <Link
              key={level.id}
              to={level.unlocked ? `/levels/${level.id}` : '/levels'}
              aria-disabled={!level.unlocked}
              className={`relative rounded-xl border p-4 transition ${
                level.unlocked
                  ? 'border-gray-700 bg-gray-900 hover:border-emerald-600 hover:-translate-y-0.5'
                  : level.solved
                    ? 'border-emerald-800 bg-emerald-950/20 cursor-default'
                    : 'border-gray-800/70 bg-gray-900/40 cursor-not-allowed'
              }`}
            >
              <div className="flex items-start justify-between">
                <span className={`font-mono text-xs ${level.unlocked ? 'text-emerald-400' : level.solved ? 'text-emerald-500' : 'text-gray-600'}`}>
                  SECTOR {String(level.orderIndex).padStart(2, '0')}
                </span>
                {level.solved ? (
                  <span className="text-emerald-500">◉</span>
                ) : level.unlocked ? (
                  <span className={`h-2.5 w-2.5 rounded-full ${isCurrent ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
                ) : (
                  <span className="text-gray-700">✕</span>
                )}
              </div>
              <div className={`mt-2 text-sm font-semibold line-clamp-2 ${level.unlocked || level.solved ? 'text-gray-100' : 'text-gray-500'}`}>
                {level.unlocked || level.solved ? level.title : 'SIGNAL VERLOREN'}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="font-mono text-[10px] tracking-wider text-gray-500">{difficultyBlocks(level.difficulty)}</span>
                <span className="text-[10px] uppercase tracking-wider text-gray-600">{level.puzzleType}</span>
              </div>
              {isCurrent && (
                <div className="absolute -top-2 left-3 rounded bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-black font-mono tracking-wider">
                  AKTIV
                </div>
              )}
            </Link>
          );
        })}
      </div>

      <section className="rounded-xl border border-gray-800 bg-gray-950 p-4 text-xs text-gray-400 space-y-1.5 font-mono">
        <div>&gt; STATUS: {progress.solvedCount}/{progress.totalActive} Sektoren entschlüsselt</div>
        <div>&gt; HINWEIS: Dieses Rätsel erfordert einen Desktop-Computer mit Maus und Tastatur.</div>
        <div>&gt; Antworten werden ausschließlich serverseitig geprüft.</div>
      </section>

      {progress.solvedCount > 0 && (
        <div className="flex justify-end">
          <button
            className="btn-secondary !text-red-400 !border-red-900 text-sm"
            onClick={async () => {
              if (!window.confirm('Gesamten Fortschritt zurücksetzen? Dies kann nicht rückgängig gemacht werden.')) return;
              try {
                await resetAllLevels();
                toast.info('Fortschritt zurückgesetzt');
                await load();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Zurücksetzen fehlgeschlagen');
              }
            }}
          >
            Fortschritt zurücksetzen
          </button>
        </div>
      )}

      {levels.find((l) => l.solved && l.storyKey)?.storyKey && (
        <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-300 font-mono">
          &gt; {storyLabel(levels.find((l) => l.solved && l.storyKey)!.storyKey as Exclude<LevelMeta['storyKey'], null>)}
        </div>
      )}
    </div>
  );
}