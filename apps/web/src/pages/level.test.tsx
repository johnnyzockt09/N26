import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../lib/auth';
import { ToastProvider } from '../lib/toast';
import { LevelPage } from './level';
import { mockFetch, mockOk } from '../test/mockFetch';

const ME = { id: 'u1', username: 'johnny', email: 'j@t.de', role: 'user', locked: false };

function levelContent(
  overrides: Partial<{
    solved: boolean;
    hintsUsed: number;
    hints: { key: number; text: string }[];
    nextLevelId: number | null;
  }> = {}
) {
  return {
    id: 1,
    slug: '01-initialisierung',
    title: 'Initialisierung',
    description: 'Das System fordert dich auf, dich auszuweisen.',
    body: { text: 'An der Mauer steht: FRJVAQ\n\nWas sagt sie?' },
    difficulty: 1,
    puzzleType: 'TEXT',
    orderIndex: 1,
    storyKey: 'UNKNOWN',
    active: true,
    solved: false,
    unlocked: true,
    hintsUsed: 0,
    totalHints: 3,
    attempts: 0,
    nextLevelId: 2,
    hints: [],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/levels/1']}>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/levels/:id" element={<LevelPage />} />
            <Route path="/levels" element={<div>CAMPAIGN_PAGE</div>} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

const realWidth = window.innerWidth;

beforeEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1440 });
});

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: realWidth });
});

describe('LevelPage', () => {
  it('renders the puzzle body and locks on unseen sectors', async () => {
    mockFetch((input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === '/api/auth/me') return mockOk(ME);
      if (url.startsWith('/api/game/levels/')) return mockOk(levelContent());
      return { status: 404, body: { success: false } };
    });

    renderPage();
    expect(await screen.findByText('Initialisierung')).toBeInTheDocument();
    expect(screen.getByText(/Was sagt sie\?/)).toBeInTheDocument();
    expect(screen.getByLabelText('Antwort')).toBeInTheDocument();
  });

  it('shows a desktop-only warning on small screens', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 600 });
    mockFetch(() => mockOk(ME));
    renderPage();
    expect(await screen.findByText('THIS PUZZLE REQUIRES A DESKTOP COMPUTER.')).toBeInTheDocument();
  });

  it('reports a wrong answer and accepts the correct one with the story reveal', async () => {
    let solveState = 'wrong';
    mockFetch((input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === '/api/auth/me') return mockOk(ME);
      if (url === '/api/game/levels/1/submit') {
        expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({ answer: 'session' });
        return solveState === 'wrong'
          ? { status: 200, body: { success: true, data: { solved: false, alreadySolved: false, levelId: 1, nextLevelId: null, storyReveal: null } } }
          : { status: 200, body: { success: true, data: { solved: true, alreadySolved: false, levelId: 1, nextLevelId: 2, storyReveal: 'SERVER STATUS: UNKNOWN' } } };
      }
      if (url.startsWith('/api/game/levels/')) {
        return solveState === 'wrong' ? mockOk(levelContent()) : mockOk(levelContent({ solved: true, nextLevelId: 2 }));
      }
      return { status: 404, body: { success: false } };
    });

    renderPage();
    const input = await screen.findByLabelText('Antwort');
    const submit = screen.getByRole('button', { name: 'Prüfen' });

    await userEvent.type(input, 'session');
    await userEvent.click(submit);
    expect(await screen.findByText(/FEHLER: Schlüssel nicht erkannt/)).toBeInTheDocument();

    solveState = 'correct';
    await userEvent.type(input, 'session');
    await userEvent.click(submit);
    await waitFor(() => expect(screen.getAllByText(/SERVER STATUS: UNKNOWN/).length).toBeGreaterThan(0));
    expect(screen.getByText('Nächstes Level →')).toHaveAttribute('href', '/levels/2');
  });

  it('unlocks hints one at a time', async () => {
    let hintsUnlocked = 0;
    const hints = [
      { key: 1, text: 'Das System verschiebt um 13 Stellen.' },
      { key: 2, text: 'FRJVAQ wird zu einem englischen Wort.' },
    ];
    mockFetch((input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === '/api/auth/me') return mockOk(ME);
      if (url === '/api/game/levels/1/hints') {
        hintsUnlocked += 1;
        return mockOk({ hint: hints[hintsUnlocked - 1], remaining: hints.length - hintsUnlocked });
      }
      if (url.startsWith('/api/game/levels/')) return mockOk(levelContent({ hintsUsed: hintsUnlocked, hints: hints.slice(0, hintsUnlocked) }));
      return { status: 404, body: { success: false } };
    });

    renderPage();
    await screen.findByLabelText('Antwort');
    await userEvent.click(screen.getByRole('button', { name: /Hinweis öffnen/ }));

    expect(await screen.findByText(/Das System verschiebt um 13 Stellen\./)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Hinweis öffnen/ })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Hinweis öffnen/ }));
    expect(await screen.findByText(/FRJVAQ wird zu einem englischen Wort\./)).toBeInTheDocument();
  });

  it('renders the locked sector screen when the API denies access', async () => {
    mockFetch((input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === '/api/auth/me') return mockOk(ME);
      if (url === '/api/game/levels/1') {
        return { status: 403, body: { success: false, error: { code: 'LEVEL_LOCKED', message: 'Dieses Level ist noch gesperrt' } } };
      }
      return { status: 404, body: { success: false } };
    });

    renderPage();
    expect(await screen.findByText('SEKTOR GESPERRT')).toBeInTheDocument();
    expect(screen.getByText('Zurück zur Kampagne')).toBeInTheDocument();
  });
});