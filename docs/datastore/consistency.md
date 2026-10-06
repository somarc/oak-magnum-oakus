# 🔍 DataStore Consistency Check

::: info 🎯 Scope
SegmentStore (TarMK) with an external DataStore (File, S3, Azure) • Oak 1.22.x – 2.4.0 ([version scope](/reference/oak-versions))  
**Not for AEMaaCS**
:::

A consistency check answers one question: does every binary the repository references still exist in the DataStore? Four tools can answer it, and they don't look at the same references. Pick the tool first, then read its output the way that tool means it.

## 🔍 Signals {#signals}

- `DataStoreException: Record <id> does not exist` in `error.log`
- Reindexing or text extraction failing on binaries
- After DataStore GC, especially when more than one repository uses the DataStore
- Before and after a migration, or a copy or sync of the DataStore
- Regular health checks

## 🧭 Choose the Tool {#choose-the-tool}

| Tool | AEM | References it checks | Reads content | Paths |
|------|-----|----------------------|---------------|-------|
| [`datastorecheck --consistency`](#datastorecheck) | Stopped | Everything still in the store; HEAD only with `--verbose` | No | With `--verbose` |
| [`datastore --check-consistency`](#datastore-check-consistency) | Stopped | Everything still in the store; HEAD only with `--verbose` | No | With `--verbose` |
| [BlobGarbageCollection MBean](#online-check) | Running | Everything still in the store | No | No |
| [`:count-nodes`](#count-nodes) ⚠️ fork only | Stopped | HEAD only | Yes, every byte | Always |

"Everything still in the store" means the binary-reference index of every TAR file in the retained GC generations: HEAD, older revisions that GC has not reclaimed yet, and checkpoints. "HEAD only" means a walk of the current tree from `/`.

- **AEM has to stay up**: use the MBean.
- **You need to know which content is affected**: `datastorecheck --consistency --verbose`.
- **Indexing fails but HEAD looks clean**: run without `--verbose`. Only that mode sees blobs that a checkpoint still references.
- **Blobs exist but reads fail**: `:count-nodes datastore-binaries`. It is the only tool that reads the content.

### What Each Check Can See {#what-each-check-can-see}

| Situation | Without `--verbose` (and the MBean) | With `--verbose` | `:count-nodes` |
|-----------|-------------------------------------|------------------|----------------|
| **Blob missing, referenced in HEAD** | ✅ Reported, ID only | ✅ Reported with its node path | ✅ `Missing blob at <path>` |
| **Blob missing, referenced only by a checkpoint or an older revision** | ✅ Reported, ID only | ❌ Not checked | ❌ Not visited |
| **Blob file present but unreadable** (permissions, I/O error) | ❌ Not detected: IDs are listed, content is never read | ❌ Not detected | ✅ Reported as a missing blob |
| **S3 or Azure unreachable** | The run fails while listing blob IDs | The run fails | Every read fails, so every blob is reported missing. Confirm before you delete anything |
| **Blob in the DataStore, referenced by nothing** | Not reported (only DataStore GC computes orphans) | Not reported | Not visited |

None of the tools compares a blob's bytes with its ID, so a file with the right name and the wrong content passes all of them.

If the run without `--verbose` reports more missing blobs than the run with it, the extra blobs are referenced only outside HEAD. References from old revisions go away once GC reclaims those generations. References held by a checkpoint matter as long as something reads that checkpoint, as the async indexer does: see [Checkpoint Advancement](/checkpoints/checkpoint-advancement).

## ▶️ Run the Check {#run-the-check}

### `datastorecheck --consistency` {#datastorecheck}

```bash
# AEM stopped: datastorecheck opens the segment store read-write
$ java -jar oak-run-*.jar datastorecheck --consistency \
    --store /path/to/segmentstore \
    --fds /path/to/FileDataStore.config \
    --repoHome /path/to/crx-quickstart/repository \
    --dump /path/to/output
```

| DataStore | Option | Value |
|-----------|--------|-------|
| FileDataStore | `--fds` | OSGi config file, for example a file containing `path=/path/to/datastore` |
| S3 | `--s3ds` | `S3DataStore.config` |
| Azure | `--azureblobds` | `AzureDataStore.config` |

The DataStore options take the OSGi **config file**, not the datastore directory. One of `--id`, `--ref`, `--consistency` is required; `--store` is required for `--ref`/`--consistency`, `--repoHome` for `--consistency`. `--dump` defaults to `java.io.tmpdir`. Same options in Oak 1.22 and 2.4, except `--verboseRootPath` *(since Oak 1.26 — not in AEM 6.5)*.

`--repoHome` must be the real repository home. The check reads `<repoHome>/blobids/*.del`, the Lucene index blobs Oak deleted on purpose, and leaves them out of the report. With a wrong path it prints `Skipping active deleted tracked as parameter [repoHome] : [<path>] incorrect` and reports those blobs as missing too.

`--verbose` adds the path of each `jcr:data` property and changes what is checked: see [What each check can see](#what-each-check-can-see).

#### Output files

The check keeps one file per **requested** operation (and only if non-empty) in the dump directory, named after the option plus a millisecond timestamp:

| File | Contents |
|------|----------|
| `[id]<timestamp>` | All blob IDs in the DataStore (needs `--id`) |
| `[ref]<timestamp>` | `blobId,nodeId` references from the repository (needs `--ref`; property paths with `--verbose`) |
| `[consistency]<timestamp>` | References whose blob is **missing** from the DataStore |

There is no "unreferenced blobs" file - orphans are only computed by DataStore GC.

#### Reading the output

Healthy:

```
Starting dump of blob ids
45500 blob ids found
Finished in 12 seconds
Starting dump of blob references
45231 blob references found
Finished in 340 seconds
Starting consistency check
Consistency check found 0 missing blobs
Finished in 1 seconds
```

Missing blobs:

```
...
Starting consistency check
Consistency check found 131 missing blobs
Consistency check failure for the data store
Finished in 1 seconds
[consistency] - /path/to/output/[consistency]1736760000000
```

### `datastore --check-consistency` {#datastore-check-consistency}

```bash
# The segment store path is positional; --fds-path takes the directory
$ java -jar oak-run-*.jar datastore --check-consistency \
    --fds-path /path/to/datastore \
    /path/to/segmentstore
```

It opens the segment store read-only; to check a running instance, use the [MBean](#online-check) instead. Use `--fds-path <dir>` or `--fds <config file>` for a FileDataStore, `--s3ds`/`--azureblobds <config file>` for cloud stores. `--out-dir` defaults to `datastore-out`. In Oak 2.4, `--check-consistency` also accepts an optional `markOnly` boolean *(since Oak 1.54 — not in AEM 6.5)*.

The run logs `Consistency check found [N] missing blobs`, one `Missing Blob [<id>]` line per missing blob, then `Consistency check failure in the the blob store : …, check missing candidates in file …/gccand-…` and `Found N missing blobs`. The result is a file named `gccand`: read [The Dangerous Misinterpretation](#the-dangerous-misinterpretation) before you act on it.

#### On a shared DataStore {#shared-datastore}

Oak treats every FileDataStore, S3 and Azure DataStore as shared, even when only one repository uses it ([repository IDs](#repository-ids)). On these stores, `datastore --check-consistency` and the MBean's `checkConsistency()` also touch the GC bookkeeping:

- They merge the `references-*` records of every repository into the check, so the report includes blobs that other repositories reference.
- When they finish, they **delete every `references-*` and `markedTimestamp-*` record**, for all repositories. Run mark-only on every sharing repository again before the next sweep.
- *(Since Oak 1.54 — not in AEM 6.5)* They first mark this repository, then stop with `Not all repositories have marked references available` if any `repository-<id>` has no references record. A stale marker blocks the check as it blocks the sweep.

`datastorecheck` doesn't touch these records.

### Online: BlobGarbageCollection MBean {#online-check}

```
# AEM running, JMX:
# org.apache.jackrabbit.oak:type=BlobGarbageCollection → checkConsistency()
#   then poll getConsistencyCheckStatus()
```

The check runs in the background and ends with `Consistency check completed in … N missing blobs found (details in the log).` It checks the same references as `datastore` without `--verbose`, so `error.log` gets the same `Missing Blob [<id>]` lines, with IDs only. The `gcworkdir-<timestamp>` directory goes to the JVM's temp directory (`java.io.tmpdir`). The [shared DataStore](#shared-datastore) behavior applies. Available in Oak 1.22 and 2.4.

### `:count-nodes` {#count-nodes}

::: warning ⚠️ Not in Apache Oak
`:count-nodes` and `:remove-nodes` are not part of Apache Jackrabbit Oak (any version). They come from a community fork. See [Fork-only console commands](/reference/oak-versions#fork-only-console-commands) for how to get a build that matches your Oak version.
:::

```bash
$ java -jar oak-run-*.jar console \
    --fds-path /path/to/datastore /path/to/segmentstore

> :count-nodes datastore-binaries analysis
# Reads every DataStore blob end to end, walking HEAD from /
# Warnings go to count-nodes-snfe-yyyyMMdd-HHmmss.log (console's working directory)
```

`datastore-binaries` reads the blobs in the DataStore; `deep` also reads binaries stored inside segments, which takes longer. Each failure is logged as `Warning: Missing blob at <path>: …`.

It reads one blob at a time. On S3 or Azure, every blob is a full download, so [budget the run](/datastore/#binary-io) before you start: terabytes can take days.

## 🔥 The Dangerous Misinterpretation {#the-dangerous-misinterpretation}

This comes from a real on-premise incident: a repository with hundreds of missing binaries, a consistency check that found every one of them, and a result that was read as harmless.

```bash
# Step 1: Run the consistency check
$ java -jar oak-run-*.jar datastore --check-consistency --verbose \
    --fds-path /path/to/datastore /path/to/segmentstore

# Output: datastore-out/gcworkdir-<ts>/gccand-<ts>
# Result: 523 lines = blobs referenced in JCR but MISSING from the DataStore

# Step 2: Misread gccand as "harmless orphans" and move on
# ❌ WRONG: after --check-consistency, gccand lists MISSING blobs

# Step 3: Re-indexing fails
ERROR: DataStoreException: Record d84d0b9e... does not exist
# Why? The missing blobs were detected - and ignored
```

The check did its job. The output was read backwards.

::: danger `gccand` means the opposite after a consistency check
The `datastore` command writes `gccand-<timestamp>` for both of its operations, and the meaning **flips**:

```
datastore --collect-garbage   : gccand = DataStore Blob IDs - JCR References
                                       = orphan candidates (sweep deletes them)
datastore --check-consistency : gccand = JCR References - DataStore Blob IDs
                                       = MISSING blobs (also logged as "Missing Blob [...]")
```
:::

**What operators think**: ❌ "gccand lists orphans, so it can be ignored"  
**What it actually means**: ✅ "After `--check-consistency`, every line is a blob that the repository references but the DataStore does not have"

### Why it reads like orphans

Every signal points the wrong way:

1. **The name.** `gccand` means "GC candidates". The consistency check runs on DataStore GC's own machinery and keeps its work directory, `gcworkdir-<ts>/` with `marked-`, `avail-` and `gccand-` files. The names were chosen for the sweep, where `gccand` is the list of what gets deleted.
2. **The habit.** A DataStore GC run that deletes anything leaves its `gcworkdir` behind, often with thousands of lines in `gccand`. That is normal there: orphans pile up between GC runs. 523 lines looks like routine GC output.
3. **The shape.** With `--verbose` on a FileDataStore, every line starts with `d8/4d/0b/d84d0b9e…`, a relative path inside the DataStore. It reads like a listing of files that are sitting in the store. No file exists at any of those paths. That is the finding.
4. **The silence.** Nothing in the file says "missing": no header, no count. The verdict (`Consistency check failure in the the blob store`, `Found 523 missing blobs`) is only in the console output and `temp/datastore.log`.
5. **The exit code.** `datastore --check-consistency` exits `0` with 523 blobs missing. Only an exception makes it exit `1`. A script or runbook that checks `$?` reports success.
6. **The other tool names it plainly.** `datastorecheck --consistency` writes the same finding to a file called `[consistency]<ts>`. Only `datastore --check-consistency` calls it `gccand`.

### Read it right

After `--check-consistency`, the file's existence is the verdict: when nothing is missing, oak-run deletes `gcworkdir-<ts>` at the end of the run (unless TRACE logging is on). **If a `gccand` file exists, blobs are missing.**

```bash
# 1. Count distinct blobs (with --verbose, one blob can appear at several paths)
$ cut -d, -f1 datastore-out/gcworkdir-*/gccand-* | sort -u | wc -l

# 2. Prove one line: the file isn't there
$ head -1 datastore-out/gcworkdir-*/gccand-*
d8/4d/0b/d84d0b9e…,/content/dam/…/jcr:content/renditions/original/jcr:content
$ ls -l /path/to/datastore/d8/4d/0b/d84d0b9e…
ls: …: No such file or directory          ← missing, not orphaned
# S3: the key is d84d-0b9e…; aws s3api head-object returns 404

# 3. Sort by impact: see Find the Affected Content below
```

### What ignoring it cost

- **The blobs stayed missing.** DataStore GC never repairs anything; it only deletes orphans.
- **The next reader failed.** Reindexing and text extraction read those binaries, failed with `DataStoreException: Record … does not exist`, and the async lane stopped moving ([Death Loop](/checkpoints/death-loop)).
- **The evidence is fragile.** Every `datastore` run starts by emptying its `--out-dir` (default `datastore-out`) and `--work-dir` (default `temp`, which holds `datastore.log`). Run DataStore GC from the same directory "to clean up", and the consistency result and its log are gone. Copy `gccand` somewhere safe first, or give each run its own `--out-dir` and `--work-dir`.

## 🗺️ Find the Affected Content {#find-the-affected-content}

| Source | What you get |
|--------|--------------|
| `datastorecheck --consistency --verbose` | `[consistency]` lines `<backend id>,<property path>`, ending in `/jcr:data`. The backend ID is `ab/cd/ef/<id>` on a FileDataStore, `abcd-<rest of id>` on S3/Azure. HEAD only |
| `datastore --check-consistency --verbose` | `gccand` lines `<backend id>,<node path>`. Since Oak 1.90 *(AEM 6.5 LTS SP3)* each line ends with a third field, the blob length. HEAD only |
| `:count-nodes` log | `Warning: Missing blob at <path>: …` lines. HEAD only, includes unreadable blobs |
| Runs without `--verbose` | Blob IDs only. An ID that no `--verbose` run reports is referenced only outside HEAD, so there is no node to fix: see [Checkpoint Advancement](/checkpoints/checkpoint-advancement) |

### Sort by impact

Not every missing blob costs the same. Group a `--verbose` result by path before you decide anything:

```bash
$ cut -d, -f2 /path/to/gccand-or-consistency-file | awk '
                                            { sub(/\/jcr:data$/, "") }
    /\/renditions\/original\/jcr:content$/ { print "dam-original";  next }
    /\/renditions\/[^\/]+\/jcr:content$/   { print "dam-rendition"; next }
    /^\/oak:index\//                        { print "index";         next }
    /^\/jcr:system\/jcr:versionStorage\//   { print "version";       next }
                                            { print "other" }' \
  | sort | uniq -c | sort -rn
```

| Path | What is lost | Way back |
|------|--------------|----------|
| `…/renditions/original/jcr:content` | The asset's original | Restore a copy, or remove the asset. Renditions can't be rebuilt without it |
| `…/renditions/<name>/jcr:content` | One rendition | Reprocess the asset to regenerate it from the original |
| `/oak:index/<name>/…` | A file of that Lucene index | Reindex that index |
| `/jcr:system/jcr:versionStorage/…` | A binary in an older version | Restore a copy, or remove the version |
| Anything else | Depends on the content | Restore a copy, or remove the node |

## 🛠️ Fix Missing Blobs {#fix-missing-blobs}

### 1. Put the blob back (no data loss)

A blob's ID is a hash of its content, so any copy of the same file is the right file: a DataStore backup, an S3 object version or an Azure soft-deleted blob, or the DataStore of another environment that holds the same content. Copy it back under the same name: `ab/cd/ef/<id>` on a FileDataStore, `abcd-<rest of id>` on S3/Azure. Nothing in the repository changes.

### 2. No copy anywhere: remove the references

This loses the binaries for good. With AEM stopped:

```bash
$ java -jar oak-run-*.jar console --read-write \
    --fds-path /path/to/datastore /path/to/segmentstore

# Input: a copy of the gccand from datastore --check-consistency --verbose,
# or a :count-nodes log (exact file name, no wildcard)
> :remove-nodes /safe/place/gccand-1736760000000 dry-run
> :remove-nodes /safe/place/gccand-1736760000000
> :exit
```

`:remove-nodes` (fork only, see above) removes the node behind each line it recognizes. A missing DAM original removes the whole asset. It refuses paths shallower than depth 3. Which inputs it recognizes depends on your Oak version:

| Input | Oak 1.22 – 1.88 (AEM 6.5 – LTS SP2) | Oak 2.4 (LTS SP3) |
|-------|-------------------------------------|-------------------|
| `gccand` from `datastore --check-consistency --verbose`, FileDataStore | ✅ Removed | ❌ Skipped as `does not exist`: the length field added in Oak 1.90 ends up in the path |
| `:count-nodes` log, `Missing blob at …` lines | ✅ Removed | ❌ Only counted: the exception moved to `org.apache.jackrabbit.oak.spi.blob.data.DataStoreException` in Oak 2.0, and the command still looks for `org.apache.jackrabbit.core.data` |
| `[consistency]` from `datastorecheck --consistency --verbose` | ❌ Skipped: its lines name the `jcr:data` property, not a node | ❌ Skipped |
| S3/Azure lines (`abcd-…`) | ❌ Not recognized | ❌ Not recognized |

Read the dry-run report before the real run: a `[SKIP]` line means nothing will happen to that path. For every input it can't use, remove the nodes one at a time with `:remove-node <path>`: the asset for a missing original, the rendition node for a rendition. See [Fork-only console commands](/reference/oak-versions#what-the-commands-actually-do).

### 3. Verify, then find the cause

Run the same check again, with the same `--verbose` setting, and expect `0 missing blobs`. Before the next DataStore GC, find out [why the blobs went missing](#why-blobs-go-missing).

## 🧨 Why Blobs Go Missing {#why-blobs-go-missing}

- **DataStore GC swept blobs still in use**: `maxAge` set too low, or on a shared DataStore one repository's references were missing, stale, or written under another repository's ID ([duplicate repository IDs](#duplicate-repository-ids)). See [DataStore GC](/datastore/gc).
- **Something outside Oak removed them**: manual deletion, or an incomplete copy or migration of the DataStore.

## 🪪 Repository IDs and Shared DataStore GC {#repository-ids}

### The `repository-<id>` Marker

Each repository registers itself in the DataStore with an **empty** (0-byte) record named `repository-<id>`. The ID is the repository's cluster ID, stored in the repository at `/:clusterConfig/:clusterId` and exposed as the repository descriptor `oak.clusterid`.

- **Written** at every AEM start, by every repository whose DataStore Oak considers shared. Every Oak FileDataStore, S3 and Azure DataStore counts, so a single AEM on its own FileDataStore has one too.
- **Location**: FileDataStore: the DataStore root, next to the hash directories. S3: `META/repository-<id>` in the bucket. Azure: `META/repository-<id>` in the container.
- **Removed**: not by Oak. A marker whose repository is gone stays until you delete it. (The one exception: an instance started with `-Doak.datastore.sharedTransient=true` removes its own marker on shutdown *(since Oak 1.26)*.)

```
DataStore root (FileDataStore):
├── ab/
│   └── c1/
│       └── 23/
│           └── abc123...  (blob file: first 3 byte-pairs of the ID as dirs)
├── repository-aaaa-1111-2222-3333-444444444444  ← this repository
└── repository-bbbb-5555-6666-7777-888888888888  ← another repository sharing the store
```

### How DataStore GC Uses It

```
Mark (per repository):
  references-<id>_<run-uuid>        blob IDs this repository references
  markedTimestamp-<id>_<run-uuid>   0 bytes, when the mark started

Sweep (one repository, after all have marked):
  1. Every repository-<id> needs a references-<id>_* record,
     else: "Not all repositories have marked references available"
  2. Union of all references-* records
  3. Delete blobs not in the union and last modified more than maxAge
     (default 24 h) before the earliest mark, or before the oldest
     checkpoint if that is earlier
  4. Delete all references-* and markedTimestamp-* records
```

**The critical assumption**: each `repository-<id>` stands for exactly one live repository that will mark before the sweep.

### Duplicate Repository IDs {#duplicate-repository-ids}

::: danger Duplicate Repository IDs = Silent Data Loss
If two repositories have the **same ID**, the "has every repository marked?" check is satisfied by either one's references, so a sweep can run before the other has marked and **silently delete blobs** that are still in use.
:::

**How duplicates happen**: the repository was cloned or copied, a backup was restored into another environment, a VM snapshot was restored as a new instance, or a Docker image shipped with the repository inside it. In each case the copy keeps `/:clusterConfig/:clusterId`.

```
Scenario: prod and a clone of prod share one DataStore with staging
├── repository-aaaa-1111  ← ONE marker, used by prod AND test (clone)
└── repository-bbbb-2222  ← staging

1. Test marks    → references-aaaa-1111_<uuid> (test's blobs only)
2. Staging marks → references-bbbb-2222_<uuid>
3. Test sweeps: every marker ID has references → sweep allowed
   (prod never marked; Oak cannot tell prod and test apart)
4. The sweep deletes prod blobs that test and staging don't reference
5. Result: PROD DATA LOSS
```

Oak has a warning for this, `References for repository id … already exists. Creating a duplicate one. Please check for inadvertent sharing of repository id by different repositories`, but it looks for a record named exactly `references-<id>`, and Oak 1.22 and 2.4 always append `_<run-uuid>`. The warning doesn't fire, so a clean log proves nothing.

### Diagnose

**Step 1: List the markers and references**

```bash
# FileDataStore
$ ls -la /path/to/datastore/repository-* /path/to/datastore/references-*
repository-aaaa-1111-2222-3333-444444444444
repository-bbbb-5555-6666-7777-888888888888
references-aaaa-1111-2222-3333-444444444444_<uuid>  ← aaaa-1111 has marked
# No references-bbbb-5555…: that repository hasn't marked (or a sweep cleared it)

# S3: aws s3 ls s3://<bucket>/META/
```

**Step 2: Read each instance's cluster ID**

```bash
# Offline, AEM stopped
$ java -jar oak-run-*.jar console /path/to/segmentstore
> :cd /:clusterConfig
> :pn
```

Two instances with the same `:clusterId` share one marker. A marker that no instance claims is stale.

### Fix

::: warning CRITICAL
Do this BEFORE running DataStore GC, or you risk massive data loss.
:::

**Duplicate ID: reset the cluster ID on the clone (AEM stopped)**

```bash
$ ./crx-quickstart/bin/stop

# Deletes the :clusterId property under /:clusterConfig (opens the store read-write)
$ java -jar oak-run-*.jar resetclusterid /path/to/segmentstore
# → "clusterId deleted successfully. (old id was ...)"

# Start AEM: it generates a new cluster ID and registers repository-<new id>
$ ./crx-quickstart/bin/start

# Verify the new ID offline (console: :cd /:clusterConfig, :pn)
```

Do **not** delete `repository-<old id>` here: the original instance still uses it.

**Stale marker: delete it by hand.** No Oak tool removes another repository's marker. Until you delete it, every sweep stops with `Not all repositories have marked references available`, and so does `datastore --check-consistency` *(since Oak 1.54)*. Delete it only when no instance reports that ID: removing the marker of a live repository lets the next sweep delete that repository's blobs.

## ✅ Key Takeaways {#key-takeaways}

::: tip Remember
1. **Pick the tool by what it checks** - Without `--verbose`: every reference still in the store, including checkpoints, but no paths. With `--verbose`: HEAD only, with paths. `:count-nodes`: HEAD only, and the only tool that reads the bytes
2. **gccand after `--check-consistency` shows MISSING blobs** (after `--collect-garbage` it shows orphans) - Don't misinterpret!
3. **Missing blobs = data loss** - Unless a copy exists somewhere: blob IDs are content hashes, so any copy of the file works
4. **A consistency check clears GC marks** - `datastore --check-consistency` and the MBean delete every repository's references; mark them all again before the next sweep
5. **The exit code lies** - `datastore --check-consistency` exits `0` with blobs missing; the `gccand` file's existence is the verdict
6. **Run after DataStore GC** - Verify nothing was incorrectly deleted
7. **Reset cluster ID after cloning** - And delete markers no instance uses
8. **Check before migration** - Ensure consistency before moving
:::

::: info 📅 Last Updated
Content last reviewed: October 2026 • Verified against Oak 1.22.24 (AEM 6.5) and Oak 2.4.0 (AEM 6.5 LTS SP3)
:::
