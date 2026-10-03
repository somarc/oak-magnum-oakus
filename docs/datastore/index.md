# 💾 DataStore Tools

The DataStore stores binary content (images, PDFs, videos) separately from the segment store.

## DataStore Types

| Type | Storage | Use Case |
|------|---------|----------|
| **FileDataStore** | Local filesystem | On-premise, single instance |
| **S3DataStore** | Amazon S3 | Cloud, scalable |
| **AzureDataStore** | Azure Blob Storage | Azure deployments |
| **SharedS3DataStore** | S3 with shared access | Multi-instance clusters |

## Common Operations

### Consistency Check

Verify all blob references in the repository point to existing blobs:

```bash
# AEM stopped: datastorecheck opens the segment store read-write
java -jar oak-run-*.jar datastorecheck --consistency \
    --fds /path/to/FileDataStore.config \
    --store /path/to/segmentstore \
    --repoHome /path/to/crx-quickstart/repository \
    --dump /tmp/datastore-check
```

`--fds` / `--s3ds` / `--azureblobds` take the DataStore's OSGi **config file** (for a FileDataStore: a file with `path=/path/to/datastore`), not the datastore directory.

### Garbage Collection

Remove unreferenced blobs from the DataStore:

```bash
# Mark only (writes this repository's references; deletes nothing)
java -jar oak-run-*.jar datastore --collect-garbage true \
    --fds-path /path/to/datastore \
    /path/to/segmentstore

# Mark + sweep (deletes unreferenced blobs older than --max-age, default 86400 s)
java -jar oak-run-*.jar datastore --collect-garbage \
    --fds-path /path/to/datastore \
    /path/to/segmentstore
```

There is no separate `mark`/`sweep` sub-command: `--collect-garbage [markOnly]` runs mark only with `true`, mark **and** sweep without it. The segment store path is a positional argument (no `--store`). Use `--fds-path <dir>` or `--fds <config file>` for a FileDataStore, `--s3ds`/`--azureblobds <config file>` for cloud stores.

::: warning ⚠️ DataStore GC Timing
- Blobs modified within `--max-age` (default 24 h; online: `blobGcMaxAgeInSecs`, default 86400) before the mark start are never swept - that is what protects in-flight uploads
- On a **shared** DataStore, run mark-only on every other repository first; the sweep stops with `Not all repositories have marked references available` until every registered `repository-<id>` has a `references-<id>…` record
- Never run sweep without recent marks from all sharing repositories
:::

## Detailed Guides

- [Consistency Check](/datastore/consistency) - Verify blob integrity
- [Garbage Collection](/datastore/gc) - Reclaim blob storage space
