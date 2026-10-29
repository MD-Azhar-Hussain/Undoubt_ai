import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { shouldSkipBuild } from './ignore-build.mjs';

const env = { VERCEL_GIT_PREVIOUS_SHA: 'a'.repeat(40), VERCEL_GIT_COMMIT_SHA: 'b'.repeat(40) };
test('builds on first deploy, same-commit redeploy, override, or unavailable Git history', () => {
  assert.equal(shouldSkipBuild({}, () => ''), false);
  assert.equal(shouldSkipBuild({ ...env, VERCEL_GIT_COMMIT_SHA: env.VERCEL_GIT_PREVIOUS_SHA }, () => ''), false);
  assert.equal(shouldSkipBuild({ ...env, FORCE_FRONTEND_BUILD: 'true' }, () => ''), false);
  assert.equal(shouldSkipBuild(env, () => { throw new Error('shallow checkout'); }), false);
});
test('skips only when deployment inputs are unchanged since the last successful deployment', () => {
  assert.equal(shouldSkipBuild(env, (_cmd, args) => {
    assert.deepEqual(args.slice(0, 4), ['diff', '--name-only', env.VERCEL_GIT_PREVIOUS_SHA, env.VERCEL_GIT_COMMIT_SHA]);
    return '';
  }), true);
  assert.equal(shouldSkipBuild(env, () => 'frontend/src/App.jsx\n'), false);
});
test('Git exclusions omit preview/tests but retain application paths', () => {
  const skipped = shouldSkipBuild(env, (_cmd, args, options) => {
    const tracked = execFileSync('git', ['ls-files', '--', ...args.slice(5)], options).trim().split(/\r?\n/);
    assert.ok(tracked.includes('src/App.jsx'));
    assert.ok(tracked.includes('package-lock.json'));
    assert.ok(!tracked.some(path => path.startsWith('tests/') || path.endsWith('.test.jsx')));
    return '';
  });
  assert.equal(skipped, true, 'Git pathspec and assertions must succeed, not fall back to a build');
});
