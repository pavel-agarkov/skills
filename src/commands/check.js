import { runSaved } from './update.js';

/** check: read-only "would update change anything?". Returns { pending, ... }; the CLI maps pending to exit 3. */
export async function check(opts, ctx) {
  const out = ctx.out ?? ((s) => process.stdout.write(s));
  const r = runSaved(opts, ctx, { check: true });
  out(r.pending ? 'Changes pending: run "update" to apply them.\n' : 'Up to date.\n');
  return r;
}
