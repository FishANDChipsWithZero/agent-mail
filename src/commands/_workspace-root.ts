import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

// Glob root = longest leading path segment with no wildcard chars (* ? [ { }).
// Cross-platform: normalize \ → / first per memory/cross-platform-paths.
// Returns an absolute path (resolved against cwd if the glob is relative).
export function resolveGlobRoot(glob: string, cwd: string = process.cwd()): string {
  const norm = glob.replace(/\\/g, '/');
  const segments = norm.split('/');
  const head: string[] = [];
  for (const seg of segments) {
    if (/[*?[\]{}]/.test(seg)) break;
    head.push(seg);
  }
  // Empty head ("*", "**/x") falls back to cwd
  if (head.length === 0) return cwd;
  // Drop trailing empty segment ("C:/dev/" → ["C:","dev",""])
  while (head.length > 0 && head[head.length - 1] === '') head.pop();
  const joined = head.join('/') || '/';

  // Absolute? Windows drive letter, leading slash, or UNC.
  const isAbs = /^[a-zA-Z]:/.test(joined) || joined.startsWith('/') || joined.startsWith('\\\\');
  const candidate = isAbs ? joined : path.join(cwd, joined);

  // If candidate doesn't exist or is a file, walk up to the nearest existing directory.
  let dir = candidate;
  for (let i = 0; i < 32; i++) {
    if (existsSync(dir)) {
      try {
        if (statSync(dir).isDirectory()) return dir;
      } catch {
        // fall through
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return cwd;
}
