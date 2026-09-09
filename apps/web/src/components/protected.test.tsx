import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../lib/auth';
import { ProtectedRoute, AdminRoute } from './protected';
import { mockFetch, mockOk, mockNoAuth } from '../test/mockFetch';

beforeEach(() => {
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>DASHBOARD_CONTENT</div>} />
            <Route path="/levels" element={<div>LEVELS_CONTENT</div>} />
          </Route>
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<div>ADMIN_CONTENT</div>} />
          </Route>
          <Route path="/login" element={<div>LOGIN_PAGE</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('route guards', () => {
  it('redirects unauthenticated users to /login', async () => {
    mockFetch(() => mockNoAuth());
    renderAt('/dashboard');
    expect(await screen.findByText('LOGIN_PAGE')).toBeInTheDocument();
    expect(screen.queryByText('DASHBOARD_CONTENT')).not.toBeInTheDocument();
  });

  it('allows authenticated users through the protected route', async () => {
    mockFetch(() => mockOk({ id: 'u1', username: 'johnny', email: 'j@t.de', role: 'user', locked: false }));
    renderAt('/levels');
    expect(await screen.findByText('LEVELS_CONTENT')).toBeInTheDocument();
  });

  it('keeps non-admin users out of the admin area', async () => {
    mockFetch(() => mockOk({ id: 'u1', username: 'johnny', email: 'j@t.de', role: 'user', locked: false }));
    renderAt('/admin');
    expect(await screen.findByText('DASHBOARD_CONTENT')).toBeInTheDocument();
    expect(screen.queryByText('ADMIN_CONTENT')).not.toBeInTheDocument();
  });

  it('lets admin users into the admin area', async () => {
    mockFetch(() => mockOk({ id: 'u1', username: 'david', email: 'd@t.de', role: 'admin', locked: false }));
    renderAt('/admin');
    expect(await screen.findByText('ADMIN_CONTENT')).toBeInTheDocument();
  });
});