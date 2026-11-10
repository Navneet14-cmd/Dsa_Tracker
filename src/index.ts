import { createApp } from './app';
import { config } from './lib/config';
import { prisma } from './lib/prisma';
import { isMockMode } from './services/ai';

const app = createApp();

const server = app.listen(config.PORT, () => {
  console.log(`==========================================`);
  console.log(`🚀 DSA Tracker server started on port ${config.PORT}`);
  console.log(`Environment: ${config.NODE_ENV}`);
  console.log(`AI: ${isMockMode() ? 'mock mode (no ANTHROPIC_API_KEY)' : config.ANTHROPIC_MODEL}`);
  console.log(`==========================================`);
});

const shutdown = (signal: string) => {
  console.log(`${signal} received, shutting down...`);
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
