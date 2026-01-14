# 🔍 oak-run check

The `check` command is your **first diagnostic tool**. Always run it before attempting any recovery.

## Basic Usage

```bash
$ java -jar oak-run-*.jar check /path/to/segmentstore
```

## What It Does

1. **Reads journal** - finds current HEAD revision
2. **Traverses segments** - walks the entire repository tree
3. **Validates references** - checks all segment pointers
4. **Reports issues** - lists any corruption found

## Understanding Output

### Healthy Repository

```
Checking /path/to/segmentstore
Checking head
Checking checkpoints
Checked 1 checkpoints
No good revision found for checkpoint 1
Searched through 1 revisions and 1 checkpoints
Latest good revision for paths and checkpoints checked is 
d2afc549-c5a2-4475-a2d1-7257dabba2fd from 2025-01-13T10:30:00Z

✅ Repository is healthy
```

### Corrupted Repository

```
Checking /path/to/segmentstore
Checking head
org.apache.jackrabbit.oak.segment.SegmentNotFoundException: 
  Segment a1b2c3d4-e5f6-7890-abcd-ef1234567890 not found
  
Searching for good revision...
Checked revision d2afc549... - INVALID
Checked revision e3bfc660... - INVALID  
Checked revision f4cgd771... - VALID ✓

Latest good revision for paths and checkpoints checked is
f4cgd771-h8i9-0123-jklm-nopqrstuvwxy from 2025-01-12T08:15:00Z

⚠️ Repository has corruption, but recoverable to 2025-01-12
```

### Severely Corrupted

```
Checking /path/to/segmentstore
Checking head
org.apache.jackrabbit.oak.segment.SegmentNotFoundException...

Searching for good revision...
Checked 500 revisions - all INVALID

No good revision found

❌ Repository severely corrupted - consider sidegrade or backup restore
```

## Command Options

```bash
# Basic check
oak-run check /path/to/segmentstore

# Check specific paths only
oak-run check /path/to/segmentstore --path /content --path /apps

# Deep check (slower, more thorough)
oak-run check /path/to/segmentstore --deep

# Check with bin references (validates DataStore pointers)
oak-run check /path/to/segmentstore --bin

# Output to file
oak-run check /path/to/segmentstore > check-output.txt 2>&1
```

## Interpreting Results

| Result | Meaning | Next Step |
|--------|---------|-----------|
| **Good revision found** | Repository recoverable | Use `recover-journal` or surgical removal |
| **No good revision** | Severe corruption | Try `recover-journal`, then sidegrade |
| **Check fails to run** | Critical segments missing | Restore from backup |

## Time Estimates

| Repository Size | Approximate Time |
|-----------------|------------------|
| 10 GB | ~5 minutes |
| 50 GB | ~10 minutes |
| 100 GB | ~15-20 minutes |
| 500 GB | ~1 hour |

## Common Errors

### SegmentNotFoundException

```
SegmentNotFoundException: Segment abc123... not found
```

**Meaning**: A segment referenced by another segment doesn't exist.

**Causes**:
- Disk corruption
- Incomplete compaction
- Storage failure

### IOException

```
IOException: Failed to read TAR file
```

**Meaning**: TAR file is corrupted or inaccessible.

**Causes**:
- Disk failure
- File system corruption
- Permissions issue

## Best Practices

::: tip Before Running Check
1. **Stop AEM** - Don't check a running repository
2. **Copy logs** - Save current error.log for context
3. **Note the time** - Know when problems started
4. **Have backup ready** - Know your restore options
:::

::: warning After Running Check
1. **Save the output** - You'll need it for recovery decisions
2. **Note the good revision** - This is your recovery target
3. **Don't run compact** - Not until check passes clean
:::
