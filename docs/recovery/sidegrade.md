# 🔄 Sidegrade (oak-upgrade)

Sidegrade uses `oak-upgrade` to extract accessible content from a corrupted repository into a new, clean repository. This is the **last resort** when other recovery options fail.

## When to Use

- `oak-run check` finds no good revision
- `oak-run recover-journal` fails
- Critical paths are corrupted (can't use surgical removal)
- You need to salvage whatever content is accessible

## Basic Usage

```bash
$ java -jar oak-upgrade-*.jar upgrade \
    /path/to/corrupted/segmentstore \
    /path/to/new/segmentstore
```

::: warning Different JAR
This uses `oak-upgrade-*.jar`, NOT `oak-run-*.jar`. They are separate tools.
:::

## What It Does

```mermaid
flowchart LR
    A[Corrupted Repo] --> B[Traverse from HEAD]
    B --> C[Copy accessible nodes]
    C --> D[Skip corrupted nodes]
    D --> E[New Clean Repo]
```

1. **Attempts to traverse from HEAD**
2. **Copies every accessible node** to new repository
3. **Skips nodes** that throw `SegmentNotFoundException`
4. **Results in a new, smaller repository** with only recoverable content

## Example

```bash
$ java -jar oak-upgrade-*.jar upgrade --copy-binaries \
    /path/to/corrupted /path/to/recovered

Migrating repository...
Copied: /
Copied: /content
Copied: /content/we-retail
ERROR: Skipping /content/corrupted: SegmentNotFoundException
Copied: /apps
...
Migration complete: 85% of nodes recovered
```

## Options

### Essential Options

| Option | Description |
|--------|-------------|
| `--copy-binaries` | Copy binaries to new DataStore (recommended for recovery) |
| `--include-paths` | Only migrate specific paths (comma-separated) |
| `--exclude-paths` | Skip specific paths (comma-separated) |
| `--merge-paths` | Merge into existing repository (comma-separated) |

### Recovery-Specific Options

| Option | Description |
|--------|-------------|
| `--fail-on-error` | Fail completely if nodes can't be read (default: skip and continue) |
| `--ignore-missing-binaries` | Proceed even if binaries are missing from DataStore |
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
| `--src-s3datastore <path>` | Source S3 DataStore directory |
| `--src-s3config <file>` | Source S3 configuration file |
| `--s3datastore <path>` | Target S3 DataStore directory |
| `--s3config <file>` | Target S3 configuration file |

### Source/Destination Formats

oak-upgrade supports multiple repository formats:

```bash
# Local segment-tar (most common)
/path/to/segmentstore

# Azure Blob Storage
az:https://myaccount.blob.core.windows.net/container/repo
# (set AZURE_SECRET_KEY environment variable)

# MongoDB
mongodb://host:port/database

# Explicit segment-tar prefix
segment-tar:/path/to/segmentstore
```

### Selective Migration

```bash
# Only migrate /content and /apps
$ java -jar oak-upgrade-*.jar upgrade \
    --include-paths=/content,/apps \
    /path/to/corrupted /path/to/new
```

### Merge with Old Backup

If you have an old backup and want to merge recent accessible content:

```bash
# 1. Restore old backup first
# (DevOps restore operation)

# 2. Merge accessible recent content from corrupted repo
$ java -jar oak-upgrade-*.jar upgrade \
    --include-paths=/content,/home \
    --merge-paths=/content,/home \
    --src=segment-tar:/path/to/corrupted/segmentstore \
    --dst=segment-tar:/path/to/restored/segmentstore

# Result: Old backup + recent changes (minus corrupted paths)
```

### Recovery with Missing Binaries

If DataStore has missing blobs but you want to salvage the repository structure:

```bash
# Proceed even if binaries are missing
$ java -jar oak-upgrade-*.jar upgrade \
    --ignore-missing-binaries \
    --copy-binaries \
    /path/to/corrupted /path/to/new

# Result: Repository structure intact, missing binaries become broken references
# You'll need to re-upload missing assets later
```

### Skip Old Versions (Faster Recovery)

Version storage can be huge. Skip it to speed up recovery:

```bash
# Skip all version history
$ java -jar oak-upgrade-*.jar upgrade \
    --copy-versions=false \
    --copy-orphaned-versions=false \
    /path/to/corrupted /path/to/new

# Or only copy versions from last 30 days
$ java -jar oak-upgrade-*.jar upgrade \
    --copy-versions=2025-12-15 \
    /path/to/corrupted /path/to/new
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
| 1 TB+ | ~24-48 hours |

::: warning ⚠️ Time Estimates Scale
These times are **I/O bound** and scale with repository size. A 1TB repository can take **10-20x longer** than a 100GB repository. **There is no way to speed up these operations.**

**First-time operators** without deep Oak knowledge should expect the **upper end** of timeline estimates.
:::

## After Sidegrade

1. **Verify new repository**
   ```bash
   $ java -jar oak-run-*.jar check /path/to/new/segmentstore
   ```

2. **Assess what was lost**
   - Compare node counts
   - Check critical paths
   - Verify functionality

3. **Replace old repository**
   ```bash
   $ mv /path/to/old/segmentstore /path/to/old/segmentstore.corrupted
   $ mv /path/to/new/segmentstore /path/to/old/segmentstore
   ```

4. **Start AEM**
   ```bash
   $ ./crx-quickstart/bin/start
   ```

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

### Backup Validation Checklist

1. ✅ AEM was stopped when backup taken
2. ✅ Backup timestamp is AFTER AEM stop time
3. ✅ `oak-run check` passes on backup segmentstore
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
