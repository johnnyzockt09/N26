import { Link, useParams } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { difficultyBlocks } from '@n26/shared';
import type { LevelContent, LevelSubmitResult } from '@n26/shared';
import { fetchLevel, submitLevelAnswer, unlockLevelHint } from '../lib/game';
import { useToast } from '../lib/toast';
import { Skeleton } from '../components/ui';
import { useIsDesktop } from '../lib/useIsDesktop';

type ErrorWithCode = Error & { code?: string };

function BodyBlock({ content }: { content: LevelContent }) {
  const { body } = content;
  return (
    <div className="space-y-4">
      {body.text && (
        <div className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-gray-300 bg-gray-950 border border-gray-800 rounded-lg p-4">
          {body.text}
        </div>
      )}
      {body.code && (
        <pre className="overflow-x-auto rounded-lg bg-black border border-gray-800 p-4 text-[13px] text-emerald-300 font-mono leading-relaxed">
          {body.code}
        </pre>
      )}
      {body.extra?.grid && (
        <pre className="overflow-x-auto rounded-lg bg-black border border-gray-800 p-4 text-[13px] text-cyan-300 font-mono leading-relaxed">
          {body.extra.grid}
        </pre>
      )}
      {body.image && (
        <figure className="rounded-lg border border-gray-800 bg-gray-950 p-2">
          <img src={body.image} alt="Hinweis" className="mx-auto max-h-72 rounded" />
        </figure>
      )}
      {body.audio && (
        <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
          <audio className="w-full" controls preload="none" src={body.audio} />
          <div className="mt-2 text-[11px] text-gray-500 font-mono">[AUDIO] {body.audio}</div>
        </div>
      )}
      {body.file && (
        <a
          href={body.file}
          download
          className="btn-secondary"
        >
          Datei herunterladen ({body.file.split('/').pop()})
        </a>
      )}
    </div>
  );
}

function MobileGuard({ children }: { children: React.ReactNode }) {
  const isDesktop = useIsDesktop();
  if (isDesktop) return <>{children}</>;
  return (
    <div className="card border-red-900/60 bg-red-950/30 text-center py-10">
      <div className="font-mono text-lg font-bold text-red-300 tracking-widest">THIS PUZZLE REQUIRES A DESKTOP COMPUTER.</div>
      <p className="mt-3 text-sm text-gray-400 max-w-md mx-auto">
        UNKNOWN WORLD ist für Maus und Tastatur gebaut. Kehre an einen Desktop-Computer zurück, um diesen Sektor zu öffnen.
      </p>
    </div>
  );
}

export function LevelPage() {
  const { id: idParam } = useParams();
  const levelId = Number(idParam);
  const toast = useToast();
  const ambientRef = useRef<HTMLAudioElement | null>(null);
  const [ambientOn, setAmbientOn] = useState(false);

  const [level, setLevel] = useState<LevelContent | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<LevelSubmitResult | null>(null);
  const [hintError, setHintError] = useState<string | null>(null);

  const toggleAmbient = async () => {
    const el = ambientRef.current;
    if (!el) return;
    if (ambientOn) {
      el.pause();
      setAmbientOn(false);
      return;
    }
    try {
      await el.play();
      setAmbientOn(true);
    } catch {
      toast.error('Audio blockiert – erneut versuchen');
    }
  };

  const load = useCallback(async () => {
    if (!Number.isInteger(levelId) || levelId < 1) {
      setErrorCode('LEVEL_NOT_FOUND');
      setErrorMessage('Ungültiger Sektor');
      return;
    }
    setLevel(null);
    setResult(null);
    setHintError(null);
    setErrorCode(null);
    setErrorMessage(null);
    try {
      const lv = await fetchLevel(levelId);
      setLevel(lv);
    } catch (e) {
      const err = e as ErrorWithCode;
      setErrorCode(err.code ?? 'LEVEL_NOT_FOUND');
      setErrorMessage(err.message);
    }
  }, [levelId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async () => {
    if (!level) return;
    setSubmitting(true);
    try {
      const res = await submitLevelAnswer(level.id, answer);
      setResult(res);
      if (res.solved) {
        if (res.storyReveal) toast.success(res.storyReveal);
        else toast.success('Sektor entschlüsselt');
        const fresh = await fetchLevel(level.id);
        setLevel(fresh);
      } else {
        setAnswer('');
      }
    } catch (e) {
      const err = e as ErrorWithCode;
      if (err.code === 'LEVEL_LOCKED') {
        setErrorCode('LEVEL_LOCKED');
        setErrorMessage(err.message);
      } else {
        toast.error(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleHint = async () => {
    if (!level) return;
    setHintError(null);
    try {
      const { hint, remaining } = await unlockLevelHint(level.id);
      toast.info(`Hinweis ${hint.key} entschlüsselt · noch ${remaining} verfügbar`);
      const fresh = await fetchLevel(level.id);
      setLevel(fresh);
    } catch (e) {
      const err = e as ErrorWithCode;
      if (err.code === 'NO_MORE_HINTS') setHintError('Keine weiteren Hinweise');
      else if (err.code === 'LEVEL_LOCKED') {
        setErrorCode('LEVEL_LOCKED');
        setErrorMessage(err.message);
      } else {
        setHintError(err.message);
      }
    }
  };

  const solved = Boolean(level && (level.solved || result?.solved));

  return (
    <div className="space-y-5">
      <MobileGuard>
        {errorCode ? (
          <div className="card border-red-900/60 bg-red-950/20 text-center py-10">
            <div className="font-mono text-sm text-red-400">{errorCode}</div>
            <div className="mt-2 font-mono text-xl font-bold text-red-200">SEKTOR GESPERRT</div>
            <p className="mt-2 text-sm text-gray-400">{errorMessage}</p>
            <Link to="/levels" className="btn-primary mt-6">Zurück zur Kampagne</Link>
          </div>
        ) : !level ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-12" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-mono text-xs tracking-[0.3em] text-emerald-500/80">
                  SECTOR {String(level.orderIndex).padStart(2, '0')} · {level.puzzleType}
                </div>
                <h1 className="mt-1 text-2xl font-mono font-bold text-gray-100">{level.title}</h1>
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-mono text-xs text-gray-500">{difficultyBlocks(level.difficulty)}</span>
                  {level.solved && (
                    <span className="badge bg-emerald-900/60 text-emerald-300 border border-emerald-700">GELÖST</span>
                  )}
                  {level.attempts > 0 && (
                    <span className="text-[11px] text-gray-500 font-mono">VERSUCHE: {level.attempts}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <audio ref={ambientRef} src="/assets/audio/ambient/server-ambient.wav" loop preload="none" />
                <button
                  type="button"
                  className={`btn-secondary text-sm ${ambientOn ? '!border-emerald-700 !text-emerald-300' : ''}`}
                  onClick={() => void toggleAmbient()}
                >
                  {ambientOn ? 'AMBIENT AN' : 'AMBIENT'}
                </button>
                <Link to="/levels" className="btn-secondary text-sm">← Kampagne</Link>
              </div>
            </div>

            <p className="text-sm text-gray-400">{level.description}</p>

            <BodyBlock content={level} />

            {result?.solved && result.storyReveal && (
              <div className="rounded-xl border border-emerald-700/60 bg-emerald-950/30 p-4 font-mono text-sm text-emerald-300">
                &gt; FREIGABE: {result.storyReveal}
              </div>
            )}

            {solved && level.nextLevelId ? (
              <div className="flex flex-wrap gap-3">
                <Link to={`/levels/${level.nextLevelId}`} className="btn-primary">
                  Nächstes Level →
                </Link>
                <Link to="/levels" className="btn-secondary">Kampagne</Link>
              </div>
            ) : !solved ? (
              <form
                className="card border-gray-800 bg-gray-950 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSubmit();
                }}
              >
                <label className="block">
                  <span className="label !text-gray-300 font-mono">ANTWORT</span>
                  <div className="flex gap-2">
                    <input
                      className="input !bg-black !border-gray-700 font-mono uppercase placeholder:normal-case"
                      placeholder="DEIN SCHLÜSSEL"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      disabled={submitting}
                      aria-label="Antwort"
                    />
                    <button type="submit" className="btn-primary shrink-0" disabled={submitting || !answer.trim()}>
                      {submitting ? 'Prüfe…' : 'Prüfen'}
                    </button>
                  </div>
                </label>

                {result && !result.solved && (
                  <div className="text-sm text-red-400 font-mono">
                    &gt; FEHLER: Schlüssel nicht erkannt.
                  </div>
                )}
              </form>
            ) : null}

            <div className="card border-gray-800 bg-gray-950">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-mono font-bold text-gray-300 tracking-wider">HINWEISE</h2>
                <button
                  className="btn-secondary !px-3 !py-1.5 text-xs"
                  onClick={() => void handleHint()}
                  disabled={!level.hints || level.hints.length >= level.totalHints}
                >
                  {level.hints && level.hints.length >= level.totalHints ? 'Keine weiteren' : `Hinweis öffnen (${level.hintsUsed}/${level.totalHints})`}
                </button>
              </div>
              {hintError && <div className="mt-2 text-xs text-amber-400 font-mono">&gt; {hintError}</div>}
              {level.hints && level.hints.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {level.hints.map((h) => (
                    <li key={h.key} className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-sm text-amber-200 font-mono">
                      <span className="text-amber-500">[{h.key}]</span> {h.text}
                    </li>
                  ))}
                </ul>
              )}
              {!level.hints || level.hints.length === 0 ? (
                <p className="mt-3 text-xs text-gray-500 font-mono">&gt; Keine Hinweise entschlüsselt.</p>
              ) : null}
            </div>
          </div>
        )}
      </MobileGuard>
    </div>
  );
}