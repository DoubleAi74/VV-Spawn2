/** Only a page-to-dashboard transition within the same profile skips the watermark. */
export function isPageToDashboard(previousPath, currentPath) {
  const from = typeof previousPath === 'string' ? previousPath.split('/').filter(Boolean) : [];
  const to = typeof currentPath === 'string' ? currentPath.split('/').filter(Boolean) : [];
  return from.length === 2 && to.length === 1 && from[0] === to[0];
}
