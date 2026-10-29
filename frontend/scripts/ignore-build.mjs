import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export function shouldSkipBuild(env, diff = execFileSync) {
  const previous = env.VERCEL_GIT_PREVIOUS_SHA, current = env.VERCEL_GIT_COMMIT_SHA;
  // First builds, manual redeploys and uncertain history must build. Compare with
  // the last SUCCESSFUL deployment, not HEAD^, so multi-commit pushes are safe.
  if (env.FORCE_FRONTEND_BUILD === 'true' || !/^[a-f0-9]{40}$/i.test(previous || '') ||
      !/^[a-f0-9]{40}$/i.test(current || '') || previous === current) return false;
  try {
    const changed = diff('git', ['diff', '--name-only', previous, current, '--', '.',
      ':!tests', ':!src/**/*.test.jsx', ':!scripts/*.test.mjs', ':!*.md', ':!.env.example', ':!.gitignore',
      ':!eslint.config.js', ':!vite.management.config.js', ':!vite.responsive.config.js'],
    { cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'), encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
    return changed.trim() === '';
  } catch { return false; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const skip = shouldSkipBuild(process.env);
  console.log(skip ? 'Skipping: no frontend deployment inputs changed.' : 'Building: frontend changes, redeploy, or unavailable history.');
  // Vercel's ignored-build convention is the inverse of a normal test command.
  process.exitCode = skip ? 0 : 1;
}
