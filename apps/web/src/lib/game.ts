import { api } from './api';
import type {
  LevelMeta,
  LevelContent,
  LevelSubmitResult,
  GameProgress,
  LevelHint,
} from '@n26/shared';

export interface LevelError {
  code: string;
  message: string;
}

export async function fetchLevels(): Promise<LevelMeta[]> {
  const res = await api.get<{ levels: LevelMeta[] }>('/api/game/levels');
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Level konnten nicht geladen werden');
  return res.data.levels;
}

export async function fetchLevel(id: number): Promise<LevelContent> {
  const res = await api.get<LevelContent>(`/api/game/levels/${id}`);
  if (!res.success || !res.data) {
    throw Object.assign(new Error(res.error?.message ?? 'Level konnte nicht geladen werden'), { code: res.error?.code ?? 'LEVEL_NOT_FOUND' }) as Error & { code: string };
  }
  return res.data;
}

export async function submitLevelAnswer(id: number, answer: string): Promise<LevelSubmitResult> {
  const res = await api.post<LevelSubmitResult>(`/api/game/levels/${id}/submit`, { answer });
  if (!res.success || !res.data) {
    throw Object.assign(new Error(res.error?.message ?? 'Antwort konnte nicht geprüft werden'), { code: res.error?.code ?? 'LEVEL_ERROR' }) as Error & { code: string };
  }
  return res.data;
}

export async function unlockLevelHint(id: number): Promise<{ hint: LevelHint; remaining: number }> {
  const res = await api.post<{ hint: LevelHint; remaining: number }>(`/api/game/levels/${id}/hints`);
  if (!res.success || !res.data) {
    throw Object.assign(new Error(res.error?.message ?? 'Hinweis konnte nicht freigeschaltet werden'), { code: res.error?.code ?? 'LEVEL_ERROR' }) as Error & { code: string };
  }
  return res.data;
}

export async function fetchProgress(): Promise<GameProgress> {
  const res = await api.get<GameProgress>('/api/game/progress');
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Fortschritt konnte nicht geladen werden');
  return res.data;
}

export async function resetAllLevels(): Promise<void> {
  const res = await api.post<{ status: string }>('/api/game/reset');
  if (!res.success) throw new Error(res.error?.message ?? 'Zurücksetzen fehlgeschlagen');
}