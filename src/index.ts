import { routes } from "./routes";
import { handle, type Env } from "./lib/http";
import { drainJobs } from "./lib/jobs";

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(routes, request, env);
  },
  /** Cron Trigger (wrangler.jsonc: triggers.crons) — the durable job drain. This
   * is the ONLY thing that runs background work: a request must never do slow or
   * retryable work inline, it enqueues it (enqueue() in src/lib/jobs.ts) and
   * returns. Awaited, not waitUntil()'d: the tick must not report success before
   * the batch is actually finished. */
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await drainJobs(env);
  },
};
