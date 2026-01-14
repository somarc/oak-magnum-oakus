# 🔍 DataStore Consistency Check

The DataStore consistency check verifies that all binary references in the repository point to existing blobs.

## When to Use

- After DataStore GC
- When suspecting missing binaries
- Before/after migration
- Regular health checks

## Basic Usage

```bash
$ java -jar oak-run-*.jar datastorecheck \
    --store /path/to/segmentstore \
    --s3ds /path/to/s3datastore.config \
    --dump /path/to/output
```

## DataStore Types

### FileDataStore

```bash
$ java -jar oak-run-*.jar datastorecheck \
    --store /path/to/segmentstore \
    --fds /path/to/datastore \
    --dump /path/to/output
```

### S3 DataStore

```bash
$ java -jar oak-run-*.jar datastorecheck \
    --store /path/to/segmentstore \
    --s3ds /path/to/s3datastore.config \
    --dump /path/to/output
```

### Azure DataStore

```bash
$ java -jar oak-run-*.jar datastorecheck \
    --store /path/to/segmentstore \
    --azureds /path/to/azuredatastore.config \
    --dump /path/to/output
```

## Output Files

The check creates several files in the dump directory:

| File | Contents |
|------|----------|
| `blob-refs.txt` | All blob references in repository |
| `blob-ids.txt` | All blobs in DataStore |
| `missing-blobs.txt` | References with no matching blob |
| `unreferenced-blobs.txt` | Blobs with no reference |

## Interpreting Results

### Healthy

```
Blob references: 45,231
Blobs in DataStore: 45,500
Missing blobs: 0
Unreferenced blobs: 269

✅ All references have matching blobs
```

### Problems

```
Blob references: 45,231
Blobs in DataStore: 45,100
Missing blobs: 131
Unreferenced blobs: 0

❌ 131 references point to missing blobs
```

## Fixing Missing Blobs

If blobs are missing:

1. **Check backup** - Restore missing blobs from backup
2. **Check replication** - May exist on other instance
3. **Accept loss** - Remove references to missing blobs

### Finding Affected Content

```bash
# missing-blobs.txt contains blob IDs
# Find which content references them:

$ java -jar oak-run-*.jar console /path/to/segmentstore

> :binary-paths
# Lists all paths with binary references
```

## Key Takeaways

::: tip Remember
1. **Run after DataStore GC** - Verify nothing was incorrectly deleted
2. **Missing blobs = data loss** - Binary content is gone
3. **Unreferenced blobs = wasted space** - Safe to delete via GC
4. **Check before migration** - Ensure consistency before moving
:::
