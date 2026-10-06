# 🔄 Sidegrade (oak-upgrade)

::: info 🎯 Scope
SegmentStore (TarMK) • Oak 1.22.x – 2.4.0 ([version scope](/reference/oak-versions))  
**Not for AEMaaCS**
:::

Sidegrade uses `oak-upgrade` to extract accessible content from a corrupted repository into a new, clean repository. This is the **last resort** when other recovery options fail.

## When to Use

- `oak-run check` finds no good revision
- `oak-run recover-journal` fails
- Critical paths are corrupted (can't use surgical removal)
- You need to salvage whatever content is accessible

## Basic Usage

```bash
$ java -jar oak-upgrade-<oak-version>.jar \
    /path/to/corrupted/crx-quickstart/repository \
    /path/to/new/repository
```

Source and destination are **positional** and point at the **repository directory that contains `segmentstore/`** — oak-upgrade appends `segmentstore` itself. Do not pass the `segmentstore` directory, and do not add an `upgrade` sub-command (the tool's own help banner prints `java -jar oak-upgrade-*.jar upgrade`, but a third positional argument fails with `Too much node store arguments`). Passing the `segmentstore` directory fails with `IllegalStateException: …/segmentstore/segmentstore does not exist or is not a directory`.

Stop AEM first: oak-upgrade opens the source read-only and takes no `repo.lock`, so nothing stops it from reading a store that AEM still has open, and the source "must not be modified while the copy operation is running" (`RepositorySidegrade` javadoc). If the source directory also holds a `workspaces/` folder (left over from a CRX2 → Oak upgrade), oak-upgrade treats it as a CRX2 repository and fails with `Repository configuration not found: …/repository.xml`; move that folder aside.

::: warning Different JAR
This uses `oak-upgrade-*.jar`, NOT `oak-run-*.jar`. They are separate tools (`oak-run upgrade` only prints "This command was moved to the oak-upgrade module"). Use the standalone `oak-upgrade` release that matches your oak-core version (`oak-upgrade-1.22.x.jar` on AEM 6.5, `oak-upgrade-2.4.0.jar` on AEM 6.5 LTS SP3) — the AEM 6.5 LTS release notes say crx2oak is not supported there. See [which LTS SP has which Oak](/reference/oak-versions).
:::

## What It Does

```mermaid
flowchart TD
    A[Corrupted Repo] --> B[Traverse from HEAD]
    B --> C{Unreadable node?}
    C -->|no| D[Copy node]
    C -->|yes| X[Abort: Failed to copy content]
    D --> E[New Clean Repo]
    X --> F[Re-run with --exclude-paths]
```

1. **Attempts to traverse from HEAD** (on a full segment→segment copy it first copies the checkpoints, then applies the diff to HEAD)
2. **Copies every node it is asked to copy** to the new repository
3. **Does NOT skip unreadable nodes** — a `SegmentNotFoundException` anywhere in the copied tree aborts the whole run with `Failed to copy content`. Leave known-corrupt paths out with `--exclude-paths` (find them first with `oak-run check` or `:count-nodes`, a [fork-only](/reference/oak-versions#fork-only-console-commands) console command)
4. **Results in a new, smaller repository** with only recoverable content

::: warning What the Oak code actually does (Oak 1.22 and 2.4)
oak-upgrade has two copy modes, and which one you get decides what the new repository needs before AEM can use it:

- **Full copy**: no `--include-paths`/`--exclude-paths`/`--merge-paths`, default version options, no `--skip-checkpoints`, empty destination. Every checkpoint is copied, then HEAD, as diffs written straight into new segments (progress line `Copying node 10000: …`, no `#`). No commit hooks run. Each checkpoint is re-created under a new name and `/:async` is rewritten to match (`Rewriting checkpoint names in /:async {async=…}`), so async indexing simply continues. `/:clusterConfig` comes along: the new repository has the **same cluster ID** (repository ID) as the old one.
- **Filtered copy**: anything else. HEAD only (`Checkpoints won't be migrated because of the specified paths`, `… version settings`, `… --skip-checkpoints options` or `… the destination repository exists`; progress line `Copying node #10000: …`), then one big commit through the commit hooks: node-type check (violations are logged as `WARN … OakConstraint…`, not fatal), permission store, versionable paths, and a property/reference index update. No checkpoints are created, yet `/:async` is still copied with the **old** checkpoint names: on first start each async lane logs `[async] Failed to retrieve previously indexed checkpoint …; re-running the initial index update` and re-traverses the whole repository. Index data is copied as stored: entries for excluded paths stay in the indexes (lab: all 50 property-index entries under an excluded `/content/excluded` were still in `/oak:index/foo/:index`). Reindex the indexes that cover what you excluded.

A full copy also reads every checkpoint, so damage that only a checkpoint reaches aborts it, and so does a checkpoint that has **expired** while the store sat idle: re-creating it with a negative lifetime fails with a bare `java.lang.IllegalArgumentException` under `Failed to copy content`. `--skip-checkpoints` gets past both (and switches to a filtered copy).

Before any of this, oak-upgrade scans the source's segments for an external blob reference (to decide how to handle binaries; it reads every data segment until it finds one). An unreadable segment stops it right there with a bare `SegmentNotFoundException`, not `Failed to copy content`. If the source uses a DataStore, `--src-external-ds=true` skips the scan.
:::

## Example

```bash
$ java -jar oak-upgrade-<oak-version>.jar \
    --exclude-paths=/content/corrupted \
    /path/to/corrupted/crx-quickstart/repository /path/to/recovered/repository

... paths to exclude: [/content/corrupted]
... Source: SEGMENT_TAR[/path/to/corrupted/crx-quickstart/repository]
... Destination: SEGMENT_TAR[/path/to/recovered/repository]
... Only blob references will be copied
... Checkpoints won't be migrated because of the specified paths
... Copying node #10000: /content/...
... Copying node #20000: /apps/...
...
```

Progress is logged every 10,000 nodes (`-Doak.upgrade.logNodeCopy=<n>` to change). If a corrupted node is hit, the run ends with `javax.jcr.RepositoryException: Failed to copy content` — add that path to `--exclude-paths` and start over with an empty destination.

The error does not name the path, only the segment (exit code 1):

```
Exception in thread "main" java.lang.RuntimeException: javax.jcr.RepositoryException: Failed to copy content
...
Caused by: org.apache.jackrabbit.oak.segment.SegmentNotFoundException: Segment 86cc84d2-a2ef-4ab9-a4be-57cb94eff9e8 not found
```

Take the path from `oak-run check` (`Error while traversing /content/corrupted: …SegmentNotFoundException…`). Exclude the node whose own record is lost: excluding one of its children doesn't help (lab: `--exclude-paths=/content/corrupted/c1` still aborted, `/content/corrupted` worked). When the lost record belongs to the parent's child list (a child-map bucket, or a child's name), merely listing the parent fails, and the parent itself has to be excluded ([why](/architecture/bricked#_2-records-only-point-down)).

## Options

### Essential Options

| Option | Description |
|--------|-------------|
| `--copy-binaries` | Copy binary content instead of only references. Without a target DataStore option the binaries get embedded in the new segment store |
| `--include-paths` | Only migrate specific paths (comma-separated) |
| `--exclude-paths` | Skip specific paths (comma-separated) |
| `--merge-paths` | Paths to merge with the existing destination content instead of replacing it (comma-separated) |

::: tip Binaries: references vs copies
If the source uses an external DataStore and you pass no DataStore options, only **blob references** are copied — the new repository must keep using the same DataStore. Pass `--src-datastore` (plus `--datastore` to copy into a new FileDataStore, or `--copy-binaries` to embed them) to actually move binaries. When the source has external binaries, `--copy-binaries` or a target DataStore option *without* a source DataStore option is rejected ("This combination of data- and node-stores is not supported").

`--src-datastore` on its own also copies only references, but not blindly: every reference is looked up in that DataStore, and a missing blob aborts the run (`DataStoreException: Record <id> does not exist`, lab, both copy modes). With no DataStore option at all, references are copied without looking at the DataStore, so references to missing blobs come across unchanged.
:::

### Recovery-Specific Options

| Option | Description |
|--------|-------------|
| `--fail-on-error` | Only affects JCR2 (CRX2) → Oak upgrades. A segment→segment sidegrade never skips unreadable nodes, with or without this flag. The same goes for `--skip-init` and `--early-shutdown`: the sidegrade never reads them, although the log still prints `Unreadable nodes will cause failure of the entire transaction` / `The repository initialization will be skipped` |
| `--ignore-missing-binaries` | Proceed even if binaries are missing from the **source** DataStore (only takes effect with a source DataStore option: `--src-datastore`, `--src-s3datastore` or `--src-azuredatastore`). Each missing binary becomes an empty (0-byte) binary in the new repository; see [Recovery with Missing Binaries](#recovery-with-missing-binaries) |
| `--skip-checkpoints` | Don't copy checkpoints on a full segment→segment migration (checkpoints are already skipped when include/exclude/merge paths or version options are used, or when the destination isn't empty). Also the way past an expired checkpoint (bare `IllegalArgumentException`) |
| `--src-external-ds=true` | Tell oak-upgrade the source uses an external DataStore, which skips the up-front scan of the source's segments (that scan aborts on the first unreadable segment). Only `true` is safe for a store with a DataStore: `false` makes it treat the binaries as embedded |
| `--verify` | After the copy, compare source and destination and log `Verification result: both repositories are identical` or `… are not identical`. It stops at the **first** difference and is not a loss report: a full copy of an AEM repository always differs in `/:async` (rewritten checkpoint names), a filtered one at the first excluded or re-indexed node. `--only-verify` compares without copying |
| `--copy-versions` | Copy version storage: `true`, `false`, or `yyyy-mm-dd` cutoff (default: true) |
| `--copy-orphaned-versions` | Copy orphaned versions: `true`, `false`, or `yyyy-mm-dd` cutoff (default: true) |

### Performance Options

| Option | Description |
|--------|-------------|
| `--cache <MB>` | Cache size in MB (default: 256). Increase for large repos. |
| `--disable-mmap` | Disable memory-mapped file access (use if running into memory issues) |

### DataStore Options

| Option | Description |
|--------|-------------|
| `--src-datastore <path>` | Source FileDataStore directory |
| `--datastore <path>` | Target FileDataStore directory |
| `--src-s3datastore <path>` | Source S3 DataStore directory (local cache dir) |
| `--src-s3config <file>` | Source S3 configuration file |
| `--s3datastore <path>` | Target S3 DataStore directory (local cache dir) |
| `--s3config <file>` | Target S3 configuration file |
| `--src-azureconfig <file>` / `--azureconfig <file>` | Source / target Azure DataStore configuration (the config file alone is enough; `--src-azuredatastore` / `--azuredatastore <path>` are optional) |

`--fds-path` is an **oak-run** option; oak-upgrade does not accept it — use `--src-datastore` / `--datastore`.

### Source/Destination Formats

For TarMK there is no prefix — pass the plain repository directory:

```bash
# Local segment-tar: the directory that CONTAINS segmentstore/
/path/to/crx-quickstart/repository
```

(oak-upgrade also accepts `az:`, `mongodb://` and `jdbc:` descriptors, plus `segment-old:` for the pre-Oak-1.6 segment format, but Azure segment stores and DocumentNodeStore are outside the scope of this guide. There is no `segment-tar:` prefix and no `--src=` / `--dst=` option.)

### Selective Migration

```bash
# Only migrate /content and /apps
$ java -jar oak-upgrade-<oak-version>.jar \
    --include-paths=/content,/apps \
    /path/to/corrupted/crx-quickstart/repository /path/to/new/repository
```

::: warning Not a bootable repository on its own
Into an empty destination, `--include-paths` copies those subtrees and nothing else: no `/oak:index`, no node types, no `/home` or `/libs`, no `/:clusterConfig`, no `/:async` (lab: the new root held only `content` and `jcr:system/jcr:versionStorage`). Use it to merge into a working repository ([Merge with Old Backup](#merge-with-old-backup)). To leave damage out of a full repository, use `--exclude-paths`.
:::

### Merge with Old Backup

If you have an old backup and want to merge recent accessible content:

```bash
# 1. Restore old backup first
# (DevOps restore operation)

# 2. Merge accessible recent content from corrupted repo
$ java -jar oak-upgrade-<oak-version>.jar \
    --include-paths=/content,/home \
    --merge-paths=/content,/home \
    --exclude-paths=/content/corrupted \
    /path/to/corrupted/crx-quickstart/repository \
    /path/to/restored/crx-quickstart/repository

# Result: Old backup + recent changes (minus corrupted paths)
```

The `--exclude-paths` line is what leaves the corrupted paths out: without it the merge aborts at the first unreadable node like any sidegrade (lab: exit 1, then exit 0 with it). AEM must be stopped on the restored repository. It keeps its own checkpoints, `/:async` and cluster ID, and oak-upgrade logs `The version storage on destination already exists. Orphaned version histories will be skipped.` Only blob references are copied, so the restored repository must use a DataStore that holds the corrupted repository's newer binaries (the live DataStore, not an older restored copy).

### Recovery with Missing Binaries

If DataStore has missing blobs but you want to salvage the repository structure:

```bash
# Proceed even if binaries are missing
$ java -jar oak-upgrade-<oak-version>.jar \
    --ignore-missing-binaries \
    --src-datastore=/path/to/corrupted/datastore \
    --datastore=/path/to/new/datastore \
    /path/to/corrupted/crx-quickstart/repository /path/to/new/repository

# Result: Repository structure intact; each missing binary is logged
# ("No blob found for id [...]") and read as an empty stream
# You'll need to re-upload missing assets later
```

::: warning What the Oak code actually does (Oak 1.22 and 2.4)
The empty stream is what gets written: each missing binary becomes an **empty, 0-byte binary stored inline** in the new segment store, and its original blob ID is gone (lab: `a.jpg` came out `inline length=0`, with `--datastore`, `--copy-binaries` or `--src-datastore` alone). A blob you later find in a DataStore backup can't be put back under that node by ID. If you would rather keep the references, run without any DataStore option: references are copied unchanged, missing ones included, and the new repository keeps using the same DataStore. Without `--ignore-missing-binaries`, any source DataStore option makes a missing blob fatal (`DataStoreException: Record <id> does not exist`).
:::

### Skip Old Versions (Faster Recovery)

Version storage can be huge. Skip it to speed up recovery:

```bash
# Skip all version history
$ java -jar oak-upgrade-<oak-version>.jar \
    --copy-versions=false \
    --copy-orphaned-versions=false \
    /path/to/corrupted/crx-quickstart/repository /path/to/new/repository

# Or only copy versions from last 30 days
$ java -jar oak-upgrade-<oak-version>.jar \
    --copy-versions=2025-12-15 \
    /path/to/corrupted/crx-quickstart/repository /path/to/new/repository
```

## Standby Recovery: Why It Rarely Works

::: danger ⚠️ REALITY CHECK
Standby recovery is **rarely viable** in practice.
:::

### The Problem with Cold Standby

- Cold standbys typically **replicate corruption** from primary
- By the time corruption is discovered, standby already has it
- Standby sync happens continuously (usually every few seconds)
- Corruption on primary → quickly replicated to standby

::: warning What the Oak code actually does (Oak 1.22 and 2.4)
The standby copies what the primary can still read. Each sync (every 5 seconds by default) diffs the primary's head against its own and pulls every segment it doesn't have yet; it moves its head only after the whole diff is copied. A segment the primary can no longer serve stops that sync with `IllegalStateException: Unable to read segment <id>` (or `Unable to read references of segment <id> from primary`), and the standby keeps its last complete head. So bad content, and anything the primary can still read, is replicated within seconds, but a segment **lost** on the primary does not become a hole on the standby. If the standby log shows those errors from around the time of the damage, take a copy of the standby and run `oak-run check` on it before ruling it out.
:::

### When Standby MIGHT Work (Extremely Rare)

1. **Standby sync was disabled/broken** before corruption occurred
   - Network failure prevented sync for extended period
   - Standby deliberately paused for maintenance (hours/days)
   - **Reality**: Operations teams notice and fix sync issues immediately

2. **Very recent corruption** detected within seconds
   - Corruption just happened seconds ago
   - Standby hasn't synced yet (sync interval typically 5-30 seconds)
   - **Reality**: Corruption detection takes minutes/hours, standby already has it

3. **"Standby" from different time period**
   - Old standby that was intentionally kept out of sync
   - **Reality**: This is a backup, not a standby - use backup restore procedures

### Bottom Line

In **99.9% of real-world scenarios**, standby has the same corruption as primary. **Plan for backup restore, not standby recovery.**

## Success Conditions

- ✅ At least some content is accessible
- ✅ Corruption is localized (e.g., only `/content/dam/corrupted`)
- ✅ Critical paths (`/apps`, `/libs`, `/content`) are mostly intact

## Failure Modes

- ❌ If HEAD itself is inaccessible (can't even start traversal)
- ❌ If corruption affects most of the repository
- ❌ Content loss is likely - you get what you get

## Time Estimates

| Repository Size | Approximate Time |
|-----------------|------------------|
| 10 GB | ~30 minutes |
| 50 GB | ~1-2 hours |
| 100 GB | ~4-6 hours |
| 500 GB | ~12-24 hours |
| 1 TB | ~24-48 hours |
| 2 TB | ~48-96 hours (multi-day) |
| 3 TB+ | ~96-168 hours (week-scale) |

::: warning ⚠️ Time Estimates Scale With Repository Size
These times are **I/O bound** - sidegrade must read every accessible node from the source and write to the destination. There is no way to parallelize or speed up these operations.

**Production reality**: On-premise AEM installations commonly accumulate **500GB-2TB** segment stores. A 2TB sidegrade is a **multi-day to week-scale operation**.

**First-time operators** without deep Oak knowledge should expect the **upper end** of timeline estimates.
:::

## After Sidegrade

1. **Verify new repository**
   ```bash
   $ java -jar oak-run-*.jar check /path/to/new/repository/segmentstore
   ```

2. **Assess what was lost**
   - Compare node counts
   - Check critical paths
   - Verify functionality

3. **Replace old repository**
   ```bash
   $ mv /path/to/old/segmentstore /path/to/old/segmentstore.corrupted
   $ mv /path/to/new/repository/segmentstore /path/to/old/segmentstore
   ```

4. **Start AEM**
   ```bash
   $ ./crx-quickstart/bin/start
   ```

::: tip First start after a sidegrade
- **Async indexes**: after a full copy, async indexing continues from the copied checkpoints. After a filtered copy (`--exclude-paths` etc.), expect `Failed to retrieve previously indexed checkpoint …; re-running the initial index update` and a full re-traversal per async lane, and reindex the indexes that cover the paths you left out (their old entries were copied).
- **DataStore**: unless binaries were moved, the new segment store only holds references: keep the **same** DataStore. A full or `--exclude-paths` copy also keeps the old repository's cluster ID, so it registers the same `repository-<id>` marker. That is right when it replaces the damaged repository. Never start the damaged copy again against the same DataStore: two repositories with one ID are a clone ([Cloned Environments Sharing a DataStore](/datastore/gc#cloned-environments)).
:::

## Backup Timing: The #1 DevOps Mistake

::: danger ⚠️ CRITICAL: Stop AEM Before Backup
Taking backups/snapshots while AEM is running captures **inconsistent state**.
:::

### WRONG: Backup While Running

```bash
# AEM is running, actively writing to disk
$ tar -czf aem-backup.tar.gz crx-quickstart/repository/
# OR
$ aws ec2 create-snapshot --volume-id vol-xxx  # VM still running
```

**Why this fails:**
- ❌ Backup captures **partial TAR files** (mid-write)
- ❌ Backup captures **inconsistent state** (some TARs updated, others not)
- ❌ Backup contains **corrupted journal.log** (truncated mid-write)
- ❌ Restore will fail with SegmentNotFoundException

::: warning What the Oak code actually does (Oak 1.22 and 2.4)
Oak is built to survive a crash, so the first and third bullets are rarely what kills a restore by themselves. A TAR file whose index was never written is rebuilt on open (`Could not find a valid tar index in …, recovering...`, dropping entries that fail their checksum), a half-written last journal line is skipped (`Skipping invalid journal entry`), and journal entries whose segments are missing are passed over (`Unable to access revision …, rewinding...`). The damage comes from the second bullet: a file-by-file copy (`tar`, `rsync`, `cp`) takes every file at a different moment, and online revision GC can rewrite or delete TAR files while the copy runs. Such a restore at best silently rewinds to an older head and at worst hits SegmentNotFoundException. A volume snapshot is one moment for that volume only: a segment store and a DataStore on different volumes are not snapshotted together. Stopping AEM avoids all of it.
:::

### RIGHT: Stop AEM, Then Backup

```bash
# 1. Stop AEM cleanly
$ ./crx-quickstart/bin/stop
# Wait for process to fully terminate

# 2. VERIFY AEM is stopped
$ ps aux | grep java
# No AEM process should be running

# 3. NOW take backup (filesystem is quiescent)
$ tar -czf aem-backup.tar.gz crx-quickstart/repository/
# OR
$ aws ec2 create-snapshot --volume-id vol-xxx
```

### Test Your Backup BEFORE You Need It

```bash
# Don't wait for a P1 to discover your backup is corrupt
$ java -jar oak-run-*.jar check /path/to/backup/segmentstore

# ✅ "Latest good revision..." = Backup is good
# ❌ SegmentNotFoundException = Backup is corrupt (was taken while running)
```

`check` exits 0 on a damaged store too, and still prints `Latest good revision …`: it is the newest revision that passed, not proof that HEAD did. The backup is good when that revision is the **first** `Checking revision …` of the run and there are no `Error while traversing …` or `Skipping invalid record id …` lines. A damaged backup prints the SegmentNotFoundException inside those lines, not as a crash ([reading check output](/recovery/check#🚨-critical-bricked-vs-recoverable-distinction)).

### Backup Validation Checklist

1. ✅ AEM was stopped when backup taken
2. ✅ Backup timestamp is AFTER AEM stop time
3. ✅ `oak-run check` passes on backup segmentstore (latest good revision = first revision checked, no traversal errors)
4. ✅ Backup restore tested successfully (at least once)

## If Sidegrade Fails

If sidegrade can't extract any content:

1. **Restore from backup** - Even an old backup is better than nothing
2. **Accept total data loss** - Rebuild from scratch
3. **Document everything** - Root cause analysis for prevention

::: danger Total Data Loss
If you're in this scenario with no backup, there is **no Oak magic** that will save you. The data is gone.

**Your only options:**
1. Accept the loss - Rebuild from scratch
2. Communicate upward immediately
3. Implement backup strategy so this never happens again
:::

## Key Takeaways

::: tip Remember
1. **Last resort** - Use only when other recovery fails
2. **Content loss likely** - You get what's accessible
3. **Different JAR** - Uses `oak-upgrade`, not `oak-run`
4. **Standby rarely helps** - It usually has the same corruption
5. **Stop AEM before backup** - Running backups capture inconsistent state
6. **Test backups** - Run `oak-run check` on backup before you need it
7. **Time scales with size** - 1TB = 10-20x longer than 100GB
:::

::: info 📅 Last Updated
Content last reviewed: October 2026 • Verified against Oak 1.22.24 (AEM 6.5) and Oak 2.4.0 (AEM 6.5 LTS SP3)
:::
