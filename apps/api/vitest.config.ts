import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'sqlite:./test-memory.db',
      SESSION_SECRET: 'test-secret-0123456789abcdef0123456789abcdef0123456789abcdef',
      RATE_LIMIT_MAX_AUTH: '1000',
      RATE_LIMIT_MAX_API: '1000',
    },
  },
});