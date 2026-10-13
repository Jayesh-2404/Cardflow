/**
 * Provision the account the e2e suite logs in as.
 *
 * Registration is open, but the suite reuses one seeded account so runs stay
 * isolated from manual testing.
 *
 *   cd server && npm run e2e:seed
 *
 * Safe to re-run: it leaves an existing account's board alone unless --reset
 * is passed.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const EMAIL = (process.env.E2E_EMAIL ?? 'e2e-local@kb.test').trim().toLowerCase();
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-local-pass';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
    if (existing) {
      console.log(`e2e account already exists: ${EMAIL}`);
      if (!process.argv.includes('--reset')) {
        console.log('pass --reset to wipe its board');
        return;
      }
      await prisma.taskEvent.deleteMany({ where: { userId: existing.id } });
      await prisma.task.deleteMany({ where: { userId: existing.id } });
      await prisma.column.deleteMany({ where: { userId: existing.id } });
      console.log('board cleared');
    } else {
      const user = await prisma.user.create({
        data: { email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 12) },
      });
      const todo = await prisma.column.create({ data: { userId: user.id, title: 'Todo', position: 0 } });
      await prisma.column.create({ data: { userId: user.id, title: 'Doing', position: 1 } });
      await prisma.column.create({ data: { userId: user.id, title: 'Done', position: 2 } });
      await prisma.task.create({
        data: {
          userId: user.id,
          columnId: todo.id,
          title: 'Welcome — drag me to Doing',
          description: 'Press N for a new task, / to filter, Ctrl+K for commands.',
          priority: 'medium',
          tags: ['start'],
          position: 0,
        },
      });
      console.log(`created e2e account: ${EMAIL} / ${PASSWORD}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
