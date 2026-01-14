# 💾 Checkpoint Disk Bloat

Orphaned checkpoints are a common cause of disk space issues. They prevent garbage collection from reclaiming space.

## The Problem

```mermaid
flowchart LR
    A[Checkpoint Created] --> B[Pins Segments]
    B --> C[Indexer Finishes]
    C --> D[New Checkpoint Created]
    D --> E[Old Checkpoint Orphaned]
    E --> F[Segments Still Pinned!]
    F --> G[GC Can't Reclaim Space]
```

## How It Happens

1. **Async indexer starts** → Creates checkpoint
2. **Indexer processes content** → Checkpoint pins segments
3. **Indexer finishes** → Creates NEW checkpoint
4. **Old checkpoint orphaned** → No longer referenced
5. **But segments still pinned** → GC can't delete them

## Symptoms

- Disk usage keeps growing
- Compaction doesn't reclaim expected space
- Many checkpoints visible in `oak-run checkpoints list`

## Diagnosis

```bash
$ java -jar oak-run-*.jar checkpoints /path/to/segmentstore list

Checkpoints:
  b8dbd53c-af46-4764-bd3b-df48d4a85438 (ACTIVE - referenced by /:async)
  a7cac42b-bf35-3653-ac2a-ce37c3a74327 (ORPHANED)
  96bab31a-ae24-2542-9b19-bd26b2963216 (ORPHANED)
  85a9a20f-9d13-1431-8a08-ac15a1852105 (ORPHANED)
  ...

Found 47 checkpoints (1 active, 46 orphaned)
```

## Solution

Remove orphaned checkpoints:

```bash
$ java -jar oak-run-*.jar checkpoints /path/to/segmentstore rm-unreferenced

Removing unreferenced checkpoints...
  Removed: a7cac42b-bf35-3653-ac2a-ce37c3a74327
  Removed: 96bab31a-ae24-2542-9b19-bd26b2963216
  ...

Removed 46 orphaned checkpoints
```

Then run compaction to reclaim space:

```bash
$ java -jar oak-run-*.jar compact /path/to/segmentstore
```

## Prevention

### Regular Maintenance

Schedule periodic checkpoint cleanup:

```bash
# Weekly maintenance script
oak-run checkpoints /path/to/segmentstore rm-unreferenced
```

### Monitor Checkpoint Count

Alert if checkpoints exceed threshold:

```bash
COUNT=$(oak-run checkpoints /path/to/segmentstore list | grep -c "ORPHANED")
if [ $COUNT -gt 10 ]; then
    echo "WARNING: $COUNT orphaned checkpoints"
fi
```

## Real-World Impact

| Orphaned Checkpoints | Typical Disk Bloat |
|---------------------|-------------------|
| 10 | ~2-5 GB |
| 50 | ~10-25 GB |
| 100+ | ~50+ GB |

::: tip Key Insight
Each checkpoint pins all segments reachable from that revision. Older checkpoints pin more segments because they reference older data that would otherwise be garbage collected.
:::
