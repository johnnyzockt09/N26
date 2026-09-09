import { startServer } from './app.js';

startServer().catch((err) => {
  console.error('Fatal error starting N26 API:', err);
  process.exit(1);
});