#!/usr/bin/env python3
"""
Dwell Drift Guard: Branch Synchronization Helper
Syncs all critical configuration, ignore rules, and community files from 'master'
into the current active branch.
"""

import subprocess
import sys

GUARDED_FILES = [
    ".gitignore",
    "LICENSE",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "CODE_OF_CONDUCT.md",
    ".github/workflows/build.yml",
    ".github/ISSUE_TEMPLATE/bug_report.md",
    ".github/ISSUE_TEMPLATE/feature_request.md",
    ".github/PULL_REQUEST_TEMPLATE.md",
]

def run(cmd):
    return subprocess.run(cmd, shell=True, text=True, capture_output=True)

def main():
    branch = run("git rev-parse --abbrev-ref HEAD").stdout.strip()
    if branch == "master":
        print("ℹ️ You are currently on 'master'. Master is the source of truth.")
        return 0

    print(f"🔄 Syncing critical config files from 'master' into '{branch}'...")
    cmd = f"git checkout master -- {' '.join(GUARDED_FILES)}"
    res = run(cmd)
    if res.returncode != 0:
        print(f"❌ Failed to sync: {res.stderr}")
        return 1

    status = run("git status --short").stdout.strip()
    if status:
        print("✅ Critical files synced and staged/modified:")
        print(status)
        print("\nTo commit the sync:")
        print("   git commit -m \"chore: sync configs and .gitignore from master\"")
    else:
        print(f"✨ '{branch}' is already 100% in sync with 'master'! Zero drift detected.")

    return 0

if __name__ == "__main__":
    sys.exit(main())
