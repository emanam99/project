import { db } from './index.ts';
import { seedDatabase } from './seed-core.ts';
import { ensureSuperAdmin } from './auth-seed.ts';

// Skrip seed manual: `npm run db:seed`. Aman dijalankan berulang (idempoten).
const total = seedDatabase(db);
ensureSuperAdmin(db);
console.log(`Seed selesai. Total artikel di database: ${total}`);
