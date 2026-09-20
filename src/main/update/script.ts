const q = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`

export interface SwapOptions {
  /** Process to wait for: the app has to be gone before its bundle can be replaced. */
  pid: number
  /** The installed `.app` to replace. */
  target: string
  /** The unpacked new `.app`. */
  staged: string
  /** Temporary directory holding the download; removed when the swap is done. */
  stageDir: string
  /** Command that starts the new version; only tests need to override it. */
  open?: string
}

/**
 * The shell script that replaces the app bundle. It runs detached, after TTT quits, so it cannot
 * be part of the app itself. A failed swap puts the old bundle back, so a half-updated app is not
 * a state you can end up in.
 *
 * Every tool is called by absolute path: this script has to work whatever is on PATH, and a
 * `xattr` from Homebrew or Python does not take the same options as the one in /usr/bin.
 */
export function swapScript({ pid, target, staged, stageDir, open = '/usr/bin/open' }: SwapOptions): string {
  return `#!/bin/sh
# Written by TTT to replace itself; safe to delete.
pid=${pid}
target=${q(target)}
staged=${q(staged)}
backup=${q(`${target}.old`)}
stage=${q(stageDir)}

# Wait for TTT to quit, up to 30 seconds.
i=0
while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 300 ]; do
  /bin/sleep 0.1
  i=$((i + 1))
done

# Gatekeeper would otherwise treat the new bundle as quarantined.
/usr/bin/xattr -dr com.apple.quarantine "$staged" 2>/dev/null

/bin/rm -rf "$backup"
/bin/mv "$target" "$backup" || exit 1
if /usr/bin/ditto "$staged" "$target"; then
  /bin/rm -rf "$backup"
else
  # Put the old version back: better the app you had than no app at all.
  /bin/rm -rf "$target"
  /bin/mv "$backup" "$target"
fi

${q(open)} "$target"
/bin/rm -rf "$stage"
/bin/rm -f "$0"
`
}
