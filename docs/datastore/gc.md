# 🗑️ DataStore Garbage Collection

DataStore GC removes unreferenced blobs (binaries) to reclaim storage space. It's separate from SegmentStore GC.

## Two-Phase Process

DataStore GC uses a mark-and-sweep approach:

```mermaid
flowchart LR
    A[Mark Phase] --> B[Wait 24+ hours]
    B --> C[Sweep Phase]
    C --> D[Space Reclaimed]
```

### Why Two Phases?

The gap ensures no in-flight uploads are deleted:
- **Mark**: Records all referenced blobs
- **Wait**: Allows pending uploads to complete
- **Sweep**: Deletes unreferenced blobs

## Mark Phase

```bash
# Via JMX (AEM running)
# BlobGCMBean → startBlobGC(markOnly=true)

# Via oak-run (AEM stopped)
$ java -jar oak-run-*.jar datastore \
    --store /path/to/segmentstore \
    --s3ds /path/to/s3datastore.config \
    mark
```

## Sweep Phase

**Wait at least 24 hours after mark**, then:

```bash
# Via JMX (AEM running)
# BlobGCMBean → startBlobGC(markOnly=false)

# Via oak-run (AEM stopped)
$ java -jar oak-run-*.jar datastore \
    --store /path/to/segmentstore \
    --s3ds /path/to/s3datastore.config \
    sweep
```

## Time Estimates

| DataStore Size | Mark Time | Sweep Time |
|----------------|-----------|------------|
| 100 GB | ~30 min | ~1 hour |
| 500 GB | ~2 hours | ~4 hours |
| 1 TB | ~4 hours | ~8 hours |

## Configuration

### FileDataStore

```
# org.apache.jackrabbit.oak.plugins.blob.datastore.FileDataStore.config
path=/path/to/datastore
minRecordLength=4096
```

### S3 DataStore

```
# org.apache.jackrabbit.oak.plugins.blob.datastore.S3DataStore.config
accessKey=xxx
secretKey=xxx
s3Bucket=my-bucket
s3Region=us-east-1
```

## Best Practices

::: tip DataStore GC Tips
1. **Run SegmentStore GC first** - Removes references to deleted content
2. **Wait 24+ hours between mark and sweep** - Prevents deleting in-flight uploads
3. **Run during low-traffic periods** - Reduces risk of conflicts
4. **Verify with consistency check** - After GC, ensure no missing blobs
:::

## Common Issues

### Blobs Deleted Too Soon

**Symptom**: Missing binaries after GC

**Cause**: Sweep ran too soon after mark

**Prevention**: Always wait 24+ hours

### GC Not Reclaiming Space

**Causes**:
- SegmentStore GC not run first
- Checkpoints pinning old references
- Replication keeping references

**Solution**:
1. Run SegmentStore compaction
2. Remove orphaned checkpoints
3. Then run DataStore GC

## Key Takeaways

::: tip Remember
1. **Two phases** - Mark, wait 24h, sweep
2. **Run SegmentStore GC first** - Remove stale references
3. **Verify after** - Run consistency check
4. **Separate from SegmentStore GC** - Different process, different storage
:::
