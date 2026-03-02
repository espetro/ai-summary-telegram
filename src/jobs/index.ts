import type { Job } from 'pg-boss';
import { PgBoss } from 'pg-boss';

export const boss = new PgBoss(process.env.DATABASE_URL!);

export async function startJobs() {
  await boss.start();
  
  // Create queues before registering workers
  const queues = ['ingest', 'notify', 'digest', 'digest-fanout', 'nudge'];
  for (const queue of queues) {
    await boss.createQueue(queue);
  }
  
  // Register workers
  await boss.work('ingest', async (jobs) => {
    const { handleIngestJob } = await import('./ingest.job');
    return handleIngestJob(jobs as unknown);
  });
  
  await boss.work('notify', async (jobs) => {
    const { handleNotifyJob } = await import('./notify.job');
    return handleNotifyJob(jobs as unknown);
  });
  
  await boss.work('digest', async (jobs) => {
    const { handleDigestJob } = await import('./digest.job');
    return handleDigestJob(jobs as unknown);
  });
  
  await boss.work('digest-fanout', async (job) => {
    const { handleDigestFanoutJob } = await import('./digest.job');
    return handleDigestFanoutJob();
  });
  
  await boss.work('nudge', async (jobs) => {
    const { handleNudgeJob } = await import('./nudge.job');
    return handleNudgeJob(jobs as unknown);
  });
}

export async function stopJobs() {
  await boss.stop();
}
