# 🔍 oak-run check

::: info 🎯 Scope
SegmentStore (TarMK) • Oak 1.22.x – 2.4.0 ([version scope](/reference/oak-versions))  
**Not for AEMaaCS**
:::

The `check` command performs a consistency check on a SegmentStore (TarMK) repository. This is the **first command** you should run when corruption is suspected.

## 🔍 Signals That Lead Here

```
SegmentNotFoundException: Segment 0a1b2c3d-4e5f-6789-abcd-ef0123456789 not found
TarMK refuses to start after unclean shutdown
Unable to access revision 0a1b2c3d-4e5f-6789-abcd-ef0123456789:261920, rewinding...
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

| Option | Meaning |
|--------|---------|
| `--bin` | Also read binary properties (segment blobs only) |
| `--head` | Check only the head, no checkpoints |
| `--checkpoints [a,b,…]` | Check only these checkpoints (default `all`); without `--head`, head is then skipped |
| `--filter /p1,/p2` | Content paths to check (default `/` = the whole tree) |
| `--last [n]` | Check only the newest *n* journal revisions (`--last` alone = 1); default is no limit |
| `--journal <file>` | Use another journal file (default `<segmentstore>/journal.log`) |
| `--notify <sec>` | Print `Traversing …` progress every *sec* seconds (default: never) |
| `--io-stats` | Print segment-read I/O statistics at the end |
| `--mmap [true\|false]` | Memory-map tar files (default `true`) |
| `--fail-fast [true\|false]` | Stop at the first inconsistent revision; success then needs head **and** all checkpoints *(since Oak 1.66 — not in AEM 6.5; see [which LTS SP has which Oak](/reference/oak-versions))* |

Exit code: `0` if a good revision was found, `1` if not (or if the store cannot be opened).

## What Check Does

The consistency check answers a fundamental question: **"What is the most recent revision where the repository (root + checkpoints) is fully accessible?"**

### The Algorithm

1. **Iterates through journal.log entries** (newest to oldest)
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
- ❌ Nodes outside the `--filter` paths (default `/` = the whole head and checkpoint trees), or anything after the first error in each path
- ❌ Content-level corruption (only segment-level)

## Example Output

```
Checking revision 28c7e87c-1379-4ebb-94c7-0d0372b30a05:261920
...                      (per-revision "Checking …" / "Checked N nodes and M properties" lines)

Searched through 247 revisions and 1 checkpoints

Head
Latest good revision for path / is 28c7e87c-1379-4ebb-94c7-0d0372b30a05:261920 from Oct 3, 2025, 10:23:45 AM

Checkpoints
- 59e3b73e-9c3c-45e3-b6d9-156d7a6e5c52
  Latest good revision for path / is 28c7e87c-1379-4ebb-94c7-0d0372b30a05:261920 from Oct 3, 2025, 10:23:45 AM

Overall
Latest good revision for paths and checkpoints checked is 28c7e87c-1379-4ebb-94c7-0d0372b30a05:261920 from Oct 3, 2025, 10:23:45 AM
```

Revisions are journal record IDs (`<segment-uuid>:<offset>`); the timestamp format follows the JVM's default locale.

## 🚨 CRITICAL: "Bricked" vs "Recoverable" Distinction

**Not all "bricked" scenarios are equal.** Your recovery options depend entirely on whether the repository can even be opened.

::: info Why repositories end up here
How unaddressed corruption and normal GC delete the last intact copies, why no Oak tool can rebuild a lost segment, and how long you have to act: **[Why Repositories Get Bricked](/architecture/bricked)**.
:::

### Scenario A: Check RUNS but finds "No good revision found"

```bash
$ java -jar oak-run-*.jar check /path/to/segmentstore

...

Searched through 247 revisions and 3 checkpoints
No good revision found  # ← Check completed, but everything is corrupted (exit code 1)
```

**What this means:**
- ✅ Check command successfully opened the FileStore
- ✅ Tar files are readable
- ✅ Segments can be accessed
- ❌ Every revision in journal.log has corruption

A related case looks better than it is: the Overall line reads `Latest good revision for paths and checkpoints checked is none from unknown time` and `check` exits `0`. Head and checkpoints were never all good at the same revision. Read the Head and Checkpoints lines: if the head shows a revision and only a checkpoint shows `none`, see [Only a checkpoint is broken](/architecture/bricked#only-a-checkpoint-is-broken); if the head shows `none` too, this is Scenario A.

**Recovery options (STILL POSSIBLE):**
1. ✅ **Restore from backup** - BEST option if you have a recent, tested backup
2. ✅ **`oak-run recover-journal`** - Scans ALL segments in tar files to find valid roots
3. ✅ **`oak-upgrade` (sidegrade)** - Extracts accessible content

**Prognosis**: ⚠️ **PARTIALLY RECOVERABLE** - Restoration from backup is faster, safer, and more reliable. Without one, try `recover-journal` first, then the sidegrade.

### Scenario B: Check CAN'T EVEN RUN (Fatal)

```bash
$ java -jar oak-run-*.jar check /path/to/segmentstore

org.apache.jackrabbit.oak.segment.SegmentNotFoundException: Segment 0a1b2c3d-4e5f-6789-abcd-ef0123456789 not found
    at org.apache.jackrabbit.oak.segment.file.ReadOnlyFileStore.readSegment(...)
    ...
# Check failed before it could search the journal (stack trace on stderr, exit code 1)
```

**OR:**

```bash
$ java -jar oak-run-*.jar check /path/to/segmentstore

java.io.IOException: Failed to open tar file data00005a.tar.ro.bak
    at org.apache.jackrabbit.oak.segment.file.tar.TarReader.openRO(...)
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

::: tip One exception: a broken checkpoint list
With the default `--checkpoints all`, `check` lists the head's checkpoints before it starts. If that listing reads a missing segment, the stack trace runs through `SegmentNodeStore.checkpoints` and the store itself did open. `check --head` skips the listing and can still test the head.
:::

**Prognosis**: ❌ **UNRECOVERABLE** - Repository is truly bricked. Restore from backup immediately.

## Segment Graph Integrity: The ONLY Reliable Test

**TAR file timestamps are NOT a reliable indicator of repository health.** The determinant of recoverability is whether the segment graph is intact and traversable.

### The Definitive Test

```bash
# This is the ONLY test that matters:
java -jar oak-run-*.jar check /path/to/segmentstore

# Look for segment graph integrity:
✅ "Checked X nodes and Y properties"
✅ "Path / is consistent"
✅ "Latest good revision for paths and checkpoints checked is …"
→ Segment graph is INTACT → Repository is RECOVERABLE

# Fatal indicators:
❌ "SegmentNotFoundException: Segment X not found"
❌ "Error while traversing /path: …" / "Skipping invalid record id …"
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
| **Check itself fails** 💥 | Repository is "bricked" | Storage-level damage (store cannot be opened); restore from backup |

## Check vs. Count-Nodes: Different Tools, Different Jobs

::: warning ⚠️ Not in Apache Oak
`:count-nodes` and `:remove-nodes` are not part of Apache Jackrabbit Oak (any version). They come from a community fork. See [Fork-only console commands](/reference/oak-versions#fork-only-console-commands) for how to get a build that matches your Oak version.
:::

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
# Output: "Latest good revision for paths and checkpoints checked is abc123…:261920 from Oct 3, 2025, …"
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
> :remove-nodes count-nodes-snfe-YYYYMMDD-HHmmss.log dry-run
# → ALWAYS dry-run first to validate what will be deleted
> :remove-nodes count-nodes-snfe-YYYYMMDD-HHmmss.log
# → Only run actual removal after validating dry-run results
# → remove-nodes never deletes "Missing segment" lines; its report prints
#   the :remove-node <path> to run for each

# Scenario B: No good revision found ❌
# Output: "No good revision found"
# → Segment-level corruption throughout journal history
# → oak-upgrade sidegrade is your only hope (extracts what's accessible)
```

## Critical Warning: Check Before Compaction

**NEVER run compaction on a repository with undiagnosed corruption.** Here's why:

```
What actually happens (same in Oak 1.22 and 2.4):
1. Repository has missing segment XYZ (undiagnosed)
2. Compaction runs
3a. XYZ is reachable from head or a checkpoint:
    → SegmentNotFoundException → "TarMK GC #N: compaction encountered an error"
    → the run is aborted; old tar files stay (online cleanup removes only the half-written generation)
    → offline `compact` prints "Compaction cancelled after …" (exit 1), no cleanup, journal.log untouched
    → nothing fixed; time and disk spent; every later run fails the same way
3b. XYZ is reachable only from OLDER revisions:
    → compaction succeeds; cleanup deletes the older generations
      (online keeps 2 generations by default, offline keeps 1)
    → offline `compact` also rewrites journal.log to a single entry
    → the older revisions you could have rolled back to are gone
```

**Why compaction is dangerous with undiagnosed corruption:**
- Compaction does **not** skip unreadable content - an SNFE in head or a checkpoint aborts the run
- A **successful** compaction + cleanup deletes old generations, so you lose the ability to roll back past the compaction point
- Compaction never reads external DataStore binaries (it copies only their IDs), so missing DataStore blobs survive it unnoticed

## Time Estimates

| Repository Size | Approximate Time |
|-----------------|------------------|
| 10 GB | ~5 minutes |
| 50 GB | ~10 minutes |
| 100 GB | ~15 minutes |
| 500 GB | ~45 minutes |
| 1 TB | ~1.5-2 hours |
| 2 TB | ~3-4 hours |
| 3 TB+ | ~6-8 hours |

::: warning ⚠️ Time Estimates Scale With Repository Size
These times are **I/O bound** and scale with repository size. `check` stops at the newest revision where every checked path is consistent - on a healthy repository that is the first revision, but it still traverses the full `--filter` tree (default `/`) of head and every checkpoint. On a corrupted repository it keeps walking back through journal entries until it finds a good one (or runs out).

**Production reality**: On-premise AEM installations commonly have **500GB-2TB** segment stores. Even the diagnostic `check` command can take hours on large repositories.
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
