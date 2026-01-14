# 🛠️ Recovery Operations

::: info 🎯 Scope
SegmentStore (TarMK) • Oak 1.22+  
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

```bash
# Step 1: Identify corrupted paths
java -jar oak-run-*.jar console --read-write /path/to/segmentstore
> :count-nodes deep analysis

# Step 2: Review log file
cat /tmp/count-nodes-snfe-*.log

# Step 3: Remove corrupted paths (dry-run first!)
> :remove-nodes /tmp/count-nodes-snfe-*.log dry-run
> :remove-nodes /tmp/count-nodes-snfe-*.log
> :exit
```

### 4. Sidegrade (Last Resort)

```bash
java -jar oak-upgrade-*.jar upgrade --copy-binaries \
    /path/to/corrupted /path/to/new-repo
```

## Detailed Guides

- [🚨 SNFE Playbook](/recovery/snfe-playbook) - Start here for SegmentNotFoundException
- [oak-run check](/recovery/check) - Diagnostic command
- [Journal Recovery](/recovery/journal) - Rebuild journal.log
- [Surgical Removal](/recovery/surgical) - Remove corrupted paths
- [Compaction](/recovery/compaction) - When and how to compact
- [Sidegrade](/recovery/sidegrade) - Extract accessible content
- [Pre-Text Extraction](/recovery/pre-text-extraction) - Speed up re-indexing after recovery

## 🔀 When to Hand Off

Not all "Oak problems" are actually Oak problems. Know when to escalate:

| Symptom | Likely Owner | Why |
|---------|--------------|-----|
| SNFE during indexing | **Indexing team** | May be Lucene index corruption, not segment |
| SNFE on author with MongoDB | **Author persistence** | DocumentNodeStore has different recovery |
| Missing blobs after migration | **Migration team** | Source data or migration tool issue |
| Namespace modification errors | **Author persistence** | DocStore concern, not segment persistence |
| OakState0001 conflicts | **Replication team** | Content conflict, not corruption |

::: info 📅 Last Updated
Content last reviewed: January 2026 • Oak 1.22.x / AEM 6.5.x (also applicable to AEM 6.5 LTS)
:::