import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../lib/auth';
import { ToastProvider } from '../lib/toast';
import { LevelsPage } from './levels';
import { mockFetch, mockOk } from '../test/mockFetch';

const ME = { id: 'u1', username: 'johnny', email: 'j@t.de', role: 'user', locked: false };

const sampleLevels = [
  {
    id: 1,
    slug: '01-initialisierung',
    title: 'Initialisierung',
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
  },
  {
    id: 2,
    slug: '02-kommentar',
    title: 'Der Kommentar',
    difficulty: 2,
    puzzleType: 'CODE',
    orderIndex: 2,
    storyKey: 'UNKNOWN',
    active: true,
    solved: true,
    unlocked: true,
    hintsUsed: 1,
    totalHints: 3,
    attempts: 2,
    nextLevelId: 3,
  },
  {
    id: 3,
    slug: '03-beleuchtung',
    title: 'Beleuchtung',
    difficulty: 2,
    puzzleType: 'IMAGE',
    orderIndex: 3,
    storyKey: 'UNKNOWN',
    active: true,
    solved: false,
    unlocked: false,
    hintsUsed: 0,
    totalHints: 3,
    attempts: 0,
    nextLevelId: null,
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <LevelsPage />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('LevelsPage', () => {
  it('renders unlocked, solved and locked sectors', async () => {
    mockFetch((input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === '/api/auth/me') return mockOk(ME);
      if (url === '/api/game/levels') return mockOk({ levels: sampleLevels });
      if (url === '/api/game/progress') return mockOk({ solvedCount: 1, unlockedCount: 2, totalActive: 3, currentLevelId: 1, storyKey: 'UNKNOWN' });
      return { status: 404, body: { success: false } };
    });

    renderPage();

    expect(await screen.findByText('DIE KAMPAGNE')).toBeInTheDocument();
    expect(screen.getByText('Initialisierung')).toBeInTheDocument();
    expect(screen.getByText('Der Kommentar')).toBeInTheDocument();
    // Locked sector hides its title.
    expect(screen.queryByText('Beleuchtung')).not.toBeInTheDocument();
    expect(screen.getAllByText('SIGNAL VERLOREN')).toHaveLength(1);
    expect(screen.getByText('1')).toBeInTheDocument(); // solved count numerator
  });

  it('links the current unlocked sector to its detail page', async () => {
    mockFetch((input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === '/api/auth/me') return mockOk(ME);
      if (url === '/api/game/levels') return mockOk({ levels: sampleLevels });
      if (url === '/api/game/progress') return mockOk({ solvedCount: 0, unlockedCount: 1, totalActive: 3, currentLevelId: 1, storyKey: 'UNKNOWN' });
      return { status: 404, body: { success: false } };
    });

    renderPage();
    await screen.findByText('DIE KAMPAGNE');
    const link = screen.getByText('Initialisierung').closest('a');
    expect(link).toHaveAttribute('href', '/levels/1');
  });
});