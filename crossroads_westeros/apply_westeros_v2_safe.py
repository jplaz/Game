#!/usr/bin/env python3
"""Run the v2 Westeros presentation patch with a compile-safe string matcher.

The original v2 matcher allowed quoted-string matches to cross line boundaries.
That could accidentally rewrite engine identifiers between two unrelated quotes
(e.g. MUS_RG_ENCOUNTER_GYM_LEADER -> MUS_RG_ENCOUNTER_KEEP_LEADER).
This wrapper fixes the matcher in memory, then executes the maintained v2 patch.
"""
from pathlib import Path
import sys

SCRIPT = Path(__file__).with_name("apply_westeros_v2.py")
source = SCRIPT.read_text(encoding="utf-8")

old = "string_re = re.compile(r'\"(?:\\\\.|[^\"\\\\])*\"')"
new = "string_re = re.compile(r'\"(?:\\\\.|[^\"\\\\\\r\\n])*\"')"

if old not in source:
    raise SystemExit("Could not locate the v2 quoted-string matcher; refusing unsafe patch run")

safe_source = source.replace(old, new, 1)

# Preserve the normal command-line contract: argv[1] is the Crossroads source root.
sys.argv[0] = str(SCRIPT)
namespace = {
    "__name__": "__main__",
    "__file__": str(SCRIPT),
}
exec(compile(safe_source, str(SCRIPT), "exec"), namespace)
