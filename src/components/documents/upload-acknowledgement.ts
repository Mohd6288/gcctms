/**
 * Whether a finished upload should be acknowledged to the person who made it.
 *
 * True only on the transition from uploading to not-uploading with no error.
 *
 * Its own module, free of React and next-intl, for two reasons: the three
 * cases below are worth asserting and the component itself cannot be imported
 * into a Node test (next-intl reaches for next/headers), and keeping the rule
 * separate from the rendering makes it obvious that it IS a rule.
 *
 * Acknowledging a failure would tell someone their file is safe when nothing
 * was saved. Acknowledging on mount would congratulate them for arriving.
 */
export function acknowledgesUpload(wasUploading: boolean, isUploading: boolean, error?: string | null): boolean {
  return wasUploading && !isUploading && !error;
}
