# 📊 count-nodes Command

The `count-nodes` command traverses the repository tree, counting nodes and detecting corruption.

## Usage

```bash
$ java -jar oak-run-*.jar console /path/to/segmentstore

> :count-nodes
```

## What It Does

1. **Traverses entire tree** from root
2. **Counts all nodes** encountered
3. **Detects SegmentNotFoundException** for corrupted paths
4. **Logs corrupted paths** to `/tmp/count-nodes-snfe-*.log`

## Output

### Normal Operation

```
Counting nodes...
/content - 15,234 nodes
/apps - 8,921 nodes
/conf - 2,341 nodes
/var - 45,678 nodes
...

Total: 156,789 nodes
No corruption detected.
```

### With Corruption

```
Counting nodes...
/content - 15,234 nodes
/content/dam/2024/Q3 - SegmentNotFoundException!
  Segment abc123... not found
  Logged to /tmp/count-nodes-snfe-1704963300000.log
/apps - 8,921 nodes
...

Total: 145,678 nodes (accessible)
Found 3 corrupted paths. See log file.
```

## Options

```bash
# Count from specific path
> :count-nodes /content/dam

# Deep analysis (slower, more thorough)
> :count-nodes deep

# With blob verification
> :count-nodes blobs
```

## Log File Format

```
# /tmp/count-nodes-snfe-1704963300000.log

/content/dam/2024/Q3/corrupted-asset.pdf
/content/dam/2024/Q3/another-file.jpg
/var/audit/2024/01/15/entry-123
```

Each line is a path that threw `SegmentNotFoundException`.

## Time Estimates

| Repository Size | Approximate Time |
|-----------------|------------------|
| 10 GB | ~30 minutes |
| 50 GB | ~1 hour |
| 100 GB | ~2 hours |
| 500 GB | ~6-8 hours |

## Use Cases

### Finding Corruption

```bash
> :count-nodes
# Review log file for corrupted paths
```

### Before Surgical Removal

```bash
> :count-nodes
# Log file becomes input for remove-nodes
> :remove-nodes /tmp/count-nodes-snfe-*.log dry-run
```

### Repository Health Check

```bash
> :count-nodes
# If no corruption, repository is healthy
```

## Key Takeaways

::: tip Remember
1. **Traverses entire tree** - Comprehensive scan
2. **Logs corruption** - Creates file for remove-nodes
3. **Time-consuming** - Plan for hours on large repos
4. **Non-destructive** - Read-only operation
:::
