#!/usr/bin/env sh
# Scans staged changes for secrets. CI runs gitleaks on every push regardless.
set -eu

if command -v gitleaks >/dev/null 2>&1; then
  exec gitleaks git --staged --redact --no-banner
fi

echo "WARNING: gitleaks not installed; local secret scan skipped (CI still enforces it)." >&2
echo "Install: https://github.com/gitleaks/gitleaks#installing" >&2
