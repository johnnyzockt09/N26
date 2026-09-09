import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './auth';
import { mockFetch, mockOk, mockNoAuth } from '../test/mockFetch';
import { getCsrfToken } from './api';

function Harness() {
  const { user, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="user">{user ? user.username : 'ANON'}</span>
      {user && <span data-testid="role">{user.role}</span>}
      <button onClick={() => void login('johnny', 'pass!123')}>login</button>
      <button onClick={() => void logout()}>logout</button>
    </div>
  );
}

function renderAuthed() {
  return render(
    <AuthProvider>
      <Harness />
    </AuthProvider>
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthProvider', () => {
  it('restores a logged-in session from the cookie-backed /me response', async () => {
    mockFetch(() =>
      mockOk({ id: 'u1', username: 'johnny', email: 'j@t.de', role: 'user', locked: false, csrfToken: 'csrf-me' })
    );
    renderAuthed();
    expect(await screen.findByTestId('user')).toHaveTextContent('johnny');
    expect(screen.getByTestId('role')).toHaveTextContent('user');
    expect(getCsrfToken()).toBe('csrf-me');
  });

  it('stays anonymous without a valid session', async () => {
    mockFetch(() => mockNoAuth());
    renderAuthed();
    expect(await screen.findByTestId('user')).toHaveTextContent('ANON');
  });

  it('logs in and stores the session + csrf token', async () => {
    const noAuthMe = vi.fn().mockReturnValue(mockNoAuth());
    mockFetch((input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === '/api/auth/me') return noAuthMe();
      if (url === '/api/auth/login') {
        expect(JSON.parse(String(init?.body ?? '{}'))).toMatchObject({ identifier: 'johnny' });
        noAuthMe.mockReturnValue(mockOk({ id: 'u1', username: 'johnny', email: 'j@t.de', role: 'admin', locked: false, csrfToken: 'csrf-me' }));
        return mockOk({
          user: { id: 'u1', username: 'johnny', email: 'j@t.de', role: 'admin', locked: false },
          csrfToken: 'csrf-login',
        });
      }
      return { status: 404, body: { success: false } };
    });

    renderAuthed();
    await userEvent.click(await screen.findByText('login'));
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('johnny'));
    expect(screen.getByTestId('role')).toHaveTextContent('admin');
    expect(getCsrfToken()).toBe('csrf-me'); // refresh() after login overwrites with the /me token
  });

  it('clears the session on logout', async () => {
    mockFetch((input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === '/api/auth/me') return mockOk({ id: 'u1', username: 'johnny', email: 'j@t.de', role: 'user', locked: false, csrfToken: 'csrf-me' });
      if (url === '/api/auth/logout') return mockOk({ status: 'LOGGED_OUT' });
      return { status: 404, body: { success: false } };
    });

    renderAuthed();
    expect(await screen.findByTestId('user')).toHaveTextContent('johnny');
    await userEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('ANON'));
  });
});