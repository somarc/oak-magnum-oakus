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

### Output: `binary-stats.csv`

```csv
43844ed22d640a114134e5a25550244e8836c00c#28705,28705,"application/pdf",,"/content/dam/reports/Q3-2024.pdf/jcr:content/renditions/original/jcr:content"
a1b2c3d4e5f6...#12345,12345,"image/jpeg",,"/content/dam/images/hero.jpg/jcr:content/renditions/original/jcr:content"
```

::: tip 💡 Timing
Run this during maintenance window - it scans the entire repository. Typical time: 30-60 minutes for 100GB repo.
:::

## Phase 2: Extract Text

You have **two options** for populating the pre-extracted text store:

### Option A: Fresh Extraction with Tika (Most Common)

```bash
java -cp oak-run.jar:tika-app-1.15.jar \
    org.apache.jackrabbit.oak.run.Main tika \
    --data-file binary-stats.csv \
    --store-path ./store \
    --fds-path /path/to/datastore \
    extract
```

**Key points:**
- Downloads [tika-app](https://tika.apache.org/download.html) separately
- Uses `-cp` not `-jar` (classpath includes both JARs)
- Can run on a **different machine** with more CPU cores
- **Incremental** - re-running skips already-processed binaries

### Option B: Reuse Existing Index Data (Faster if Available)

If you have a healthy Lucene index dump (e.g., from before corruption):

```bash
# First, dump the existing index
java -jar oak-run.jar index \
    --fds-path /path/to/datastore \
    /path/to/segmentstore \
    --index-dump /path/to/dump

# Then populate from the dump
java -jar oak-run.jar tika \
    --data-file binary-stats.csv \
    --store-path ./store \
    --index-dir /path/to/dump/index-dumps/damAssetLucene/data \
    populate
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
│       └── 43844ed22d640a114134e5a25550244e8836c00c#28705.txt
├── a1/
│   └── b2/
│       └── a1b2c3d4e5f6...#12345.txt
├── blobs_error.txt    # Binaries that failed extraction
└── blobs_empty.txt    # Binaries with no extractable text
```

## Phase 3: Configure AEM to Use Pre-extracted Text

### OSGi Configuration

In AEM, configure **Apache Jackrabbit Oak DataStore PreExtractedTextProvider**:

| Property | Value |
|----------|-------|
| `path` | `/path/to/store` |

Or via OSGi config file:

```json
{
  "org.apache.jackrabbit.oak.plugins.index.lucene.PreExtractedTextProviderImpl": {
    "path": "/path/to/store"
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

## Verification

Check `TextExtractionStatsMBean` in JMX to verify pre-extraction is working:

| Metric | Expected |
|--------|----------|
| `PreExtractedTextProviderConfigured` | `true` |
| `PreExtractedTextHits` | Increasing during reindex |
| `PreExtractedTextMisses` | Low (only new binaries) |
| `ExtractionTime` | Near zero (using cached text) |

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
2. Verify file naming: `{blobId}.txt` format
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
5. **Verify with JMX** - `TextExtractionStatsMBean` shows hit rate
6. **Plan ahead** - Generate CSV and extract text BEFORE you need to reindex
:::
