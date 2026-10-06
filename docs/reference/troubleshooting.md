# 🔧 Troubleshooting Guide

::: info 🎯 Scope
SegmentStore (TarMK) • Oak 1.22.x – 2.4.0 ([version scope](/reference/oak-versions))  
**Not for AEMaaCS**
:::

Common issues and their solutions.

## SegmentNotFoundException

### Symptom
```
org.apache.jackrabbit.oak.segment.SegmentNotFoundException: 
  Segment abc123-def456-... not found
```

In `error.log` the running store logs each miss as `Segment not found: <segment-id>. SegmentId age=…ms` (logger `SegmentNotFoundExceptionListener`). A GC tag after the age changes the diagnosis: see the next list.

### Causes
- Disk corruption
- Incomplete compaction — *not by itself: a cancelled or failed compaction leaves the head intact and its cleanup removes nothing the head needs ([Compaction](/recovery/compaction)). What does produce an SNFE without any corruption is GC racing a long-lived session; the `Segment not found` line then carries a GC tag such as `[pre-compaction cleanup]` ([GC](/architecture/gc#long-lived-sessions-tail-compaction))*
- Storage failure
- Bit rot
- Human error, such as TAR files deleted by hand because they look old ([Why Repositories Get Bricked](/architecture/bricked))

### Solutions

1. **Run check first**
   ```bash
   $ java -jar oak-run-*.jar check /path/to/segmentstore
   ```

2. **If good revision found** → `recover-journal`
3. **If no good revision** → Restore a backup if you have one; otherwise `recover-journal`, check again, then sidegrade
4. **If check fails** → Restore from backup

---

## Repository Won't Start

### Symptom
```
AEM fails to start with repository errors
IllegalStateException: /path/to/segmentstore is in use by another store.
Startup hangs with no error at all
```

The `is in use by another store.` message only appears when the same JVM already has the store open. A **different process** holding `repo.lock` produces no message: the writable store waits on the lock until that process exits (lab, both releases: a second `console --read-write` and `checkpoints list` both waited until killed). Details: [The `repo.lock` File](/architecture/tar-files#the-repo-lock-file).

### Diagnosis
```bash
# Check whether another process (AEM, oak-run) still has the store open
# (repo.lock always exists after first use - its presence alone means nothing)
$ lsof /path/to/segmentstore/repo.lock

# Check journal
$ tail /path/to/segmentstore/journal.log

# Run check
$ java -jar oak-run-*.jar check /path/to/segmentstore
```

### Common Causes

| Cause | Solution |
|-------|----------|
| Store still open elsewhere | Stop the other process; the OS lock on `repo.lock` is released when it exits (deleting the file is not needed). `check`, `recover-journal` and `console` without `--read-write` open the store read-only and take no lock, so they neither wait for AEM nor stop you from running against a live store; `checkpoints`, `compact` and `console --read-write` take the lock |
| Corrupted journal | `recover-journal` |
| Missing segments | Recovery procedures |
| Disk full | Free space, then recover |

---

## Disk Space Growing

### Symptom
```
Repository disk usage keeps increasing
```

### Diagnosis
```bash
# Check TAR file ages
$ ls -lh /path/to/segmentstore/data*.tar

# Check checkpoint count (AEM stopped: the tool waits on repo.lock otherwise)
$ java -jar oak-run-*.jar checkpoints /path/to/segmentstore list
```

With AEM running, use JMX instead: the `CheckpointManager` MBean ("Segment node store checkpoint management") has `listCheckpoints()`.

### Common Causes

| Cause | Solution |
|-------|----------|
| Orphaned checkpoints | `rm-unreferenced` |
| Compaction not running | Schedule compaction |
| Death loop | Fix indexer, clear temp checkpoints |
| Large content uploads | Normal - will compact |

---

## Compaction Fails

### Symptom
```
Compaction fails with errors
```

### Common Errors

**OutOfMemoryError**
```bash
# Increase heap
$ java -Xmx8g -jar oak-run-*.jar compact /path/to/segmentstore
```

**SegmentNotFoundException**
```
# Don't compact corrupted repo!
# Run check and recovery first
```

**Disk full**
```
# Need 2x current size during compaction
# Free space or use larger disk
```

---

## Indexing Issues

### Symptom
```
Search not returning results
Indexer stuck or failing
```

### Diagnosis
```bash
# Check /:async node (read-only console, works while AEM runs)
$ java -jar oak-run-*.jar console /path/to/segmentstore
> cd /:async
> pn

# Look for:
# - async-temp with multiple entries (death loop)
# - Old async-LastIndexedTo timestamp
```

### Solutions

| Issue | Solution |
|-------|----------|
| Death loop | Clear temp checkpoints, fix root cause |
| Stuck indexer | Restart AEM, check logs |
| Corrupted index | Delete index files, reindex |

---

## Performance Issues

### Symptom
```
Repository operations slow
High CPU/IO during normal operations
```

### Diagnosis
```bash
# Check repository size
$ du -sh /path/to/segmentstore

# Check TAR file count
$ ls /path/to/segmentstore/data*.tar | wc -l

# Check checkpoint count (AEM stopped; `wc -l` would also count the header lines)
$ java -jar oak-run-*.jar checkpoints /path/to/segmentstore list | grep -c '^- '
```

### Common Causes

| Cause | Solution |
|-------|----------|
| Too many TAR files | Run compaction |
| Many checkpoints | Remove orphaned |
| Large repository | Consider clustering *(TarMK itself can't be clustered: one process holds `repo.lock`. Clustering means DocumentNodeStore, which is outside this site's scope)* |
| Slow storage | Upgrade to SSD |

---

## Quick Reference

| Error | First Step |
|-------|------------|
| SegmentNotFoundException | `oak-run check` |
| Won't start | Check who holds `repo.lock`, run `check` |
| Disk growing | Check checkpoints |
| Compaction fails | Check for corruption first |
| Indexing stuck | Check `/:async` node |
| Slow performance | Check size and compaction |

::: info 📅 Last Updated
Content last reviewed: October 2026 • Verified against Oak 1.22.24 (AEM 6.5) and Oak 2.4.0 (AEM 6.5 LTS SP3)
:::
