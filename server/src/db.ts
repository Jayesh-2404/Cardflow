import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/**
 * Open the pool before the first request arrives.
 *
 * The database is remote (Neon), so the first query pays a full TLS handshake:
 * measured at ~3.7s cold versus ~235ms once a connection is established. Every
 * session starts with two queries, so leaving that cost to the first user after
 * a deploy is the single largest source of perceived startup time.
 *
 * Failure is swallowed on purpose: a slow or unreachable database should surface
 * as a normal request error with the existing "API unreachable" message, not
 * stop the server from booting and reporting.
 */
export function warmDatabase(): void {
  void prisma
    .$queryRaw`SELECT 1`
    .then(() => console.log('db connection warm'))
    .catch((err: unknown) => console.warn('db warm-up failed:', err));
}