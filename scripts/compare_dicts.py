#!/usr/bin/env python3
import unicodedata
from pathlib import Path

orig = Path('Name Search by Country - Sheet1.txt')
pub = Path('public/name-dictionary.txt')

def norm(s: str) -> str:
    s = s.strip()
    if not s:
        return ''
    s = s.lower()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    return s


def load_lines(path: Path):
    txt = path.read_text(encoding='utf-8')
    lines = [ln.strip() for ln in txt.splitlines()]
    lines = [ln for ln in lines if ln]
    return lines

orig_lines = load_lines(orig)
pub_lines = load_lines(pub)

orig_norm = [norm(l) for l in orig_lines]
pub_norm = [norm(l) for l in pub_lines]

orig_set = set(orig_norm)
pub_set = set(pub_norm)

only_in_orig = sorted(orig_set - pub_set)
only_in_pub = sorted(pub_set - orig_set)

print(f"original total non-empty lines: {len(orig_lines)}")
print(f"public total non-empty lines:   {len(pub_lines)}")
print(f"unique normalized in original:  {len(orig_set)}")
print(f"unique normalized in public:    {len(pub_set)}")
print(f"intersection size:             {len(orig_set & pub_set)}")
print()
print(f"names present in original but NOT in public: {len(only_in_orig)} sample: ")
for i, v in enumerate(only_in_orig[:50], 1):
    print(f"{i:3}. {v}")

print()
print(f"names present in public but NOT in original: {len(only_in_pub)} sample: ")
for i, v in enumerate(only_in_pub[:50], 1):
    print(f"{i:3}. {v}")

# Heuristic: some lines may contain multiple names on the same line (space separated).
# Find original lines that contain multiple space-separated tokens and are likely to be multi-column header rows.
multi_token_lines = [l for l in orig_lines if len(l.split()) > 1 and any(ch.isalpha() for ch in l)]
print() 
print(f"original lines containing multiple tokens (first 20): {len(multi_token_lines)}")
for l in multi_token_lines[:20]:
    print('-', l)

# Suggest splitting tokens from these lines into separate entries and check how many new names would be added
extra_tokens = set()
for l in multi_token_lines:
    for tok in l.split():
        t = norm(tok)
        if t:
            extra_tokens.add(t)

print()
print(f"unique tokens found in multi-token original lines: {len(extra_tokens)} sample: {sorted(list(extra_tokens))[:50]}")

# Save a cleaned merged dictionary suggestion
cleaned = sorted(pub_set | orig_set | extra_tokens)
out = Path('public/name-dictionary-cleaned-suggestion.txt')
out.write_text('\n'.join(cleaned), encoding='utf-8')
print('\nWrote suggestion file at public/name-dictionary-cleaned-suggestion.txt')
