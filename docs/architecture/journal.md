# 📜 Journal: The Commit History

The `journal.log` file is the **commit history** of your repository. It tracks every revision and points to the current HEAD state.

## What is the Journal?

```
segmentstore/
├── data00000a.tar
├── data00001a.tar
├── journal.log        ← This file
└── ...
```

The journal is a simple text file containing revision references:

```
# journal.log contents (appended — newest LAST)
...
a1b2c3d4-e5f6-7890-abcd-ef1234567890:257024 root 1704067190000
d2afc549-c5a2-4475-a2d1-7257dabba2fd:261600 root 1704067200000
```

### Format

```
[SEGMENT_UUID]:[OFFSET] root [TIMESTAMP]
```

| Field | Description |
|-------|-------------|
| **SEGMENT_UUID:OFFSET** | Record id of the super-root node state (the node holding `root` and `checkpoints`): segment UUID + record offset (decimal) |
| **TYPE** | Always "root" |
| **TIMESTAMP** | Unix timestamp (milliseconds) |

## How the Journal Works

```mermaid
sequenceDiagram
    participant App as Application
    participant Oak as Oak Core
    participant Journal as journal.log
    participant TAR as TAR Files
    
    App->>Oak: Write content
    Oak->>TAR: Create new segments
    Oak->>App: Commit success
    Note over Oak: HEAD updated in memory
    Oak->>Journal: Flush (every 5 s,<br/>if HEAD changed):<br/>append new revision
```

### On Startup

1. Oak reads `journal.log` **backwards** (last line first)
2. Picks the newest entry whose segment exists in the store (skipped entries log `Unable to access revision ..., rewinding...` or `Skipping invalid record id ...`)
3. Uses that as HEAD
4. Repository is ready

::: warning Missing or unusable journal
If no usable entry is found (journal missing, empty, or every entry points to a missing segment), Oak does **not** fail: it writes a fresh, empty initial node state as HEAD. The repository then *appears empty*.
:::

### On Commit

1. New records written to segments (buffered, then flushed to TAR)
2. HEAD updated atomically in memory
3. On the next flush (scheduled every 5 seconds), segments are flushed to TAR **first**, then the new HEAD is appended to the journal

## Journal Recovery

The journal can be **rebuilt** from segments:

```bash
$ java -jar oak-run-*.jar recover-journal /path/to/segmentstore
```

### What `recover-journal` Does

1. Opens the store read-only and scans all data segments
2. Finds node records that look like a super-root (have both `root` and `checkpoints` children); timestamps come from the segment info
3. Sorts candidates by time and, starting from the newest, drops candidates whose head or checkpoints fail a consistency check until the newest one is consistent
4. Renames the old journal to `journal.log.bak.000` (`.001`, …) and writes the new journal

### When to Use

- Journal file corrupted or missing
- Journal points to missing segments
- After unexpected shutdown

## Journal vs. Segments

| Aspect | Journal | Segments |
|--------|---------|----------|
| **Content** | Revision pointers | Actual data |
| **Rebuildable** | ✅ Yes | ❌ No |
| **Size** | Small (KB-MB) | Large (GB-TB) |
| **Format** | Text file | Binary TAR |

::: tip Key Insight
Losing the journal is **recoverable**. Losing segments is **not**.
:::

## Viewing the Journal

```bash
# View recent entries
$ tail -20 /path/to/segmentstore/journal.log

# Count entries
$ wc -l /path/to/segmentstore/journal.log

# Find entries from specific date
$ grep "1704067" /path/to/segmentstore/journal.log
```

## Journal Truncation

In some recovery scenarios, you might manually truncate the journal:

```bash
# Backup first!
$ cp journal.log journal.log.backup

# Keep only entries up to known good revision
$ head -n 100 journal.log > journal.log.new
$ mv journal.log.new journal.log
```

::: danger ⚠️ Expert Only
Manual journal truncation should only be done if you know the exact good revision from `oak-run check` output.
:::

## Common Journal Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| **Corrupted** | WARN `Skipping invalid record id ...` | `recover-journal` |
| **Missing** | No error — repository appears empty | `recover-journal` |
| **Points to bad segment** | WARN `Unable to access revision ..., rewinding...`, or `SegmentNotFoundException` once a deeper segment is read | `recover-journal` or truncate |
| **Empty** | Repository appears empty | `recover-journal` |

## Key Takeaways

::: tip Remember
1. **Journal = commit history** - points to revisions
2. **Rebuildable** - can be reconstructed from segments
3. **Text format** - human readable, simple structure
4. **HEAD = last entry** - newest valid revision (read from the end of the file)
5. **Recovery is possible** - `recover-journal` scans all segments
:::
