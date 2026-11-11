// Development-only files in dist/ that production builds leave out (#443, #448).
// Pattern-based so a new preview page is excluded automatically: every top-level HTML page other than the game's
// index.html, every top-level stylesheet other than the game's style.css, and the review capture folder.
const GAME_ENTRY_FILES = new Set(['index.html', 'style.css']);

/** @param {string} relativePath path inside dist/ using forward slashes */
export function isDevOnly(relativePath) {
  const path = relativePath.replaceAll('\\', '/').replace(/^\.\//, '');
  if (path === 'reviews' || path.startsWith('reviews/')) return true;
  if (path.includes('/')) return false;
  return /\.(html|css)$/.test(path) && !GAME_ENTRY_FILES.has(path);
}
