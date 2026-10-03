# 🔍 Pre-Text Extraction for Re-indexing

::: info 🎯 Scope
SegmentStore (TarMK) • Oak 1.22.x – 2.4.0 ([version scope](/reference/oak-versions))  
**Not for AEMaaCS**
:::

After corruption recovery, you may need to rebuild Lucene full-text indexes. On a large DAM, **text extraction, not the repository walk, is what makes a reindex take forever.**

::: danger ⚠️ CRITICAL: Time Impact
Measured on a real AEM 6.5 LTS SP2 author clone (Oak 1.88, 54 GB segment store, ~94,000 DAM originals holding ~184 GB of binaries), offline reindex of 49 indexes with `oak-run index`:

| | Without pre-extracted text | With pre-extracted text |
|---|---|---|
| Text extraction | Inline, one binary at a time: **~30 files/min** | Done beforehand: an index dump covered most binaries; `tika --extract --pool-size 12` handled the remaining 10,459 (10.7 GB) in **~2 min** |
| Reindex | Stalled at 600k of ~42M nodes after 18 min, aborted | Reindex + import of all 49 indexes in **1 h 15 min** |
:::

## Why This Matters

Full-text indexing uses **Apache Tika** to extract text from binaries (PDFs, Office documents, text formats). During a reindex this is:

- **CPU intensive** - Tika parses complex file formats
- **IO intensive** - Every binary must be read from the DataStore
- **Sequential** - The reindex walks the repository on one thread and extracts each binary inline, one at a time. Each extraction has a 60 s timeout (`-Doak.extraction.timeoutSeconds`); a binary that times out is indexed as a text-extraction error
- **Repeated work** - Same binaries re-extracted on every reindex

Oak's default Tika configuration maps **images** (JPEG, PNG, GIF, TIFF, BMP, PSD …) and **archives** (zip, tar, gzip …) to an empty parser: they are skipped, with no OCR. **Video is not skipped** and goes through full extraction.

**Pre-text extraction** does the expensive work **once**, in parallel, stores the results, and reuses them for future reindexing.

::: warning When the pre-extracted text is used
Only during a **reindex**, by AEM (`DataStoreTextProviderService`) or by `oak-run index --pre-extracted-text-dir`. Normal incremental indexing extracts inline unless `alwaysUsePreExtractedCache=true` is set on `LuceneIndexProviderService`. A binary missing from the store is extracted inline.
:::

## The Pre-Text Extraction Workflow

<OakFlowGraph flow="pre-text-extraction" :height="480" />

### Three Phases

| Phase | Command | What It Does | When to Run |
|-------|---------|--------------|-------------|
| **1. Generate CSV** | `tika --generate` | Scans repo, lists binary refs | System idle (reads whole repo) |
| **2. Extract Text** | `tika --extract` (or `--populate`) | Extracts text from binaries | Can run on separate machine |
| **3. Configure** | OSGi config or `--pre-extracted-text-dir` | Points the indexer at the store | Before triggering reindex |

### oak-run and tika-app

oak-run bundles `tika-core`/`tika-parsers` but **not the parser libraries** (PDFBox, POI …). For `tika --extract` **and for `index --reindex`**, put [tika-app](https://tika.apache.org/download.html) on the classpath, **after** oak-run (tika-app packages some older classes), and use `-cp` instead of `-jar`:

```bash
java -cp oak-run-<version>.jar:tika-app-1.28.5.jar org.apache.jackrabbit.oak.run.Main tika …
java -cp oak-run-<version>.jar:tika-app-1.28.5.jar org.apache.jackrabbit.oak.run.Main index …
```

Oak 1.22.24 and 2.4.0 are both built against Tika 1.28.5, so use that tika-app version. The Oak docs' `tika-app-1.15` example dates from Oak 1.7. Use the oak-run release that matches your Oak version ([which LTS SP has which Oak](/reference/oak-versions)).

::: danger Without tika-app, `index --reindex` …
- **Oak 1.44+ (every AEM 6.5 LTS SP):** refuses to start: `Missing tika parser dependencies, use --ignore-missing-tika-dep to force continue`.
- **Oak 1.22.x (AEM 6.5):** runs, but every PDF/Office binary not in the pre-extracted store is indexed **without text**. The failure is logged only at DEBUG.
:::

## Phase 1: Generate Binary List

```bash
# Connect to SegmentStore + DataStore
java -jar oak-run.jar tika \
    --fds-path /path/to/datastore \
    /path/to/segmentstore \
    --data-file binary-stats.csv \
    --generate
```

For S3, use `--s3ds=<S3DataStore .config file>` instead of `--fds-path`. Or skip DataStore access entirely: generating with an S3 DataStore can be slow because checking a binary id downloads the binary, and the fake DataStore avoids that:

```bash
java -jar oak-run.jar tika \
    --fake-ds-path=temp \
    /path/to/segmentstore \
    --data-file binary-stats.csv \
    --generate
```

`--data-file` defaults to `oak-binary-stats.csv`; `--path` (default `/`) limits the scan to a subtree.

::: warning Generate gotchas
- **`--path` drops its prefix from the CSV.** With `--path /content`, rows read `/dam/…` instead of `/content/dam/…`; add the prefix back before using the paths (e.g. for `--populate`).
- **It lists every binary**, every rendition included, and skips small binaries stored inline in segments (those are always extracted during the reindex).
- **It is slow on a large DAM:** on the clone above, generate over `/content` produced 291k rows in ~70 min before it was stopped.
:::

### Output: `binary-stats.csv`

Columns: blob id, length, `jcr:mimeType`, `jcr:encoding`, path. The first line is always the header (Oak 1.22.x and 2.4.0 alike). Keep it if you split or filter the file.

```csv
blobId,length,jcr:mimeType,jcr:encoding,jcr:path
43844ed22d640a114134e5a25550244e8836c00c#28705,28705,application/pdf,,/content/dam/reports/Q3-2024.pdf/jcr:content/renditions/original/jcr:content
a1b2c3d4e5f6...#12345,12345,image/jpeg,,/content/dam/images/hero.jpg/jcr:content/renditions/original/jcr:content
```

## Phase 2: Extract Text

You have **two options** for populating the pre-extracted text store. Both are **incremental**: re-running with the same `--store-path` skips binaries already processed.

### Option A: Fresh Extraction with Tika (Most Common)

```bash
java -Xmx16g -cp oak-run.jar:tika-app-1.28.5.jar \
    org.apache.jackrabbit.oak.run.Main tika \
    --data-file binary-stats.csv \
    --store-path ./store \
    --fds-path /path/to/datastore \
    --pool-size 12 \
    --extract
```

**Key points:**
- Needs only the **DataStore** (`--fds-path`, or `--s3ds`/`--azureblobds` with a config file), not the segment store, so it can run on a **different machine** with more cores
- `--pool-size <n>` (default: number of cores) sets the extraction threads; optional `--tika-config <file>`
- Ends with a summary: processed, extraction, empty, text written, parser error, error, not supported, already processed counts, plus bytes read and time

::: tip 💡 S3 / Azure DataStore
Don't point oak-run at AEM's own DataStore `.config` as-is: oak-run then fills the cache under its `path` (58 GB on the clone above). Use a copy with its own `path` and a small `cacheSize`.
:::

### Option B: Reuse Text From an Index Dump

`--populate` copies the stored `:fulltext` of an existing Lucene index into the store, with no Tika at all. It only works for an index that keeps each binary's text **on the binary's own node**: no aggregates, no relative property paths.

::: danger ⚠️ `damAssetLucene` does not qualify as-is
AEM's `damAssetLucene` aggregates the original rendition onto the `dam:Asset` node, so looking up a rendition path in the dump misses. Missed rows are counted as **Errored** but not recorded, and the text store stays empty for them.

**Tested workaround** (offline reindex on the clone above): keep only the original renditions and re-key each row to its asset path, then populate:

```bash
python3 - binary-stats.csv populate.csv <<'PY'
import csv, sys
SUFFIX = "/jcr:content/renditions/original/jcr:content"
with open(sys.argv[1], newline="") as src, open(sys.argv[2], "w", newline="") as dst:
    rows, out = csv.reader(src), csv.writer(dst)
    out.writerow(next(rows))                                  # keep the header
    for blob_id, length, mime, encoding, path in rows:
        if path.endswith(SUFFIX):                             # originals only
            out.writerow([blob_id, length, mime, encoding, path[:-len(SUFFIX)]])
PY
```
Run `--extract` afterwards: it skips what populate filled and extracts the rest.
:::

```bash
# 1. Dump the index (set both dirs explicitly: oak-run index empties them on every run)
java -jar oak-run.jar index \
    --fds-path /path/to/datastore \
    --index-dump --index-paths=/oak:index/damAssetLucene \
    --index-temp-dir /path/to/dump-tmp --index-out-dir /path/to/dump \
    /path/to/segmentstore

# 2. Populate from the dump (needs neither the node store nor the DataStore)
java -jar oak-run.jar tika \
    --data-file populate.csv \
    --store-path ./store \
    --index-dir /path/to/dump/index-dumps/damAssetLucene/data \
    --populate
```

The dump folder is named after the index node (e.g. `damAssetLucene-8-custom-3`); use the one the dump prints. On the clone, the `damAssetLucene` dump took 7 s (520 MB, 127,242 documents); populate read 29,143 rows in 6 s (26,822 parsed, 974 errored, 1,347 empty).

::: warning ⚠️ Index Dump Consistency
- Populate matches by **path** and stores the text under the CSV's **blob id**. If a binary was replaced after the index last caught up, its **old text** is stored for the new blob, and `--extract` then skips it. Only populate rows whose binary is unchanged since the index was last current (e.g. by `jcr:lastModified` cutoff), and extract the rest.
- Values indexed as `TextExtractionError` are copied into `blobs_error.txt`, so `--extract` never retries them.
- If the dump fails or the index is corrupt (e.g. `CorruptIndexException`), fall back to Option A.
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
├── blobs_error.txt    # Blob ids whose extraction failed
└── blobs_empty.txt    # Blob ids with no extractable text
```

Text files use the FileDataStore layout: three 2-character directory levels, file name = blob id without the `#length` suffix and without an extension. `blobs_*.txt` hold blob ids only, one per line (the error reasons are in the oak-run output), and are written only when non-empty.

## Phase 3: Configure the Indexer to Use Pre-extracted Text

### OSGi Configuration (reindex inside AEM)

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

The directory must exist, or the component fails to activate and AEM keeps extracting inline. To use the store outside a reindex too, set `alwaysUsePreExtractedCache=true` on `org.apache.jackrabbit.oak.plugins.index.lucene.LuceneIndexProviderService`.

### For oak-run Indexing

If using oak-run for offline indexing:

```bash
java -Xmx24g -cp oak-run.jar:tika-app-1.28.5.jar org.apache.jackrabbit.oak.run.Main index \
    --fds-path /path/to/datastore \
    --pre-extracted-text-dir /path/to/store \
    --index-temp-dir /path/to/work/tmp --index-out-dir /path/to/work/out \
    /path/to/segmentstore \
    --reindex --index-paths=/oak:index/damAssetLucene
```

- The log confirms the store is in use: `Using pre-extracted text directory /path/to/store`.
- `--index-out-dir` (default `./indexing-result`) and `--index-temp-dir` (default `./temp`) are **emptied on every run**; never point them at anything you want to keep.
- Without `--read-write` the store is opened read-only: the new index files land in `--index-out-dir` and must be imported via `IndexerMBean#importIndex` (or `--index-import --index-import-dir <dir>`). Add `--read-write` (AEM stopped) to reindex and import in one go.
- The store only helps the reindex itself. The catch-up after the import, and AEM's later updates, extract inline.

## Verification

Check the `TextExtractionStats` MBean (`org.apache.jackrabbit.oak:name=TextExtraction statistics,type=TextExtractionStats`) in JMX to verify pre-extraction is working in AEM:

| Metric | Expected |
|--------|----------|
| `PreExtractedTextProviderConfigured` | `true` |
| `AlwaysUsePreExtractedCache` | `true` only if you set it (otherwise the store is used for reindex only) |
| `PreFetchedCount` | Increasing during reindex (text served from the store) |
| `TextExtractionCount` | Low (only binaries missing from the store) |
| `TimeoutCount` | Low (each timeout is a binary indexed without text) |

For oak-run, check the `Using pre-extracted text directory` log line and the `Text extraction stats` count in its indexing log. Treat the time figures in that stats line as unreliable.

## When to Use Pre-Text Extraction

| Scenario | Use Pre-extraction? |
|----------|---------------------|
| **Post-corruption reindex** | ✅ **YES** - Critical for large DAM |
| **Index definition change** | ✅ YES - Saves time on full reindex |
| **Migration with an index rebuild** | ✅ YES |
| **Incremental indexing** | ❌ No - The store is consulted only during reindex (unless `alwaysUsePreExtractedCache=true`) |
| **Small repo (<10GB)** | ⚠️ Optional - Time savings may not justify setup |

## Troubleshooting

### "No pre-extracted text found"

1. Check `dir` in the OSGi config matches the actual store location, and that the directory exists
2. Verify file naming: `xx/yy/zz/{blobId without #length}` (no extension)
3. Check `blobs_error.txt` for blob ids whose extraction failed
4. oak-run: look for the `Using pre-extracted text directory` log line
5. Outside a reindex, the store is only used with `alwaysUsePreExtractedCache=true`

### Extraction Errors

`blobs_error.txt` only lists the blob ids; the reasons are in the oak-run output:

| Error | Cause | Solution |
|-------|-------|----------|
| `Missing tika parser dependencies` / `NoClassDefFoundError: org/apache/pdfbox/…` | tika-app not on the classpath | `-cp oak-run.jar:tika-app-1.28.5.jar …` |
| `TikaException` | Corrupt binary | Skip - binary is damaged |
| `OutOfMemoryError` | Large PDF/video | Increase heap (`-Xmx16g` for extract, `-Xmx24g` for the reindex in the example above) |
| `EncryptedDocumentException` | Password-protected | Skip - can't extract |

### Slow Extraction

- **Parallelize**: raise `--pool-size`, or split the CSV, run on multiple machines, and merge the stores, **including** `blobs_error.txt` and `blobs_empty.txt`
- **Skip videos**: filter `video/*` out of the CSV (Oak's default Tika config does not skip video)
- **Use SSD**: IO-bound operation benefits from fast storage

## Official Documentation

- [Oak Pre-Extracting Text from Binaries](https://jackrabbit.apache.org/oak/docs/query/pre-extract-text.html)
- [OAK-2892](https://issues.apache.org/jira/browse/OAK-2892) - Original feature ticket

## Key Takeaways

::: tip Remember
1. **Extraction dominates a DAM reindex** - inline it ran at ~30 files/min; pre-extracted, 49 indexes rebuilt in 1 h 15 min
2. **Put tika-app on the classpath** for both `tika --extract` and `index --reindex`
3. **Phase 2 can run on a separate machine** - parallelize with `--pool-size`
4. **Incremental** - re-running skips already-processed binaries
5. **Option B (index dump)** works only for indexes that keep text on the binary's node; `damAssetLucene` needs its CSV re-keyed to asset paths
6. **The store is for reindexing** - verify via the `Using pre-extracted text directory` log line or the `TextExtractionStats` MBean
7. **Plan ahead** - Generate CSV and extract text BEFORE you need to reindex
:::
