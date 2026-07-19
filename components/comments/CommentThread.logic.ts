export function commentThreadCount(count?: number, comments?: unknown[]): number {
  return count ?? comments?.length ?? 0;
}
