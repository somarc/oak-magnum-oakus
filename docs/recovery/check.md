# 🔍 oak-run check

::: info 🎯 Scope
SegmentStore (TarMK) • Oak 1.22+  
**Not for AEMaaCS**
:::

The `check` command performs a consistency check on a SegmentStore (TarMK) repository. This is the **first command** you should run when corruption is suspected.

## 🔍 Signals That Lead Here

```
SegmentNotFoundException: Segment 0a1b2c3d-4e5f-6789-abcd-ef0123456789 not found
TarMK refuses to start after unclean shutdown
IllegalStateException: Segment xyz not found in tar file
Repository won't open after disk full event
```

## ✅ Do / ❌ Don't

| ✅ DO | ❌ DON'T |
|-------|----------|
| Run `check` as first diagnostic step | Run `compact` before `check` |
| Stop AEM before running `check` | Run `check` while AEM is running |
| Save the output (redirect to file) | Ignore "no good revision" results |
| Use `--bin` flag for thorough check | Assume "check passed" means no issues |

## Basic Usage

```bash
$ java -jar oak-run-*.jar check [options] /path/to/segmentstore
```

## What Check Does

The consistency check answers a fundamental question: **"What is the most recent revision where the repository (root + checkpoints) is fully accessible?"**

### The Algorithm

1. **Iterates through journal.log entries** (newest to oldest by default)
2. **Sets the FileStore to each revision** in sequence
3. **Tests accessibility** by attempting to:
   - Deserialize the root node state
   - Read all property values
   - Traverse to all child nodes (for specified paths)
   - Read binary streams (if `--bin` flag is used, **segment blobs only**)
4. **Records the last revision** where both head AND checkpoints are fully accessible
5. **Stops early** if all requested paths are found to be consistent

### What "Consistent" Means

A revision is considered consistent if the check can:
- ✅ Deserialize all node states at the specified paths
- ✅ Read all property values without exceptions
- ✅ Recursively traverse all child nodes
- ✅ Read all segment blob streams (if `--bin` is specified)
- ✅ Access all specified checkpoints

### What It Catches

- `SegmentNotFoundException` - Missing tar segments
- `IllegalArgumentException` - Malformed segment references
- `RuntimeException` - General corruption during traversal
- `IOException` - Binary stream reading failures (segment blobs only)

### What It Does NOT Test

- ❌ DataStore blob accessibility (see `isExternal()` check in code)
- ❌ Every single node in the repository (only specified paths + root)
- ❌ Content-level corruption (only segment-level)

## Example Output

```
Searching through revisions...
Searched through 247 revisions and 3 checkpoints

Head
Latest good revision for path / is 28c7e87c-1379-4ebb-94c7-0d0372b30a05 from 2025-10-03 10:23:45

Checkpoints
- 59e3b73e-9c3c-45e3-b6d9-156d7a6e5c52
  Latest good revision for path / is 28c7e87c-1379-4ebb-94c7-0d0372b30a05 from 2025-10-03 10:23:45

Overall
Latest good revision for paths and checkpoints checked is 28c7e87c-1379-4ebb-94c7-0d0372b30a05 from 2025-10-03 10:23:45
```

## 🚨 CRITICAL: "Bricked" vs "Recoverable" Distinction

**Not all "bricked" scenarios are equal.** Your recovery options depend entirely on whether the repository can even be opened.

### Scenario A: Check RUNS but finds "No good revision found"

```bash
$ java -jar oak-run-*.jar check /path/to/segmentstore

Searching through revisions...
Searched through 247 revisions and 3 checkpoints

Head
Latest good revision for path / is none from unknown time

Overall
No good revision found  # ← Check completed, but everything is corrupted
```

**What this means:**
- ✅ Check command successfully opened the FileStore
- ✅ Tar files are readable
- ✅ Segments can be accessed
- ✅ **Repository structure is intact**
- ❌ Every revision in journal.log has corruption

**Recovery options (STILL POSSIBLE):**
1. ✅ **Restore from backup** - BEST option if you have a recent, tested backup
2. ✅ **`oak-run recover-journal`** - Scans ALL segments in tar files to find valid roots
3. ✅ **`oak-upgrade` (sidegrade)** - Extracts accessible content

**Prognosis**: ⚠️ **RECOVERABLE** - But restoration from backup is faster, safer, and more reliable.

### Scenario B: Check CAN'T EVEN RUN (Fatal)

```bash
$ java -jar oak-run-*.jar check /path/to/segmentstore

Exception in thread "main" org.apache.jackrabbit.oak.segment.SegmentNotFoundException: 
Segment abc123def456 not found
    at org.apache.jackrabbit.oak.segment.file.FileStore.readSegment(FileStore.java:513)
    at org.apache.jackrabbit.oak.segment.file.FileStore.<init>(FileStore.java:169)
    ...
# Check failed to even initialize the FileStore
```

**OR:**

```bash
$ java -jar oak-run-*.jar check /path/to/segmentstore

java.io.IOException: Failed to open tar file data00005a.tar
    at org.apache.jackrabbit.oak.segment.file.tar.TarReader.open(TarReader.java:111)
    ...
# Critical tar files are corrupted or missing
```

**What this means:**
- ❌ Check command cannot initialize the FileStore
- ❌ Critical segments needed just to OPEN the repository are missing
- ❌ OR tar files themselves are corrupted/unreadable
- ❌ **Repository structure is broken at the storage level**

**Recovery options (NONE):**
- ❌ **NO** `oak-run recover-journal` (can't open the store to scan it)
- ❌ **NO** `oak-upgrade` (can't initialize source repository)
- ❌ **NO** magical Oak tools (everything needs FileStore to open)
- ✅ **ONLY** restore from backup

**Prognosis**: ❌ **UNRECOVERABLE** - Repository is truly bricked. Restore from backup immediately.

## Segment Graph Integrity: The ONLY Reliable Test

**TAR file timestamps are NOT a reliable indicator of repository health.** The determinant of recoverability is whether the segment graph is intact and traversable.

### The Definitive Test

```bash
# This is the ONLY test that matters:
java -jar oak-run-*.jar check /path/to/segmentstore

# Look for segment graph integrity:
✅ "Searched through X revisions and Y checkpoints"
✅ "Checked X nodes and Y properties"
✅ "No errors found"
→ Segment graph is INTACT → Repository is RECOVERABLE

# Fatal indicators:
❌ "SegmentNotFoundException: Segment X not found"
❌ "Revision X not found"
❌ Cannot traverse segment graph
→ Segment references are BROKEN → Repository is BRICKED
```

### Why TAR Timestamps Don't Matter

TAR files can have uniform timestamps for many legitimate reasons:
- ✅ **Normal compaction**: Rewrites multiple TAR files in a short window
- ✅ **Successful cleanup**: Old segments cleaned up, active segments clustered
- ✅ **Backup restore**: All files restored with same timestamp
- ✅ **Storage migration**: Files copied/moved together

**Real-World Case Study:**
- 44 TAR files with timestamps within 5-minute window
- All data files appeared to have "uniform" timestamps
- **BUT**: `oak-run check` passed cleanly ✅
- **Result**: Repository fully operational ✅

**The uniform timestamps were irrelevant. What mattered was segment graph integrity.**

### When Repository is ACTUALLY Bricked

A repository is only truly unrecoverable when:
1. ❌ `oak-run check` fails with `SegmentNotFoundException`
2. ❌ Segment references point to segments that don't exist
3. ❌ The segment graph cannot be traversed
4. ❌ No good revision exists that can be reached

**This happens when:**
- Physical segment data is deleted/corrupted (file corruption, disk failure)
- Compaction ran over corrupted segments AND removed the only good copies
- TAR files are present but contain invalid segment data
- Manifest references segments that were never written

## Recovery Decision Matrix

| Check Result | Interpretation | Recovery Strategy |
|--------------|----------------|-------------------|
| **Good revision found** ✅ | Repo is recoverable | **Option A**: Journal rollback (fast, loses recent changes)<br>**Option B**: Surgical removal with `count-nodes` + `remove-nodes` (slower, preserves more) |
| **No good revision found** ❌ | Segment-level corruption | **Last resort**: `oak-upgrade` sidegrade to extract what you can |
| **Check itself fails** 💥 | Repository is "bricked" | Likely caused by compaction over undiagnosed corruption; restore from backup |

## Check vs. Count-Nodes: Different Tools, Different Jobs

| Aspect | `oak-run check` | `:count-nodes` |
|--------|-----------------|----------------|
| **Purpose** | Find last good **revision** | Find all **corrupted paths** |
| **Strategy** | **Stop at first corruption** per path | **Continue through all corruption** |
| **Coverage** | Tests root + checkpoints + filters | **Full tree traversal** |
| **Output** | **Revision ID** + timestamp | **List of corrupt paths** |
| **Use Case** | "Can I rollback?" | "What do I need to remove?" |
| **Binaries** | Segment blobs only (`!isExternal`) | **All blobs** (configurable) |
| **Speed** | ⚡ Fast (targeted, stops early) | 🐌 Slower (comprehensive) |
| **Recovery** | **Time-machine** (rollback) | **Surgical** (remove nodes) |

## Common Workflow: Check → Recover

```bash
# Step 1: Check if repo is recoverable
$ java -jar oak-run-*.jar check /path/to/segmentstore

# Scenario A: Good revision found ✅
# Output: "Latest good revision for paths and checkpoints checked is abc123 from 2025-10-03"
# → Repo is recoverable!

## Option A1: Rollback approach (fastest, safest, loses recent changes)
$ java -jar oak-run-*.jar recover-journal /path/to/segmentstore

## Option A2: Surgical approach (slower, preserves more, keeps recent changes)
$ java -jar oak-run-*.jar console --read-write /path/to/segmentstore
> :count-nodes deep analysis
# → Identifies ALL corrupted paths (segments + blobs)
# → CRITICAL: Review the log file output BEFORE proceeding!
# → Check for critical paths (/oak:index/uuid, /jcr:system, /rep:security)
# → If critical paths are corrupted, surgical removal will NOT work
> :remove-nodes /tmp/count-nodes-snfe-*.log dry-run
# → ALWAYS dry-run first to validate what will be deleted
> :remove-nodes /tmp/count-nodes-snfe-*.log
# → Only run actual removal after validating dry-run results

# Scenario B: No good revision found ❌
# Output: "No good revision found"
# → Segment-level corruption throughout journal history
# → oak-upgrade sidegrade is your only hope (extracts what's accessible)
```

## Critical Warning: Check Before Compaction

**NEVER run compaction on a repository with undiagnosed corruption.** Here's why:

```
Timeline of Death:
1. Repository has missing segment XYZ (undiagnosed)
2. Compaction runs
3. Compaction rewrites segments, creating new references
4. Compaction cleanup deletes old tar files
5. Old references to segment XYZ are now lost
6. Even journal rollback can't help - the old segments are gone
7. Repository is "bricked" - can't access head, can't roll back
```

**Why compaction is dangerous with undiagnosed corruption:**
- Compaction **rewrites the segment graph** by copying reachable segments
- If you compact over a missing segment, you **bake the corruption in**
- Old tar files (which might have alternate paths around corruption) are **deleted**
- You lose the ability to roll back past the compaction point

## Time Estimates

| Repository Size | Approximate Time |
|-----------------|------------------|
| 10 GB | ~5 minutes |
| 50 GB | ~10 minutes |
| 100 GB | ~15 minutes |
| 500 GB | ~45 minutes |
| 1 TB+ | ~2 hours |

::: warning ⚠️ Time Estimates Scale
These times are **I/O bound** and scale with repository size. Check is faster than most operations because it stops early when corruption is found.
:::

## Key Takeaways

::: tip Remember
1. **Check is your recovery gatekeeper** - If check finds a good revision, you can recover
2. **Check stops early** - Optimized to find the most recent good revision
3. **Segment blobs only** - Check with `--bin` only tests segment blobs, not DataStore
4. **"Bricked" has two meanings** - Check can't run (truly bricked) vs no good revision (recoverable)
5. **Segment graph integrity is the ONLY test** - TAR timestamps don't matter
6. **Prevention is everything** - Run `check` regularly, especially before compaction
:::
