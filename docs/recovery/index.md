# 🛠️ Recovery Operations

::: info 🎯 Scope
SegmentStore (TarMK) • Oak 1.22.x – 2.4.0 ([version scope](/reference/oak-versions))  
**Not for AEMaaCS**
:::

This section covers the various recovery options available when dealing with repository corruption.

## 🚨 Start Here: SNFE Playbook

If you're seeing `SegmentNotFoundException`, start with the **[SNFE Playbook](/recovery/snfe-playbook)** — it covers diagnosis, decision trees, and all recovery paths.

## Recovery Decision Tree

<OakFlowGraph flow="recovery-decision" :height="400" />

## Recovery Options Overview

| Option | Speed | Data Loss | Risk | Use When |
|--------|-------|-----------|------|----------|
| **Backup Restore** | ⚡ Fast | Depends on backup age | ✅ Lowest | Always preferred |
| **Journal Recovery** | ⚡ Fast | Recent changes | ✅ Low | Journal corrupted |
| **Surgical Removal** | 🐌 Slow | Corrupted paths only | ⚠️ Medium | Specific paths corrupted |
| **Sidegrade** | 🐌 Very Slow | Unknown | ⚠️ Medium | No good revision found |
| **Compaction** | 🐌 Slow | None | ❌ High | NEVER during corruption |

## Quick Reference

### 1. Backup Restore (Preferred)

```bash
# Stop AEM
# Replace repository with backup
cp -r /backup/repository /path/to/crx-quickstart/repository
# Start AEM
```

### 2. Journal Recovery

```bash
java -jar oak-run-*.jar recover-journal /path/to/segmentstore
```

### 3. Surgical Removal

::: warning ⚠️ Not in Apache Oak
`:count-nodes` and `:remove-nodes` are not part of Apache Jackrabbit Oak (any version). They come from a community fork. See [Fork-only console commands](/reference/oak-versions#fork-only-console-commands) for how to get a build that matches your Oak version.
:::

```bash
# Step 1: Identify corrupted paths
java -jar oak-run-*.jar console --read-write /path/to/segmentstore
> :count-nodes deep analysis

# Step 2: Review log file (written to the console's working directory)
cat count-nodes-snfe-*.log

# Step 3: Remove corrupted paths (dry-run first!)
> :remove-nodes count-nodes-snfe-YYYYMMDD-HHmmss.log dry-run
> :remove-nodes count-nodes-snfe-YYYYMMDD-HHmmss.log
> :exit
```

`:remove-nodes` deletes only for missing-blob lines. `Missing segment` lines are logged, never deleted: remove those paths one by one with `:remove-node <path>`. See [Surgical Removal](/recovery/surgical).

### 4. Sidegrade (Last Resort)

```bash
# oak-upgrade release matching your oak-core; paths are repository dirs (each containing segmentstore/)
java -jar oak-upgrade-<oak-version>.jar \
    --exclude-paths=/path/that/check/flagged \
    /path/to/corrupted/crx-quickstart/repository /path/to/new/repository
```

Stops at the first unreadable node, so exclude known-corrupt paths. Copies blob references only; see [Sidegrade](/recovery/sidegrade) to move binaries.

## Detailed Guides

- [🚨 SNFE Playbook](/recovery/snfe-playbook) - Start here for SegmentNotFoundException
- [oak-run check](/recovery/check) - Diagnostic command
- [Journal Recovery](/recovery/journal) - Rebuild journal.log
- [Surgical Removal](/recovery/surgical) - Remove corrupted paths
- [Compaction](/recovery/compaction) - When and how to compact
- [Sidegrade](/recovery/sidegrade) - Extract accessible content
- [Pre-Text Extraction](/recovery/pre-text-extraction) - Speed up re-indexing after recovery

::: info 📅 Last Updated
Content last reviewed: October 2026 • Verified against Oak 1.22.24 (AEM 6.5) and Oak 2.4.0 (AEM 6.5 LTS SP3)
:::