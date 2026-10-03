# 📋 Understanding Checkpoints

::: info 🎯 Scope
SegmentStore (TarMK) • Oak 1.22.x – 2.4.0 ([version scope](/reference/oak-versions))  
**Not for AEMaaCS**
:::

A **checkpoint** in Oak is a snapshot of the repository state at a specific point in time. Checkpoints are critical for async indexing, backup operations, and maintenance tasks.

## 🔍 Signals That Lead Here

```
Disk usage growing despite compaction running
"Failed to retrieve previously indexed checkpoint" in error.log
Dozens of checkpoints in oak-run checkpoints list
async-temp array keeps growing (more than 2 entries)
Indexing stuck for weeks/months (ConsecutiveFailedExecutions high)
```

## What is a Checkpoint?

- A snapshot of the entire repository at a specific revision
- Stored as a segment reference in the FileStore
- **Prevents garbage collection** from reclaiming content reachable from that checkpoint (compaction copies it forward)
- Created by async indexers, backup tools, or manually

## Checkpoint Architecture

Oak Segment Store has **TWO parallel root nodes**:

```
Segment Store Root (/)
├─ /root                          ← JCR repository tree (what users see)
│   ├─ content/
│   ├─ apps/
│   ├─ etc/
│   ├─ :async/                    ← Indexer bookmarks (hidden node inside /root)
│   │   ├─ async = "checkpoint-uuid-1"
│   │   ├─ fulltext-async = "checkpoint-uuid-2"
│   │   └─ ... (STRING properties)
│   └─ ... (normal JCR tree)
│
└─ /checkpoints                   ← Checkpoint storage (OUTSIDE JCR!)
    ├─ checkpoint-uuid-1/         ← created, timestamp (expiry), properties/, root/ (snapshot of /root)
    ├─ checkpoint-uuid-2/
    └─ ... (internal Oak metadata)
```

::: tip Key Understanding
- **Checkpoints exist OUTSIDE the JCR tree** - parallel to `/root`, not inside it
- **`/:async` properties are just string pointers** - references to checkpoint UUIDs
- **The actual checkpoint data lives in `/checkpoints`** - contains revision references
- **Checkpoint size indicates age** - large size = old checkpoint pinning many segments
:::

### Why This Separation Matters

```
1. /root - User-facing JCR tree
   ├─ Contains: All JCR content
   ├─ Accessible: Via JCR API (CRXDE, JCR queries)
   ├─ Versioned: Part of repository revisions
   └─ Purpose: Repository content

2. /checkpoints - Internal Oak metadata
   ├─ Contains: Checkpoint metadata + revision references
   ├─ Accessible: Only via NodeStore API (oak-run tools)
   ├─ Same head revision: sibling of /root in the head record, but never part of the /root content
   ├─ NOT visible: In CRXDE or JCR queries
   └─ Purpose: Pin specific revisions for GC protection

Benefits:
✅ Checkpoints don't clutter JCR namespace
✅ Checkpoints managed independently from content
✅ Checkpoint operations don't create new JCR revisions
✅ GC can iterate checkpoints without traversing entire JCR tree
✅ Low-level operations isolated from user content
```

### The Link Between `/:async` and `/checkpoints`

```
/:async@async = "b8dbd53c-af46-4764-bd3b-df48d4a85438"
         ↓ (JCR property references checkpoint by UUID)
/checkpoints/b8dbd53c-af46-4764-bd3b-df48d4a85438/
         ↓ (checkpoint node contains revision reference)
Record: d2afc549-c5a2-4475-a2d1-7257dabba2fd.00000007
         ↓ (revision points to specific segment)
Segment in data00006a.tar
         ↓ (segment contains repository state)
Repository state at checkpoint creation time
```

## The `/:async` Node Structure

The `/:async` node (visible in oak-run explore) shows indexer state:

```
/root/:async (670 bytes)
├─ async = {STRING} "b8dbd53c-af46-4764-bd3b-df48d4a85438"
│  └─ Current checkpoint UUID for "async" indexing lane
│
├─ async-LastIndexedTo = {DATE} 2025-07-04T15:03:52.256-04:00
│  └─ Timestamp when "async" lane last completed successfully
│
├─ async-temp = {STRINGS} (count 2) ["uuid1", "uuid2"]
│  └─ Temporary checkpoints created during indexing cycles
│     1-2 UUIDs = healthy (current reference + previous or in-flight one)
│     Growing list = Oak keeps failing to release these checkpoints
│
├─ fulltext-async = {STRING} "5be6e6eb-8875-405f-b157-a869080cb859"
│  └─ Current checkpoint UUID for "fulltext-async" lane
│
├─ fulltext-async-LastIndexedTo = {DATE} 2025-07-04T15:03:52.256-04:00
│  └─ Timestamp when "fulltext-async" lane last completed
│
└─ fulltext-async-temp = {STRINGS} (count 13) [...]
   └─ 13 entries = checkpoints Oak repeatedly failed to release!
      This is the DEATH LOOP signature
```

### Death Loop Detection

::: danger 🔥 Death Loop Signature
If you see `async-temp` or `fulltext-async-temp` with **more than 2 UUIDs**, you have a death loop:

```
fulltext-async-temp = {STRINGS} (count 13) [
  "uuid1", "uuid2", "uuid3", "uuid4", "uuid5",
  "uuid6", "uuid7", "uuid8", "uuid9", "uuid10",
  "uuid11", "uuid12", "uuid13"
]
```

**What this means:**
- Every run adds its new checkpoint to `-temp` and tries to release all other entries except the lane's reference checkpoint
- An entry stays only when `release()` returned `false`, so the checkpoint still exists
- The lane's periodic orphan cleanup keeps every `-temp` entry and is skipped while the lane is failing
- Each leftover checkpoint keeps its content alive through compaction, so disk bloat grows

A failed run on its own does **not** leak a checkpoint: `AsyncIndexUpdate` releases the checkpoint it just created in its `finally` block.
:::

## How Checkpoints Pin Segments

<OakFlowGraph flow="checkpoint-pin" :height="500" />

### The Pinning Problem

Revision GC copies every checkpoint forward together with HEAD, so a checkpoint's content **cannot be reclaimed** while the checkpoint exists:

```
Revision GC (compaction + cleanup), Oak 1.22 and 2.4:

1. Compaction:
   ├─ Rewrites ALL checkpoints, then HEAD (/root), into a new GC generation
   ├─ Checkpoints are compacted on top of each other, so shared content is deduplicated
   └─ Content that only a checkpoint references is copied forward too

2. Cleanup:
   ├─ Data segments from generations older than the retained ones (default 2) are reclaimed
   ├─ Bulk (binary) segments are reclaimed only when unreferenced
   └─ For each tar file:
       ├─ Nothing left → tar file is removed
       ├─ >25% reclaimable → rewritten as next generation (data00001a.tar → data00001b.tar)
       └─ ≤25% reclaimable → kept as is
```

### Orphaned Checkpoints = Disk Bloat

```
Example: 3 Orphaned Checkpoints Prevent Cleanup

Day 1:  Checkpoint cp1 → references segment in data00001a.tar
Day 10: Checkpoint cp2 → references segment in data00002a.tar  
Day 20: Checkpoint cp3 → references segment in data00003a.tar
Day 30: Checkpoint cp4 → ACTIVE (indexer using this)
Day 40: Compaction runs

Compaction + Cleanup:
1. HEAD → compacted into the new generation
2. cp4 (active) → compacted (mostly shared with HEAD)
3. cp3 (orphaned) → its Day-20 content is copied forward ← KEPT
4. cp2 (orphaned) → its Day-10 content is copied forward ← KEPT
5. cp1 (orphaned) → its Day-1 content is copied forward ← KEPT

Result: old content (potentially gigabytes) that should have been reclaimed survives every compaction
```

## Managing Checkpoints

### List Checkpoints

```bash
java -jar oak-run-*.jar checkpoints /path/to/segmentstore list
```

### Remove Unreferenced Checkpoints

```bash
java -jar oak-run-*.jar checkpoints /path/to/segmentstore rm-unreferenced
```

**What this does:**
1. Scans `/checkpoints` for all repository checkpoints
2. Keeps every checkpoint referenced by a `/:async` STRING property whose name ends in `async` (e.g. `async`, `fulltext-async`), printing `Referenced checkpoint from /:async@<name> is <id>`
3. **Removes all other checkpoints**, including those listed only in `*-temp` arrays, and prints `Removed N checkpoints in Xms.`
4. The next compaction no longer copies their content forward

**Why this is safe:**
- The async indexer **actively references** the checkpoint it needs
- All other checkpoints are orphaned (no property references them)
- Removing them unpins segments → allows cleanup to reclaim space

### When to Use `rm-unreferenced`

✅ **Safe to use:**
- Disk space is running low
- Many old checkpoints exist (dozens in list)
- Normal operations (not mid-recovery)
- Regular maintenance after compaction

⚠️ **Do NOT use:**
- Mid-recovery (you might need older checkpoints)
- Corruption detected but not analyzed
- Right after backup (backup tools create checkpoints)
- Custom checkpoint usage for testing

## Checkpoint Commands Reference

| Command | Description |
|---------|-------------|
| `list` | Show all checkpoints (`- <id> created <time> expires <time>`) |
| `rm-all` | ⚠️ DANGEROUS - Removes ALL checkpoints |
| `rm-unreferenced` | Safe - Removes only orphaned checkpoints |
| `rm <checkpoint>` | Remove specific checkpoint by UUID |
| `info <checkpoint>` | Show metadata for specific checkpoint |
| `set <checkpoint> <name> [<value>]` | Set/remove metadata property |

::: danger ⚠️ NEVER Use `rm-all`
Deleting all checkpoints removes the ones referenced by the async lanes (`/:async@async`, `/:async@fulltext-async`). This causes:
- On the next run, each lane logs `[async] Failed to retrieve previously indexed checkpoint <id>; re-running the initial index update`
- Each lane then traverses the whole repository again (initial index update), which can take hours to days
:::

## Disk Space Impact

**Real-world example:**

```
Before rm-unreferenced:
- 50 orphaned checkpoints (accumulated over 6 months)
- Each checkpoint pins ~200MB of old tar files
- Total disk bloat: ~10GB of tar files that can't be deleted

After rm-unreferenced + next cleanup:
- 1 active checkpoint (indexer's current reference)
- Old tar files no longer pinned
- Disk reclaimed: ~10GB freed
```

## Bottom Line - Checkpoints

- **Checkpoints exist OUTSIDE the JCR tree** - parallel to `/root`, not inside it
- **`/:async` properties are just string pointers** - references to checkpoint UUIDs
- **The actual checkpoint data lives in `/checkpoints`** - contains revision references
- **Checkpoint size indicates age** - large size = old checkpoint pinning many segments
- **Temp checkpoint accumulation = failed releases** - visible in `async-temp` arrays
- **Removing `/:async` properties deletes only the pointers, not the checkpoints** - but a lane with no `/:async@<lane>` value re-runs its initial index update (full traversal)
- **Use oak-run explore to see checkpoints** - not visible in CRXDE or JCR API
