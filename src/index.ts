import os from 'os';
import { createApp } from './app';
import { config } from './lib/config';
import { prisma } from './lib/prisma';

/** IPv4 addresses other devices can use to reach this machine. */
function lanAddresses(): { address: string; label: string }[] {
  const out: { address: string; label: string }[] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      // Tailscale hands out CGNAT addresses (100.64.0.0/10).
      const [o1, o2] = a.address.split('.').map(Number);
      const tailscale = o1 === 100 && o2 >= 64 && o2 <= 127;
      out.push({ address: a.address, label: tailscale ? 'Tailscale' : name });
    }
  }
  return out;
}

const app = createApp();

const server = app.listen(config.PORT, config.HOST, () => {
  const ai =
    config.AI_PROVIDER === 'ollama'
      ? `ollama (${config.OLLAMA_MODEL} at ${config.OLLAMA_BASE_URL})`
      : config.AI_PROVIDER === 'anthropic'
        ? `anthropic (${config.ANTHROPIC_MODEL} / ${config.ANTHROPIC_FAST_MODEL})`
        : 'rules (built-in)';
  console.log('==========================================');
  console.log(`DSA Tracker API listening on ${config.HOST}:${config.PORT}`);
  console.log(`Environment: ${config.NODE_ENV}`);
  console.log(`AI provider: ${ai}; falls back to rules on failure`);
  console.log(`Local:   http://localhost:${config.PORT}`);
  if (config.HOST === '0.0.0.0') {
    for (const { address, label } of lanAddresses()) {
      console.log(`Network: http://${address}:${config.PORT}  (${label})`);
    }
  }
  console.log('Set EXPO_PUBLIC_API_URL in mobile/.env to one of the Network URLs.');
  console.log('==========================================');
});

server.on('error', (err: NodeJS.ErrnoException) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${config.PORT} is already in use.` : err);
  process.exit(1);
});

const shutdown = (signal: string) => {
  console.log(`${signal} received, shutting down...`);
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
