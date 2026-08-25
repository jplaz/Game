#!/usr/bin/env python3
"""Run the v2 Westeros presentation patch without touching engine syntax.

The original presentation pass had two hazards:
1. Its quoted-string matcher could cross physical source lines.
2. It could rewrite GBA control tokens embedded inside dialogue, such as
   {MUS_RG_ENCOUNTER_GYM_LEADER}.

This wrapper fixes both behaviors in memory before executing the maintained v2
patch. Visible player text is converted; identifiers/control codes stay intact.
"""
from pathlib import Path
import sys

SCRIPT = Path(__file__).with_name("apply_westeros_v2.py")
source = SCRIPT.read_text(encoding="utf-8")

old_matcher = "string_re = re.compile(r'\"(?:\\\\.|[^\"\\\\])*\"')"
new_matcher = "string_re = re.compile(r'\"(?:\\\\.|[^\"\\\\\\r\\n])*\"')"
if old_matcher not in source:
    raise SystemExit("Could not locate the v2 quoted-string matcher; refusing unsafe patch run")
source = source.replace(old_matcher, new_matcher, 1)

old_loop = """        for old, new in replacements:\n            new_inner = new_inner.replace(old, new)\n"""
new_loop = """        # GBA dialogue embeds engine commands in braces. Never rewrite those.\n        parts = re.split(r'(\\{[^{}]*\\})', new_inner)\n        for index in range(0, len(parts), 2):\n            for old, new in replacements:\n                parts[index] = parts[index].replace(old, new)\n        new_inner = ''.join(parts)\n"""
if old_loop not in source:
    raise SystemExit("Could not locate the v2 replacement loop; refusing unsafe patch run")
source = source.replace(old_loop, new_loop, 1)

# Preserve the normal command-line contract: argv[1] is the Crossroads source root.
sys.argv[0] = str(SCRIPT)
namespace = {
    "__name__": "__main__",
    "__file__": str(SCRIPT),
}
exec(compile(source, str(SCRIPT), "exec"), namespace)
