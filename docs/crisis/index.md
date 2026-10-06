# 🚨 Crisis Checklist

::: danger 🎯 SCOPE
Requires filesystem access to run `oak-run` commands.  
**Not for AEMaaCS**  
Use the oak-run release matching your repository's Oak version: `oak-run-1.22.x.jar` for AEM 6.5; for AEM 6.5 LTS the oak-run equal to your oak-core version (`oak-run-2.4.0.jar` on SP3, Java 17+) — see [which LTS SP has which Oak](/reference/oak-versions).
:::

**PRINT THIS - LAMINATE IT - TAPE IT TO YOUR MONITOR**

Follow the boxes in order. Check them off as you go. **DO NOT SKIP BOXES.**

## 🔍 Common Signals That Brought You Here

| Signal | Likely Cause | Jump To |
|--------|--------------|---------|
| `SegmentNotFoundException: Segment xyz not found` | Segment corruption or a missing TAR file. Only a log line ending in a GC tag (`…ms,[pre-compaction cleanup]`) is the rare [reader that outlived its GC cycle](/recovery/snfe-playbook#scenario-3-a-reader-outlived-its-gc-cycle-rare) | [Step 0](#🛑-step-0-stop-the-bleeding) |
| `compaction encountered an error` in a GC run | Compaction read a missing segment. That run's cleanup had already deleted older generations | [Step 0](#🛑-step-0-stop-the-bleeding) |
| TarMK refuses to start | Journal or TAR corruption | [Step 3](#✅-step-3-run-diagnostic-command) |
| `Unable to access revision …, rewinding...` (WARN) | Journal entries point at missing segments; Oak falls back to an older revision, so recent changes look lost | [Step 0](#🛑-step-0-stop-the-bleeding) |
| `IllegalStateException: … is in use by another store.`, or startup hangs | Store already open in the same JVM, or another process holds `repo.lock` (find it with `lsof`; don't delete the lock) | [Repository Won't Start](/reference/troubleshooting#repository-won-t-start) |
| `OutOfMemoryError` during startup | Heap too small for repo size | Not corruption — increase heap |
| Disk 100% full | Free space first: a full disk can stop the repository opening. Don't compact to make room; compaction itself needs 2× the store size | [Step 3](#✅-step-3-run-diagnostic-command) |
| Disk keeps growing; compaction doesn't reclaim space | Orphaned checkpoints pinning old segments | [Checkpoint Disk Bloat](/checkpoints/disk-bloat) |
| `DataStoreException: Record does not exist` | Missing blob in DataStore | [DataStore Consistency](/datastore/consistency) |

::: warning ⏱️ TIME WARNING
All time estimates assume you know what you're doing. If you're uncertain, stressed, or reading this for the first time during an incident: **multiply all times by 3-5x**. When in doubt, restore from backup.

**Know your repository size FIRST** - it determines everything:
```bash
du -sh crx-quickstart/repository/segmentstore/
```

| Repository Size | Recovery Reality |
|-----------------|------------------|
| < 100GB | Hours - single shift |
| 100-500GB | Half-day to full day |
| 500GB-1TB | Multi-day (12-48 hours) |
| 1-2TB | Multi-day (24-96 hours) |
| 2TB+ | Week-scale operations |

On-premise AEM installations commonly have **500GB-2TB** segment stores.
:::

## 🛑 Step 0: Stop the Bleeding

```
[ ] Stop AEM (crx-quickstart/bin/stop)
    → Must it keep running for now? Pause GC first:
      JMX → SegmentRevisionGarbageCollection → PausedCompaction = true
      (and cancelRevisionGC if a run is in progress)
[ ] Don't start AEM on the damaged store until a step below says so
[ ] Don't delete anything: not TAR files, not journal.log, not the store
```

Every GC run deletes older generations *before* it compacts, and those are the copies recovery needs. Starting AEM on a damaged store can silently rewind it, or even write a new, empty repository over it ([why](/architecture/bricked)).

---

## ✅ Step 1: Do You Have a Backup?

```
[ ] YES, and it's RECENT (< 24 hours old) and TESTED
    → RESTORE IT NOW. Stop reading. You're done.
    → Move the damaged segmentstore/ aside instead of deleting it:
      you'll want it to find out what happened
    
[ ] YES, but it's OLD (days/weeks/months old)
    → Business won't accept the data loss?
       → Continue to Step 2 (Advanced Recovery)
       → WARNING: You're trading CERTAIN recovery for UNCERTAIN recovery
    
[ ] NO backup exists
    → Continue to Step 2 (you have no choice)
    → Prepare for potential total data loss
    
[ ] DON'T KNOW if backup exists
    → Find out. Call your manager. This is their problem now.
```

::: tip 💡 REALITY CHECK
If your backup is 2 weeks old and business says "we can't lose 2 weeks of work," understand that:
- Advanced recovery might lose MORE than 2 weeks
- Advanced recovery might FAIL completely
- The "we can't lose data" pressure leads to making corruption WORSE
:::

---

## ✅ Step 2: Identify Your Repository Type

**Look in your filesystem:**

```
[ ] I see: crx-quickstart/repository/segmentstore/
    → You have SegmentStore (TarMK)
    → Use commands: check, recover-journal, console
    → NEVER use: compact (unless explicitly instructed)
    
[ ] I see: a MongoDB or database connection in the
    DocumentNodeStoreService OSGi config
    → You have DocumentNodeStore (MongoMK/RDB)
    → Out of scope for this guide: check and recover-journal
      are SegmentStore-only; DocumentNodeStore uses oak-run recovery
    → NEVER use: compact (SegmentStore only)
    
[ ] I DON'T KNOW WHAT I'M LOOKING AT
    → Stop. Get someone who knows Oak. Seriously.
```

**Quick identification:**

```bash
# If this directory exists → SegmentStore (TarMK)
ls crx-quickstart/repository/segmentstore/

# If this file exists → DocumentNodeStore (MongoMK/RDB)
ls crx-quickstart/install/*DocumentNodeStoreService*.config
```

---

## ✅ Step 3: Run Diagnostic Command

**FOR SEGMENTSTORE (most common):**

```
[ ] AEM is stopped (crx-quickstart/bin/stop)
[ ] oak-run release matches your oak-core (see the scope box at the top)
[ ] Output is saved to a file - the paths it flags matter later
```

```bash
java -jar oak-run-*.jar check /path/to/segmentstore 2>&1 | tee check.log
```

**Check the output:**

```
[ ] Output says: "Latest good revision for paths and
    checkpoints checked is <revision> from <date>"
    → GOOD! Repository is recoverable.
    → Continue to Step 4

[ ] Output says: "No good revision found"
    → BAD! Repository is severely corrupted.
    → Jump to Step 5 (Last Resort)

[ ] Output says: "... checked is none from unknown time"
    → Exit code 0, but NOT a good result
    → Read the Head and Checkpoints lines above it
    → Head shows a revision, only a checkpoint shows none?
      Content is intact: see the link below this box
    → Head shows none too? Jump to Step 5 (Last Resort)

[ ] Command FAILS: a stack trace instead of a result
    ("SegmentNotFoundException", "Failed to open tar file …" or
     "Cannot start readonly store from empty journal")
    → Trace runs through SegmentNodeStore.checkpoints?
      The store did open: run check --head first
    → Otherwise VERY BAD! Repository is bricked.
    → Restore from backup. No other option.
```

Only a checkpoint is broken, or wondering how it got this bad? See [Why Repositories Get Bricked](/architecture/bricked#only-a-checkpoint-is-broken).

---

## ✅ Step 4: Choose Recovery Path

```
[ ] segmentstore/ is copied somewhere safe (e.g. rsync -a)
    → recover-journal rewrites journal.log; remove-nodes has no undo
```

<OakFlowGraph flow="recovery-decision" />

### Option A: Journal Recovery (simpler procedure, loses recent changes, SAFE)

```bash
java -jar oak-run-*.jar recover-journal /path/to/segmentstore
```

```bash
java -jar oak-run-*.jar check /path/to/segmentstore \
    2>&1 | tee check2.log
```

```
[ ] "Journal recovered" and check reports a good revision
    → Note that revision's date: everything after it is lost
    → Start AEM. You're done!

[ ] Any "…, aborting" message, or check still finds problems
    → Try Option B
```

### Option B: Surgical Removal (preserves more data, SLOWER)

::: warning ⚠️ Not in Apache Oak
`:count-nodes`, `:remove-nodes` and `:remove-node` are not part of Apache Jackrabbit Oak (any version). They come from a community fork. See [Fork-only console commands](/reference/oak-versions#fork-only-console-commands) for how to get a build that matches your Oak version.
:::

```bash
cd /safe/workdir   # count-nodes and remove-nodes write logs here
java -jar oak-run-*.jar console --read-write /path/to/segmentstore
> :count-nodes segment-binaries analysis
# WAIT FOR IT TO FINISH (may take hours)
# Writes count-nodes-snfe-YYYYMMDD-HHmmss.log
```

`segment-binaries` reads everything stored in the segment store. `deep` also reads every DataStore binary: use it only with your DataStore options (`--fds-path` …), or every external binary is reported missing ([count-nodes](/reference/count-nodes)).

**Read the log file:**

```
[ ] Log shows ONLY paths like: /content/dam/xyz, /var/audit/abc
    → Removable, if the business accepts losing them
    → Continue below
    
[ ] Log shows ANY of these paths:
    - /oak:index/uuid
    - /oak:index/nodetype
    - /jcr:system
    - /rep:security
    - /home/users/system
    - /libs
    → STOP! These are CRITICAL. You CANNOT remove them.
    → Restore from backup OR attempt sidegrade
```

**If removable:**

```bash
> :remove-nodes count-nodes-snfe-YYYYMMDD-HHmmss.log dry-run
# Spell "dry-run" exactly: --dry-run or dryrun is a REAL run
# Use the exact file name - wildcards are NOT expanded
# READ THE REPORT in remove-nodes-YYYYMMDD-HHmmss.log:
#   [DELETE] … [DRY RUN]     what the real run will delete
#   [WARN] … :remove-node    missing segments, NOT deleted
> :remove-nodes count-nodes-snfe-YYYYMMDD-HHmmss.log
# Only if the [DELETE] list is acceptable
> :remove-node /content/dam/example/path
# Once for EACH missing-segment path the report names
> :count-nodes segment-binaries
# Should now find no missing segments
> :exit
```

::: info What the removal commands act on
- `:remove-nodes` deletes for `Warning: Missing blob at … DataStoreException: Record …` lines, `Warning: Unable to read node …` lines and datastore-consistency `aa/bb/cc/<hex>,<path>` lines, and refuses paths shallower than 3 levels. A missing **original** rendition deletes the **whole asset** ([details](/recovery/surgical)).
- `Warning: Missing segment at …` lines are only logged as `[WARN]`; the report prints the `:remove-node <path>` to run for each. A `Missing blob at …: Segment … not found` line gets neither: choose the path yourself.
- `:remove-node` has no dry-run, writes no log, and refuses only the root and top-level nodes. It will delete `/content/dam` if you ask it to.
- Each deletion is merged immediately and skips commit hooks: there is no undo, and synchronous indexes (uuid, nodetype, references) keep entries for the removed nodes. If anything under `/oak:index` was flagged, plan a reindex.
:::

**Verify:**

```bash
java -jar oak-run-*.jar check /path/to/segmentstore \
    2>&1 | tee check3.log
```

```
[ ] check reports a good revision
    → Write down what you removed
    → Start AEM, then reindex what the removals touched

[ ] Head shows a revision, but a checkpoint shows none
    → The checkpoints still reference what you removed:
      see "Only a checkpoint is broken" (link in Step 3)

[ ] Still no good revision
    → Step 5
```

---

## ✅ Step 5: Last Resort (No Good Revision)

**This will lose data. Accept that now.**

```
[ ] segmentstore/ is copied somewhere safe (see Step 4)

[ ] You have a backup, even an old one?
    → Reconsider it now. Restoring is faster, safer and more predictable
      than anything below.
```

### 5a. Rebuild the journal

`check` only tests the revisions listed in `journal.log`. `recover-journal` scans every segment for root records and makes the newest one that validates the new head, so it can find a good revision that `check` never tried. It needs the head and every checkpoint to validate, like `check`, so it often finds nothing newer, and it reads the whole store (2 TB ≈ 24–48 hours). The old journal is kept as `journal.log.bak.NNN`. AEM stays stopped: `recover-journal` takes no lock.

```bash
java -jar oak-run-*.jar recover-journal /path/to/segmentstore
java -jar oak-run-*.jar check /path/to/segmentstore \
    2>&1 | tee check2.log
```

```
[ ] "Journal recovered" and check now finds a good revision
    → Note the revision's date: everything after it is lost
    → Acceptable? Start AEM
    → Too far back? Restore journal.log.bak.NNN as journal.log
      and try 5b: a sidegrade of the newer head may keep more

[ ] Any "…, aborting" message, or check still finds no good revision
    → Continue to 5b
    ("Too many journal backups, please cleanup" is different:
     move the old journal.log.bak.* files out of segmentstore/
     and run it again)
```

### 5b. Sidegrade what can be read

```bash
# oak-upgrade release matching your oak-core
# paths are repository dirs, each containing segmentstore/
java -jar oak-upgrade-<oak-version>.jar \
    --exclude-paths=/path/that/check/flagged \
    /path/to/corrupted/crx-quickstart/repository /path/to/new/repository
```

The sidegrade stops at the first unreadable node, so leave known-corrupt paths out with `--exclude-paths`. The error names only the missing segment, never the path: take the path from `check` (`Error while traversing …`), and exclude the broken node itself, not a child of it (sometimes its parent, when the lost segment held the child's name). With any path option it copies no checkpoints, so each async indexing lane starts over on the first start. It copies blob references only; keep the same DataStore or see [Sidegrade](/recovery/sidegrade) to move binaries.

```
[ ] Command extracted SOME content
    → Replace old repo with new repo
    → Start AEM
    → Assess what was lost
    
[ ] Command failed completely
    → Restore from backup (yes, even if it's old)
    → There is no other option
```

---

## 🚫 NEVER DO THESE

| Dangerous Action | Why It's Dangerous |
|-----------------|-------------------|
| Run compact BEFORE running check | Cleanup permanently deletes segments you might need |
| Run compact if check shows ANY errors | Corruption becomes unrecoverable |
| Remove critical paths (/oak:index/uuid, /jcr:system, etc.) | AEM won't start even after removal |
| Skip the "dry-run" before remove-nodes | You might delete critical data |
| Use recover-journal on DocumentNodeStore | Wrong command for wrong repo type |
| Panic and run random commands | You will make it worse |
| Start AEM on a store `check` can't open | It can rewind silently, rebuild damaged TAR files, or write a new, empty repository over it ([why](/architecture/bricked#path-4-starting-aem-on-a-store-check-can-t-open)) |
| Delete TAR files, `journal.log` or the damaged store before you have a copy | Old-looking TAR files are often the compacted base: most of your content |
| Let online GC run after a `SegmentNotFoundException` | Each run deletes older generations *before* it compacts; a failed compaction doesn't bring them back ([why](/architecture/bricked)) |

---

## ⏱️ Time Estimates

::: danger ⚠️ CRITICAL: Time Scales With Repository Size
The recovery operations below are **I/O bound** and read most of the segment store. There is no way to parallelize or speed them up (exception: offline `compact --threads N` runs the parallel compactor *(since Oak 1.58 — not in AEM 6.5)*).
:::

### Baseline: 100GB Repository (SSD)

| Operation | Time Estimate | Notes |
|-----------|--------------|-------|
| `oak-run check` | 15 minutes | One pass if the newest revision is good. Damage makes it walk back through the journal, one attempt per revision; `--last N` limits that |
| `oak-run recover-journal` | 30-45 minutes | Traverses all segments |
| `count-nodes` (full scan) | 2 hours | Tests every node + blob |
| `remove-nodes` | 10-30 minutes | Depends on paths to remove |
| `oak-upgrade` sidegrade | 4-6 hours | Copies all accessible content |
| Backup restore | 1-2 hours | Depends on network/storage speed |

### Production Reality: Scaling

| Repository Size | Example: recover-journal ([Journal Recovery](/recovery/journal#time-estimates)) |
|-----------------|--------------------------|
| 100GB | ~30-45 min |
| 500GB | ~2-4 hours |
| 1TB | ~6-12 hours |
| 2TB | ~24-48 hours |
| 3TB+ | ~48-96 hours (multi-day) |

Above 1 TB, times grow faster than the size does: plan in days, not in multiples of the 100 GB baseline.

::: tip On-Prem Reality
Production on-premise AEM installations commonly have **500GB-2TB** segment stores after years of content accumulation. A 2TB repository recovery is a **multi-day operation**.
:::

::: info 📅 Last Updated
Content last reviewed: October 2026 • Verified against Oak 1.22.24 (AEM 6.5) and Oak 2.4.0 (AEM 6.5 LTS SP3)
:::
