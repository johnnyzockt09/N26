import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { ToastProvider } from '../lib/toast';
import { AuthProvider } from '../lib/auth';
import { mockFetch, mockNoAuth, resetFetch } from '../test/mockFetch';

describe('NotFound page', () => {
  afterEach(() => {
    resetFetch();
  });

  it('renders a custom 404 instead of redirecting', () => {
    mockFetch(mockNoAuth);
    render(
      <MemoryRouter initialEntries={['/does-not-exist']}>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('SECTOR NOT FOUND')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zur Startseite' })).toHaveAttribute('href', '/');
  });
});