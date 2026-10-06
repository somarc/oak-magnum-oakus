# 💾 DataStore Tools

The DataStore stores binary content (images, PDFs, videos) separately from the segment store.

## DataStore Types

| Type | Storage | Use Case | Reading one blob |
|------|---------|----------|------------------|
| **FileDataStore** | Local filesystem | On-premise, single instance | A file read, local or network disk |
| **S3DataStore** | Amazon S3 | Cloud, scalable | An HTTP request; the whole blob is downloaded into the local cache first |
| **AzureDataStore** | Azure Blob Storage | Azure deployments | An HTTP request; the whole blob is downloaded into the local cache first |
| **SharedS3DataStore** | S3 with shared access | Multi-instance clusters | Same as S3DataStore |

## 🐢 Reading Binaries Is the Expensive Part {#binary-io}

Most DataStore work only lists blob IDs. Some work streams the binaries themselves, every byte of every blob in scope, and that is where hours turn into weeks. On a FileDataStore the bytes sit on a disk next to AEM. On S3 or Azure every blob is a separate HTTP request, and reading terabytes that way doesn't fit in any enterprise maintenance window.

### Which Operations Read the Bytes

| Operation | What it reads | On S3 / Azure |
|-----------|---------------|---------------|
| `datastorecheck --consistency`, `datastore --check-consistency`, BlobGC MBean `checkConsistency()` | Blob IDs only | One list request per page of IDs |
| DataStore GC (mark + sweep) | Blob IDs only, then deletes | Same listing, plus a metadata request and a delete per orphan |
| `:count-nodes datastore-binaries` / `deep` ⚠️ fork only | Every byte of every DataStore blob in HEAD, **one blob at a time** | One download per blob, sequential |
| Full-text reindex (inline extraction) | Every binary the index covers, one at a time, then Tika parses it | One download per binary, plus parsing |
| `tika --generate` against the real DataStore | Each binary, to check its ID | Use `--fake-ds-path` instead ([Pre-Text Extraction](/recovery/pre-text-extraction#phase-1-generate-binary-list)) |
| `tika --extract` | Every binary in the CSV, `--pool-size` at a time | Parallel downloads |
| `oak-upgrade --copy-binaries` | Every binary it copies | A full copy of the DataStore |

### What S3 and Azure Add

- **A request per blob.** A FileDataStore read is a file open. An S3 or Azure read is an HTTP request; AWS's own guidance puts the median latency of small GETs in the tens of milliseconds. A sequential reader pays it once per blob, and a DAM has a blob for every rendition, not just every asset.
- **The local cache.** Before the first byte reaches the reader, the whole blob is downloaded into the cache under the config's `path` (default `cacheSize` 64 GB; with `cacheSize=0`, into a temp file). Terabytes read through AEM's own cache push out the binaries AEM normally serves from it. For oak-run, use a copy of the `.config` with its own `path` and a small `cacheSize` ([why](/recovery/pre-text-extraction#option-a-fresh-extraction-with-tika-most-common)).
- **The bill.** Requests are billed per call. When the reader runs outside the bucket's region, or on-premise, every byte read is also billed as data transfer out.

### Budget It Before You Start

For one sequential reader:

```
time ≈ blobs × request latency + bytes ÷ throughput
```

Arithmetic, not a benchmark: 5 million blobs, 10 TB, one reader such as `:count-nodes`:

| DataStore | Assumed latency / throughput | Waiting on requests | Moving bytes | Total |
|-----------|------------------------------|---------------------|--------------|-------|
| FileDataStore, local SSD | 0.1 ms / 500 MB/s | 8 min | 5.6 h | **~6 hours** |
| FileDataStore, NFS / SAN | 1 ms / 150 MB/s | 1.4 h | 18.5 h | **~20 hours** |
| S3 / Azure, same region | 30 ms / 100 MB/s | 42 h | 28 h | **~3 days** |
| S3 / Azure, from on-premise | 100 ms / 30 MB/s | 5.8 days | 3.9 days | **~10 days** |

Put in your own blob count and measured numbers. On S3 and Azure the blob count matters as much as the terabytes. And that is before anything parses a file: on the clone measured in [Pre-Text Extraction](/recovery/pre-text-extraction), a reindex extracting text inline ran at **~30 files/min**. At that rate, 94,000 DAM originals take ~52 hours, and a million binaries take ~23 days.

### The Index Bill Comes Next

A DataStore incident rarely ends at the DataStore. Missing Lucene index files mean a reindex. A [death loop](/checkpoints/death-loop) ends in [checkpoint advancement](/checkpoints/checkpoint-advancement), and then a reindex. Recovering a corrupted repository often means rebuilding the DAM full-text indexes. Every full-text reindex reads every binary it covers, inline, one at a time: the sequential reader from the table above, with parsing on top.

Plan **[binary pre-extraction](/recovery/pre-text-extraction)** as part of the recovery, not after it: generate the binary list with `--fake-ds-path`, extract in parallel on a machine close to the bucket, then reindex against the store. On the measured clone, the reindex went from aborted (600k of ~42M nodes after 18 min) to all 49 indexes rebuilt in 1 h 15 min. The extraction is incremental, so a store kept current before an incident is the cheapest one you will ever have.

::: tip 🌊 So many ways to pain, so few roads to smooth seas
1. **List, don't read.** When an ID-level check can answer the question, use it.
2. **Read only what you must.** Scope `tika --generate` with `--path`, and filter the CSV: Oak's default Tika config already skips images and archives, but not video.
3. **Read close to the data, in parallel.** Run in the bucket's region and raise `--pool-size`, or split the CSV across machines. `:count-nodes` reads one blob at a time.
4. **Give oak-run its own cache.** A copy of the DataStore config with its own `path` and a small `cacheSize`.
5. **Pre-extract before you reindex**, ideally before you need to.
6. **Budget from the blob count**, not just the terabytes.
:::

## Common Operations

### Consistency Check

Verify all blob references in the repository point to existing blobs. It lists blob IDs and reads no binary content:

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
# --ds-read-write is what allows it to delete
java -jar oak-run-*.jar datastore --collect-garbage --ds-read-write \
    --fds-path /path/to/datastore \
    /path/to/segmentstore
```

There is no separate `mark`/`sweep` sub-command: `--collect-garbage [markOnly]` runs mark only with `true`, mark **and** sweep without it. Without `--ds-read-write`, the sweep deletes nothing and still exits `0`; never add `--verbose` or `--read-write` ([why](/datastore/gc#running-it)). The segment store path is a positional argument (no `--store`). Use `--fds-path <dir>` or `--fds <config file>` for a FileDataStore, `--s3ds`/`--azureblobds <config file>` for cloud stores.

::: warning ⚠️ DataStore GC Timing
- Blobs modified within `--max-age` (default 24 h; online: `blobGcMaxAgeInSecs`, default 86400) before the mark start are never swept - that is what protects in-flight uploads
- On a **shared** DataStore, run mark-only on every other repository first; the sweep stops with `Not all repositories have marked references available` until every registered `repository-<id>` has a `references-<id>…` record
- Never run sweep without recent marks from all sharing repositories
- A cloned environment pointed at the same DataStore shares it too, usually with the same repository ID: see [Cloned Environments](/datastore/gc#cloned-environments)
:::

## Detailed Guides

- [Consistency Check](/datastore/consistency) - Verify blob integrity
- [Garbage Collection](/datastore/gc) - Reclaim blob storage space
- [Pre-Text Extraction](/recovery/pre-text-extraction) - Take binary reads off the reindex's critical path
