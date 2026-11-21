/**
 * Test-only pause points used by the emulator suite to interleave competing workers
 * deterministically (e.g. "let another worker take over while this one waits on Razorpay").
 * No-ops unless NODE_ENV === 'test' and a hook is registered.
 */
type Hook = (ctx: Record<string, any>) => Promise<void> | void;

const hooks = new Map<string, Hook>();

export function setTestHook(name: string, fn: Hook | null): void {
  if (fn) hooks.set(name, fn);
  else hooks.delete(name);
}

export function clearTestHooks(): void {
  hooks.clear();
}

export async function runTestHook(name: string, ctx: Record<string, any> = {}): Promise<void> {
  if (process.env.NODE_ENV !== 'test') return;
  const hook = hooks.get(name);
  if (!hook) return;
  // One-shot: the hook runs for the first worker that reaches this point only.
  hooks.delete(name);
  await hook(ctx);
}
