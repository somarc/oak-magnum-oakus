# 📊 count-nodes Command

::: info 🎯 Scope
SegmentStore (TarMK) • Oak 1.22.x – 2.4.0 ([version scope](/reference/oak-versions))  
**Not for AEMaaCS**
:::

::: warning ⚠️ Not in Apache Oak
`:count-nodes`, `:remove-nodes` and `:remove-node` are not part of Apache Jackrabbit Oak (any version). They come from a community fork. See [Fork-only console commands](/reference/oak-versions#fork-only-console-commands) for how to get a build that matches your Oak version.
:::

The `count-nodes` command traverses the repository tree, counting nodes and detecting corruption.

## Usage

```bash
$ java -jar oak-run-*.jar console /path/to/segmentstore

> :count-nodes

# To read DataStore binaries (datastore-binaries, deep), start the console with your DataStore option
$ java -jar oak-run-*.jar console --fds-path /path/to/datastore /path/to/segmentstore
```

## What It Does

1. **Traverses entire tree** from root (always `/` — there is no path argument)
2. **Counts all nodes** encountered (progress printed every 50,000 nodes)
3. **Detects SegmentNotFoundException** for corrupted paths (and missing blobs, if a binary option is given)
4. **Logs corrupted paths** to `count-nodes-snfe-YYYYMMDD-HHmmss.log` in the **current directory** (where you started oak-run)

## Output

### Normal Operation

```
Raw args: []
Received options: segment-binaries=false, datastore-binaries=false, analysis=false
Counting nodes in tree /
  50000
  100000
...
Total nodes in tree /: 156789
Total binaries in tree /: 4321
Total missing segments: 0
Total missing blobs: 0
```

### With Corruption

```
Counting nodes in tree /
  50000
Warning: Missing segment at /content/dam/2024/Q3/: Segment abc123... not found
  100000
...
Total nodes in tree /: 145678
Total binaries in tree /: 4321
Total missing segments: 3
Total missing blobs: 0
Unique segment ID occurrences:
Segment ID abc123...: 3 occurrences
```

## Options

```bash
# Nodes only, skip reading binaries (fastest)
# (it misses damaged bulk segments, i.e. the content of binaries stored in the segment store)
> :count-nodes

# Read only segment-embedded blobs
> :count-nodes segment-binaries

# Read only DataStore blobs
> :count-nodes datastore-binaries

# Read all blobs (segment + DataStore) - slowest, most thorough
> :count-nodes deep

# Add grouped analysis with recovery hints (combine with any of the above)
# (deep / datastore-binaries: console started with --fds-path / --s3ds / --azureblobds)
> :count-nodes deep analysis
```

`segment-binaries`, `datastore-binaries` and `deep` are mutually exclusive. `datastore-binaries` and `deep` need the console started with your DataStore options (`--fds-path`, `--fds`, `--s3ds` or `--azureblobds`); without them every external binary is reported as a missing blob (`… without specifying BlobStore`).

::: warning What the fork code actually does (lab, Oak 1.22.24 and 2.4.0 builds)
Lab store: three binaries, two of them in a FileDataStore, one of those deleted from it.

| Console started with | Command | Reported |
|---|---|---|
| no DataStore option | `:count-nodes deep analysis` | **both** DataStore binaries: `Warning: Missing blob (segment) at …: Attempt to read external blob with blobId [<id>] without specifying BlobStore` |
| `--fds-path ds` | `:count-nodes deep analysis` | only the deleted one: `Warning: Missing blob (datastore) at …: …DataStoreException: Record <id> does not exist` |
| `--fds-path` with a typo (directory doesn't exist) | `:count-nodes datastore-binaries` | **both**, as `DataStoreException: Record … does not exist`; the empty directory is created silently |
| no DataStore option | `:count-nodes segment-binaries` or bare `:count-nodes` | nothing (DataStore binaries are skipped) |

Without the option, a healthy binary and a missing one look the same, and the console labels both `(segment)`. `:remove-nodes` logs those `without specifying BlobStore` lines as `[WARN]` and deletes nothing (lab: real run on a copy). The typo case is the dangerous one: those lines are deletable, and the dry run listed a healthy asset for deletion.

A second store with one **bulk segment** removed (the content of a 300 KB binary held in the segment store): bare `:count-nodes` reported nothing, `:count-nodes segment-binaries` reported `Warning: Missing blob (segment) at /content/site/big.bin/jcr:content/: Segment <id> not found`. (`oak-run check` without `--bin` passed that store too.)
:::

## Log File Format

```
# ./count-nodes-snfe-20240111-093500.log

CountNodesCommand Log - Started at ...
Starting node traversal at /
Progress: 50000 nodes processed
Warning: Missing segment at /content/dam/2024/Q3/corrupted-asset.pdf/: Segment abc123... not found
Warning: Missing blob at /content/dam/2024/Q3/another-file.jpg/jcr:content/renditions/original/jcr:content/: ...DataStoreException: Record ... does not exist
  -> Blob type: datastore (external=true)
Warning: Unable to read node /var/audit/2024/01/15/entry-123/: ...
Summary: nodes=145678, binaries=4321, missingSegments=3, missingBlobs=1
...
Execution completed at ...
```

Problem lines start with `Warning: Missing segment at`, `Warning: Missing blob at` or `Warning: Unable to read node`, followed by the path (ending in `/`) and the exception message.

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
> :count-nodes segment-binaries
# Review log file for corrupted paths
# (bare :count-nodes would miss damaged binary content in the segment store)
```

### Before Surgical Removal

```bash
> :count-nodes segment-binaries analysis
# or "deep analysis" in a console started with your DataStore option
# Log file becomes input for remove-nodes (use the exact file name - no wildcards)
> :remove-nodes count-nodes-snfe-YYYYMMDD-HHmmss.log dry-run
```

::: info `:remove-nodes` skips `Missing segment` lines
`:remove-nodes` deletes for `Missing blob … DataStoreException: Record` lines (not for `… without specifying BlobStore` or `… Segment … not found` blob lines; in the lab it also skipped DataStore lines written by a `--read-write` console, see [Surgical Removal](/recovery/surgical#step-2-review-the-log)), `Unable to read node` lines, and datastore-consistency `aa/bb/cc/<hex>,<path>` lines, refuses paths shallower than 3 levels (a missing DAM `renditions/original` blob deletes the **whole asset** node), and writes its report to `remove-nodes-YYYYMMDD-HHmmss.log` in the current directory. `Warning: Missing segment at …` lines are only logged as `[WARN]` — remove those paths one at a time with `:remove-node <path>` (the report prints the exact command; needs `--read-write`, no dry-run). Real (non-dry-run) removal needs `console --read-write`.
:::

### Repository Health Check

```bash
> :count-nodes segment-binaries
# If no corruption, the segment store is healthy
# (DataStore binaries: "deep" with your DataStore option, or datastorecheck)
```

## Key Takeaways

::: tip Remember
1. **Traverses entire tree** - Comprehensive scan
2. **Logs corruption** - Creates file for remove-nodes
3. **Time-consuming** - Plan for hours on large repos
4. **Non-destructive** - Read-only operation
:::

::: info 📅 Last Updated
Content last reviewed: October 2026 • Verified against Oak 1.22.24 (AEM 6.5) and Oak 2.4.0 (AEM 6.5 LTS SP3)
:::
