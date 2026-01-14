# 🚨 Crisis Checklist

::: danger 🎯 SCOPE
Requires filesystem access to run `oak-run` commands.  
**Not for AEMaaCS**
:::

**PRINT THIS - LAMINATE IT - TAPE IT TO YOUR MONITOR**

Follow the boxes in order. Check them off as you go. **DO NOT SKIP BOXES.**

## 🔍 Common Signals That Brought You Here

| Signal | Likely Cause | Jump To |
|--------|--------------|---------|
| `SegmentNotFoundException: Segment xyz not found` | Segment corruption or missing TAR | [Step 3](#✅-step-3-run-diagnostic-command) |
| `TarMK refuses to start` / `Failed to open TarMK` | Journal or TAR corruption | [Step 3](#✅-step-3-run-diagnostic-command) |
| `IllegalStateException: Cannot read from closed store` | Unclean shutdown, lock file | [Identify Repo Type](/crisis/identify-repo) |
| `OutOfMemoryError` during startup | Heap too small for repo size | Not corruption — increase heap |
| Disk 100% full | Checkpoint bloat or GC not running | [Checkpoints](/checkpoints/) |
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

## ✅ Step 1: Do You Have a Backup?

```
[ ] YES, and it's RECENT (< 24 hours old)
    → RESTORE IT NOW. Stop reading. You're done.
    
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
    
[ ] I see: MongoDB or database connection in repository.xml
    → You have DocumentNodeStore (MongoMK/RDB)
    → Use commands: check, recovery (NOT recover-journal)
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

```bash
java -jar oak-run-*.jar check /path/to/segmentstore
```

**Check the output:**

```
[ ] Output says: "Latest good revision for paths and checkpoints checked is..."
    → GOOD! Repository is recoverable.
    → Continue to Step 4

[ ] Output says: "No good revision found"
    → BAD! Repository is severely corrupted.
    → Jump to Step 5 (Last Resort)

[ ] Command FAILS with "SegmentNotFoundException" or "IOException"
    → VERY BAD! Repository is bricked.
    → Restore from backup. No other option.
```

---

## ✅ Step 4: Choose Recovery Path

<OakFlowGraph flow="recovery-decision" :height="400" />

### Option A: Journal Recovery (simpler procedure, loses recent changes, SAFE)

```bash
java -jar oak-run-*.jar recover-journal /path/to/segmentstore
```

```
[ ] Command completed successfully
    → Start AEM
    → You're done!
    
[ ] Command failed
    → Try Option B
```

### Option B: Surgical Removal (preserves more data, SLOWER)

::: warning ⚠️ Requires somarc Fork
`:count-nodes` and `:remove-nodes` are only in [somarc/apache-jackrabbit-oak](https://github.com/somarc/apache-jackrabbit-oak). Build oak-run from that fork first.
:::

```bash
java -jar oak-run-*.jar console --read-write /path/to/segmentstore
> :count-nodes deep analysis
# WAIT FOR IT TO FINISH (may take hours)
# Creates log file: /tmp/count-nodes-snfe-*.log
```

**Read the log file:**

```
[ ] Log shows ONLY paths like: /content/dam/xyz, /var/audit/abc
    → These are SAFE to remove
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

**If safe to remove:**

```bash
> :remove-nodes /tmp/count-nodes-snfe-*.log dry-run
# READ THE OUTPUT - make sure it's not deleting critical stuff
> :remove-nodes /tmp/count-nodes-snfe-*.log
# Wait for it to finish
> :exit
```

**Verify:**

```bash
java -jar oak-run-*.jar check /path/to/segmentstore
```

---

## ✅ Step 5: Last Resort (No Good Revision)

**This will lose data. Accept that now.**

```bash
java -jar oak-upgrade-*.jar upgrade --copy-binaries \
    /path/to/corrupted /path/to/new-repo
```

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

---

## ⏱️ Time Estimates

::: danger ⚠️ CRITICAL: Time Scales With Repository Size
All oak-run operations are **I/O bound** and must traverse the entire segment store. There is no way to parallelize or speed up these operations.
:::

### Baseline: 100GB Repository (SSD)

| Operation | Time Estimate | Notes |
|-----------|--------------|-------|
| `oak-run check` | 15 minutes | Faster if corruption found early |
| `oak-run recover-journal` | 30-45 minutes | Traverses all segments |
| `count-nodes` (full scan) | 2 hours | Tests every node + blob |
| `remove-nodes` | 10-30 minutes | Depends on paths to remove |
| `oak-upgrade` sidegrade | 4-6 hours | Copies all accessible content |
| Backup restore | 1-2 hours | Depends on network/storage speed |

### Production Reality: Scaling

| Repository Size | Multiply Baseline By | Example: recover-journal |
|-----------------|---------------------|--------------------------|
| 100GB | 1x | ~30-45 min |
| 500GB | 4-6x | ~2-4 hours |
| 1TB | 10-15x | ~6-12 hours |
| 2TB | 20-30x | ~24-48 hours |
| 3TB+ | 40-50x | ~48-96 hours (multi-day) |

::: tip On-Prem Reality
Production on-premise AEM installations commonly have **500GB-2TB** segment stores after years of content accumulation. A 2TB repository recovery is a **multi-day operation**.
:::
