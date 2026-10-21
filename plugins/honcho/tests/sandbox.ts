import { join } from "path";

// config.ts resolves ~/.honcho/config.json through a module-level homedir()
// const, so tests that need a fixture config run the code in a child process
// with HOME pointed at the fixture. Inherited HONCHO_* vars are stripped;
// pass the ones a test needs in `env`.
export function runInSandbox(home: string, script: string, env: Record<string, string> = {}): string {
  const base = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("HONCHO_"))
  ) as Record<string, string>;
  const proc = Bun.spawnSync(["bun", "-e", script], {
    env: { ...base, ...env, HOME: home },
    cwd: join(import.meta.dir, ".."),
  });
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
  return proc.stdout.toString().trim();
}
