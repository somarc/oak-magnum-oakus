# 🔍 Pre-Text Extraction for Re-indexing

After corruption recovery, you may need to rebuild Lucene full-text indexes. **Without pre-text extraction, this can take WEEKS on large DAM repositories.**

::: danger ⚠️ CRITICAL: Time Impact
| Repository Size | Without Pre-extraction | With Pre-extraction |
|-----------------|----------------------|---------------------|
| 50GB DAM | 3-5 days | 4-8 hours |
| 200GB DAM | 1-2 weeks | 1-2 days |
| 500GB DAM | 3-4 weeks | 3-5 days |
| 1TB+ DAM | **MONTHS** | 1-2 weeks |

**The difference is 10-100x faster re-indexing.**
:::

## Why This Matters

Full-text indexing uses **Apache Tika** to extract text from binaries (PDFs, Word docs, images with OCR, videos). This is:

- **CPU intensive** - Tika parses complex file formats
- **IO intensive** - Every binary must be read from DataStore
- **Single-threaded** - Lucene indexing is inherently sequential
- **Repeated work** - Same binaries re-extracted on every reindex

**Pre-text extraction** does the expensive work **once**, stores the results, and reuses them for all future re-indexing operations.

## The Pre-Text Extraction Workflow

<OakFlowGraph flow="pre-text-extraction" :height="480" />

### Three Phases

| Phase | Command | What It Does | When to Run |
|-------|---------|--------------|-------------|
| **1. Generate CSV** | `tika --generate` | Scans repo, lists all binary refs | System idle (reads whole repo) |
| **2. Extract Text** | `tika --extract` | Extracts text from binaries | Can run on separate machine |
| **3. Configure** | OSGi config | Points AEM at pre-extracted store | Before triggering reindex |

## Phase 1: Generate Binary List

```bash
# Connect to SegmentStore + DataStore
java -jar oak-run.jar tika \
    --fds-path /path/to/datastore \
    /path/to/segmentstore \
    --data-file binary-stats.csv \
    --generate
```

**For S3 DataStore** (faster - avoids downloading binaries):

```bash
java -jar oak-run.jar tika \
    --fake-ds-path=temp \
    /path/to/segmentstore \
    --data-file binary-stats.csv \
    --generate
```

Use the oak-run release that matches your Oak version (`oak-run-1.22.x.jar` on AEM 6.5, `oak-run-2.4.0.jar` on AEM 6.5 LTS SP3, Java 17+) — see [which LTS SP has which Oak](/reference/oak-versions). `--data-file` defaults to `oak-binary-stats.csv`; `--path` (default `/`) limits the scan to a subtree.

### Output: `binary-stats.csv`

Columns: blob id, length, `jcr:mimeType`, `jcr:encoding`, path. The first line is always the header (Oak 1.22.x and 2.4.0 alike). Keep it if you split or filter the file.

```csv
blobId,length,jcr:mimeType,jcr:encoding,jcr:path
43844ed22d640a114134e5a25550244e8836c00c#28705,28705,application/pdf,,/content/dam/reports/Q3-2024.pdf/jcr:content/renditions/original/jcr:content
a1b2c3d4e5f6...#12345,12345,image/jpeg,,/content/dam/images/hero.jpg/jcr:content/renditions/original/jcr:content
```

::: tip 💡 Timing
Run this during maintenance window - it scans the entire repository. Typical time: 30-60 minutes for 100GB repo.
:::

## Phase 2: Extract Text

You have **two options** for populating the pre-extracted text store:

### Option A: Fresh Extraction with Tika (Most Common)

```bash
java -cp oak-run.jar:tika-app-1.28.5.jar \
    org.apache.jackrabbit.oak.run.Main tika \
    --data-file binary-stats.csv \
    --store-path ./store \
    --fds-path /path/to/datastore \
    --extract
```

**Key points:**
- Downloads [tika-app](https://tika.apache.org/download.html) separately — oak-run bundles only `tika-core`/`tika-parsers` without their parser dependencies. Oak 1.22.24 and 2.4.0 are both built against Tika 1.28.5, so use that tika-app version (the Oak docs' `tika-app-1.15` example dates from Oak 1.7)
- Optional: `--pool-size <n>` (default: number of cores), `--tika-config <file>`
- Uses `-cp` not `-jar` (classpath includes both JARs)
- Can run on a **different machine** with more CPU cores
- **Incremental** - re-running skips already-processed binaries

### Option B: Reuse Existing Index Data (Faster if Available)

If you have a healthy Lucene index dump (e.g., from before corruption):

```bash
# First, dump the existing index (--index-dump takes no value; output goes to --index-out-dir, default ./indexing-result)
java -jar oak-run.jar index \
    --fds-path /path/to/datastore \
    /path/to/segmentstore \
    --index-dump --index-out-dir /path/to/dump

# Then populate from the dump
java -jar oak-run.jar tika \
    --data-file binary-stats.csv \
    --store-path ./store \
    --index-dir /path/to/dump/index-dumps/damAssetLucene/data \
    --populate
```

::: warning ⚠️ Index Dump Consistency
The index dump must be from **before** any binaries were added that aren't in `binary-stats.csv`. Otherwise you'll have gaps.
:::

### Output Files

After extraction, the `./store` directory contains:

```
./store/
├── 43/
│   └── 84/
│       └── 4e/
│           └── 43844ed22d640a114134e5a25550244e8836c00c
├── a1/
│   └── b2/
│       └── c3/
│           └── a1b2c3d4e5f6...
├── blobs_error.txt    # Binaries that failed extraction
└── blobs_empty.txt    # Binaries with no extractable text
```

Text files use the FileDataStore layout: three 2-character directory levels, file name = blob id without the `#length` suffix and without an extension.

## Phase 3: Configure AEM to Use Pre-extracted Text

### OSGi Configuration

In AEM, configure **Apache Jackrabbit Oak DataStore PreExtractedTextProvider**:

| Property | Value |
|----------|-------|
| `dir` (label "Path") | `/path/to/store` |

Or via OSGi config file:

```json
{
  "org.apache.jackrabbit.oak.plugins.blob.datastore.DataStoreTextProviderService": {
    "dir": "/path/to/store"
  }
}
```

### For oak-run Indexing

If using oak-run for offline indexing:

```bash
java -jar oak-run.jar index \
    --fds-path /path/to/datastore \
    --pre-extracted-text-dir /path/to/store \
    /path/to/segmentstore \
    --reindex --index-paths=/oak:index/damAssetLucene
```

Without `--read-write` the store is opened read-only: the new index files land in `--index-out-dir` (default `./indexing-result`) and must be imported via `IndexerMBean#importIndex` (or `--index-import --index-import-dir <dir>`). Add `--read-write` (AEM stopped) to reindex and import in one go.

## Verification

Check the `TextExtractionStats` MBean (`TextExtractionStatsMBean`) in JMX to verify pre-extraction is working:

| Metric | Expected |
|--------|----------|
| `PreExtractedTextProviderConfigured` | `true` |
| `PreFetchedCount` | Increasing during reindex (text served from the store) |
| `TextExtractionCount` | Low (only binaries missing from the store) |
| `TotalTime` | Low (little live Tika extraction) |

## When to Use Pre-Text Extraction

| Scenario | Use Pre-extraction? |
|----------|---------------------|
| **Post-corruption reindex** | ✅ **YES** - Critical for large DAM |
| **Index definition change** | ✅ YES - Saves time on full reindex |
| **Migration to new AEM version** | ✅ YES - Index rebuild required |
| **Incremental indexing** | ❌ No - Only new binaries need extraction |
| **Small repo (<10GB)** | ⚠️ Optional - Time savings may not justify setup |

## Troubleshooting

### "No pre-extracted text found"

1. Check `path` in OSGi config matches actual store location
2. Verify file naming: `xx/yy/zz/{blobId without #length}` (no extension)
3. Check `blobs_error.txt` for extraction failures

### Extraction Errors

Common causes in `blobs_error.txt`:

| Error | Cause | Solution |
|-------|-------|----------|
| `TikaException` | Corrupt binary | Skip - binary is damaged |
| `OutOfMemoryError` | Large PDF/video | Increase heap: `-Xmx4g` |
| `EncryptedDocumentException` | Password-protected | Skip - can't extract |

### Slow Extraction

- **Parallelize**: Split CSV, run on multiple machines, merge stores
- **Skip videos**: Filter CSV to exclude `video/*` MIME types
- **Use SSD**: IO-bound operation benefits from fast storage

## Official Documentation

- [Oak Pre-Extracting Text from Binaries](https://jackrabbit.apache.org/oak/docs/query/pre-extract-text.html)
- [OAK-2892](https://issues.apache.org/jira/browse/OAK-2892) - Original feature ticket

## Key Takeaways

::: tip Remember
1. **Pre-extraction is 10-100x faster** than re-extracting during reindex
2. **Phase 2 can run on a separate machine** - parallelize for speed
3. **Incremental** - re-running skips already-processed binaries
4. **Option B (index dump)** is fastest if you have a healthy index backup
5. **Verify with JMX** - `TextExtractionStats` MBean (`PreFetchedCount`) shows pre-extracted hits
6. **Plan ahead** - Generate CSV and extract text BEFORE you need to reindex
:::
