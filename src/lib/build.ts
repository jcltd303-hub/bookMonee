/**
 * Which build is this?
 *
 * "Is my deployment current?" has been asked twice while looking at a phone running an
 * older deploy. The commit id is stamped in at build time, from VERCEL_GIT_COMMIT_SHA,
 * and shown in the Train tab — the fastest way to tell a stale deploy from a live bug.
 */
declare const __BUILD_SHA__: string | undefined;

export function buildSha(): string {
  return typeof __BUILD_SHA__ === "string" && __BUILD_SHA__ ? __BUILD_SHA__ : "dev";
}
