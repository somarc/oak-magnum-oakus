# 🔧 Troubleshooting Guide

Common issues and their solutions.

## SegmentNotFoundException

### Symptom
```
org.apache.jackrabbit.oak.segment.SegmentNotFoundException: 
  Segment abc123-def456-... not found
```

### Causes
- Disk corruption
- Incomplete compaction
- Storage failure
- Bit rot

### Solutions

1. **Run check first**
   ```bash
   $ java -jar oak-run-*.jar check /path/to/segmentstore
   ```

2. **If good revision found** → `recover-journal`
3. **If no good revision** → Sidegrade or restore backup
4. **If check fails** → Restore from backup

---

## Repository Won't Start

### Symptom
```
AEM fails to start with repository errors
```

### Diagnosis
```bash
# Check for lock file
$ ls /path/to/segmentstore/repo.lock

# Check journal
$ tail /path/to/segmentstore/journal.log

# Run check
$ java -jar oak-run-*.jar check /path/to/segmentstore
```

### Common Causes

| Cause | Solution |
|-------|----------|
| Stale lock file | Remove `repo.lock` if process not running |
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

# Check checkpoint count
$ java -jar oak-run-*.jar checkpoints /path/to/segmentstore list
```

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
# Check /:async node
$ java -jar oak-run-*.jar console /path/to/segmentstore
> :cd /:async
> :pn

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

# Check checkpoint count
$ java -jar oak-run-*.jar checkpoints /path/to/segmentstore list | wc -l
```

### Common Causes

| Cause | Solution |
|-------|----------|
| Too many TAR files | Run compaction |
| Many checkpoints | Remove orphaned |
| Large repository | Consider clustering |
| Slow storage | Upgrade to SSD |

---

## Quick Reference

| Error | First Step |
|-------|------------|
| SegmentNotFoundException | `oak-run check` |
| Won't start | Check `repo.lock`, run `check` |
| Disk growing | Check checkpoints |
| Compaction fails | Check for corruption first |
| Indexing stuck | Check `/:async` node |
| Slow performance | Check size and compaction |
