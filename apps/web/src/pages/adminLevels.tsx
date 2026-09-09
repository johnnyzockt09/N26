import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card } from '../components/ui';
import { useToast } from '../lib/toast';
import { difficultyBlocks } from '@n26/shared';
import type { LevelFull, LevelDifficulty, PuzzleType, StoryKey } from '@n26/shared';

const PUZZLE_TYPES: PuzzleType[] = ['TEXT', 'IMAGE', 'AUDIO', 'FILE', 'URL', 'CODE', 'META', 'MIXED'];
const STORY_KEYS: StoryKey[] = ['UNKNOWN', 'PROJECT_NULL', 'WORLD_01', 'WORLD_02', 'WORLD_03'];

interface LevelForm {
  id: number | null;
  slug: string;
  title: string;
  description: string;
  text: string;
  code: string;
  image: string;
  audio: string;
  file: string;
  grid: string;
  answers: string;
  hints: string;
  difficulty: LevelDifficulty;
  puzzleType: PuzzleType;
  storyKey: StoryKey | null;
  storyReveal: string;
  requiresLevelId: number | null;
  active: boolean;
}

const emptyForm: LevelForm = {
  id: null,
  slug: '',
  title: '',
  description: '',
  text: '',
  code: '',
  image: '',
  audio: '',
  file: '',
  grid: '',
  answers: '',
  hints: '',
  difficulty: 1,
  puzzleType: 'TEXT',
  storyKey: null,
  storyReveal: '',
  requiresLevelId: null,
  active: true,
};

function fromLevel(l: LevelFull): LevelForm {
  const hints = l.hints
    .slice()
    .sort((a, b) => a.key - b.key)
    .map((h) => h.text)
    .join('\n');
  return {
    id: l.id,
    slug: l.slug,
    title: l.title,
    description: l.description,
    text: l.body.text ?? '',
    code: l.body.code ?? '',
    image: l.body.image ?? '',
    audio: l.body.audio ?? '',
    file: l.body.file ?? '',
    grid: l.body.extra?.grid ?? '',
    answers: l.answers.join('\n'),
    hints,
    difficulty: l.difficulty,
    puzzleType: l.puzzleType,
    storyKey: l.storyKey,
    storyReveal: l.storyReveal ?? '',
    requiresLevelId: l.requiresLevelId,
    active: l.active,
  };
}

function toPayload(form: LevelForm): Record<string, unknown> {
  const answers = form.answers.split('\n').map((a) => a.trim()).filter(Boolean);
  const hints = form.hints.split('\n').map((h) => h.trim()).filter(Boolean);
  const body: Record<string, unknown> = {};
  if (form.text.trim()) body.text = form.text;
  if (form.code.trim()) body.code = form.code;
  if (form.image.trim()) body.image = form.image;
  if (form.audio.trim()) body.audio = form.audio;
  if (form.file.trim()) body.file = form.file;
  if (form.grid.trim()) body.extra = { grid: form.grid };
  return {
    slug: form.slug.trim(),
    title: form.title.trim(),
    description: form.description.trim(),
    body,
    answers,
    hints,
    difficulty: form.difficulty,
    puzzleType: form.puzzleType,
    storyKey: form.storyKey,
    storyReveal: form.storyReveal.trim() || null,
    requiresLevelId: form.requiresLevelId,
    active: form.active,
  };
}

export function AdminLevelsTab() {
  const toast = useToast();
  const [levels, setLevels] = useState<LevelFull[]>([]);
  const [form, setForm] = useState<LevelForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    const res = await api.get<{ levels: LevelFull[] }>('/api/admin/levels');
    if (res.data) setLevels(res.data.levels);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const set = <K extends keyof LevelForm>(key: K, value: LevelForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!form.title.trim() || !form.slug.trim() || !form.description.trim() || form.answers.split('\n').filter((a) => a.trim()).length === 0) {
      toast.error('Titel, Slug, Beschreibung und mindestens eine Antwort sind Pflicht.');
      return;
    }
    setSaving(true);
    try {
      const payload = toPayload(form);
      const res = form.id
        ? await api.put(`/api/admin/levels/${form.id}`, payload)
        : await api.post('/api/admin/levels', payload);
      if (res.success) {
        toast.success(form.id ? 'Level aktualisiert' : 'Level erstellt');
        setForm(emptyForm);
        await load();
      } else {
        toast.error(res.error?.message ?? 'Speichern fehlgeschlagen');
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (l: LevelFull) => {
    if (!window.confirm(`Level „${l.title}" wirklich löschen?`)) return;
    const res = await api.del(`/api/admin/levels/${l.id}`);
    if (res.success) {
      toast.success('Level gelöscht');
      if (form.id === l.id) setForm(emptyForm);
      await load();
    } else {
      toast.error(res.error?.message ?? 'Löschen fehlgeschlagen');
    }
  };

  const filtered = levels.filter((l) => l.title.toLowerCase().includes(filter.toLowerCase()) || l.slug.toLowerCase().includes(filter.toLowerCase()));
  const options = levels.filter((l) => l.id !== form.id);

  return (
    <div className="space-y-5">
      <Card className="!bg-black border-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-mono font-bold text-emerald-300">{form.id ? `Level bearbeiten #${form.id}` : 'Neues Level'}</h2>
            <p className="text-xs text-gray-500 font-mono">Antworten werden serverseitig geprüft und NIEMALS an Spieler ausgeliefert.</p>
          </div>
          <div className="flex gap-2">
            {form.id && (
              <button className="btn-secondary text-sm" onClick={() => setForm(emptyForm)}>Neu</button>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label className="label !text-gray-300">Titel</label>
              <input className="input !bg-black !border-gray-700" value={form.title} onChange={(e) => set('title', e.target.value)} />
            </div>
            <div>
              <label className="label !text-gray-300">Slug (a-z, 0-9, -)</label>
              <input className="input !bg-black !border-gray-700" value={form.slug} onChange={(e) => set('slug', e.target.value)} />
            </div>
            <div>
              <label className="label !text-gray-300">Beschreibung</label>
              <textarea className="input !bg-black !border-gray-700" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
            </div>
            <div>
              <label className="label !text-gray-300">Text (Hinweis-Text, Leerzeilen als Absätze)</label>
              <textarea className="input !bg-black !border-gray-700 font-mono text-xs" rows={5} value={form.text} onChange={(e) => set('text', e.target.value)} />
            </div>
            <div>
              <label className="label !text-gray-300">Code-Block</label>
              <textarea className="input !bg-black !border-gray-700 font-mono text-xs" rows={5} value={form.code} onChange={(e) => set('code', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label !text-gray-300">Image-URL</label>
                <input className="input !bg-black !border-gray-700 font-mono text-xs" value={form.image} onChange={(e) => set('image', e.target.value)} />
              </div>
              <div>
                <label className="label !text-gray-300">Audio-URL</label>
                <input className="input !bg-black !border-gray-700 font-mono text-xs" value={form.audio} onChange={(e) => set('audio', e.target.value)} />
              </div>
              <div>
                <label className="label !text-gray-300">Datei-URL</label>
                <input className="input !bg-black !border-gray-700 font-mono text-xs" value={form.file} onChange={(e) => set('file', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label !text-gray-300">Grid (extra)</label>
              <textarea className="input !bg-black !border-gray-700 font-mono text-xs" rows={5} value={form.grid} onChange={(e) => set('grid', e.target.value)} />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="label !text-gray-300">Antworten (eine pro Zeile)</label>
              <textarea className="input !bg-black !border-gray-700 font-mono text-xs !border-amber-700/50" rows={4} value={form.answers} onChange={(e) => set('answers', e.target.value)} />
            </div>
            <div>
              <label className="label !text-gray-300">Hinweise (eine pro Zeile, der Reihe nach freigeschaltet)</label>
              <textarea className="input !bg-black !border-gray-700 font-mono text-xs" rows={4} value={form.hints} onChange={(e) => set('hints', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label !text-gray-300">Schwierigkeit</label>
                <select className="input !bg-black !border-gray-700" value={form.difficulty} onChange={(e) => set('difficulty', Number(e.target.value) as LevelDifficulty)}>
                  {[1, 2, 3, 4, 5].map((d) => (
                    <option key={d} value={d}>{difficultyBlocks(d as LevelDifficulty)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label !text-gray-300">Typ</label>
                <select className="input !bg-black !border-gray-700" value={form.puzzleType} onChange={(e) => set('puzzleType', e.target.value as PuzzleType)}>
                  {PUZZLE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label !text-gray-300">Story-Key</label>
                <select className="input !bg-black !border-gray-700" value={form.storyKey ?? ''} onChange={(e) => set('storyKey', (e.target.value || null) as StoryKey | null)}>
                  <option value="">—</option>
                  {STORY_KEYS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label !text-gray-300">Freischaltung durch</label>
                <select className="input !bg-black !border-gray-700" value={form.requiresLevelId ?? ''} onChange={(e) => set('requiresLevelId', e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Direkt offen —</option>
                  {options.map((l) => (
                    <option key={l.id} value={l.id}>#{l.orderIndex} {l.title}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label !text-gray-300">Story-Reveal (nur nach Lösung sichtbar)</label>
              <input className="input !bg-black !border-gray-700" value={form.storyReveal} onChange={(e) => set('storyReveal', e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
              Aktiv (im Spiel sichtbar)
            </label>
            <button className="btn-primary w-full" onClick={() => void save()} disabled={saving}>
              {saving ? 'Speichert…' : form.id ? 'Änderungen speichern' : 'Level erstellen'}
            </button>
          </div>
        </div>
      </Card>

      <Card className="!bg-black border-gray-800">
        <div className="mb-3">
          <h2 className="font-mono font-bold text-gray-200">{levels.length} Level</h2>
          <input className="input !bg-black !border-gray-700 mt-2 max-w-xs" placeholder="Suchen…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-800">
                <th className="pb-2 pr-3">#</th>
                <th className="pb-2 pr-3">Titel</th>
                <th className="pb-2 pr-3">Slug</th>
                <th className="pb-2 pr-3">Typ</th>
                <th className="pb-2 pr-3">Schw.</th>
                <th className="pb-2 pr-3">Antworten</th>
                <th className="pb-2">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {filtered.map((l) => (
                <tr key={l.id} className="text-gray-300">
                  <td className="py-2 pr-3 font-mono text-xs text-gray-500">{l.orderIndex}</td>
                  <td className="py-2 pr-3">
                    <button
                      className="font-semibold hover:text-emerald-300 text-left"
                      onClick={() => setForm(fromLevel(l))}
                    >
                      {l.title}
                    </button>
                    {!l.active && <span className="ml-2 text-[10px] uppercase text-gray-600">inaktiv</span>}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-gray-500">{l.slug}</td>
                  <td className="py-2 pr-3 text-xs">{l.puzzleType}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-gray-500">{difficultyBlocks(l.difficulty)}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-amber-400/80">{l.answers.length}</td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      <button className="text-xs text-emerald-400 hover:underline" onClick={() => setForm(fromLevel(l))}>Bearbeiten</button>
                      <button className="text-xs text-red-400 hover:underline" onClick={() => void remove(l)}>Löschen</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}