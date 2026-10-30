import type { FastifyBaseLogger } from "fastify";

type Job = { at: Date; run: () => Promise<void>; timer: NodeJS.Timeout };

const jobs = new Map<string, Job>();

export function scheduleJob(key: string, at: Date, run: () => Promise<void>, log: FastifyBaseLogger) {
  cancelJob(key);
  const timer = setTimeout(() => void runJob(key, log), Math.max(at.getTime() - Date.now(), 0));
  timer.unref();
  jobs.set(key, { at, run, timer });
}

async function runJob(key: string, log: FastifyBaseLogger) {
  const job = jobs.get(key);
  if (!job) {
    return;
  }
  jobs.delete(key);
  clearTimeout(job.timer);
  try {
    await job.run();
  } catch (error) {
    log.error({ err: error, job: key }, "Scheduled job failed");
  }
}

export function cancelJob(key: string) {
  const job = jobs.get(key);
  if (job) {
    clearTimeout(job.timer);
    jobs.delete(key);
  }
}

export function jobTime(key: string) {
  return jobs.get(key)?.at;
}

export async function runJobsDueBy(time: Date, log: FastifyBaseLogger) {
  const due = [...jobs].filter(([, job]) => job.at <= time).sort(([, a], [, b]) => a.at.getTime() - b.at.getTime());
  for (const [key] of due) {
    await runJob(key, log);
  }
}

export function cancelAllJobs() {
  for (const key of [...jobs.keys()]) {
    cancelJob(key);
  }
}
