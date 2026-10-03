# 🔍 DataStore Consistency Check

The DataStore consistency check verifies that all binary references in the repository point to existing blobs.

## When to Use

- After DataStore GC
- When suspecting missing binaries
- Before/after migration
- Regular health checks

## Basic Usage

```bash
# AEM stopped: datastorecheck opens the segment store read-write
$ java -jar oak-run-*.jar datastorecheck --consistency \
    --store /path/to/segmentstore \
    --s3ds /path/to/S3DataStore.config \
    --repoHome /path/to/crx-quickstart/repository \
    --dump /path/to/output
```

One of `--id`, `--ref`, `--consistency` is required; `--store` is required for `--ref`/`--consistency`, `--repoHome` for `--consistency` (it reads tracked deletions from `<repoHome>/blobids`). `--dump` defaults to `java.io.tmpdir`. The DataStore options take the OSGi **config file**, not the datastore directory. Same options in Oak 1.22 and 2.4, except `--verboseRootPath` *(since Oak 1.26 — not in AEM 6.5; see [which LTS SP has which Oak](/reference/oak-versions))*.

## DataStore Types

### FileDataStore

```bash
$ java -jar oak-run-*.jar datastorecheck --consistency \
    --store /path/to/segmentstore \
    --fds /path/to/FileDataStore.config \
    --repoHome /path/to/crx-quickstart/repository \
    --dump /path/to/output
```

### S3 DataStore

```bash
$ java -jar oak-run-*.jar datastorecheck --consistency \
    --store /path/to/segmentstore \
    --s3ds /path/to/S3DataStore.config \
    --repoHome /path/to/crx-quickstart/repository \
    --dump /path/to/output
```

### Azure DataStore

```bash
$ java -jar oak-run-*.jar datastorecheck --consistency \
    --store /path/to/segmentstore \
    --azureblobds /path/to/AzureDataStore.config \
    --repoHome /path/to/crx-quickstart/repository \
    --dump /path/to/output
```

## Output Files

The check keeps one file per **requested** operation (and only if non-empty) in the dump directory, named after the option plus a millisecond timestamp:

| File | Contents |
|------|----------|
| `[id]<timestamp>` | All blob IDs in the DataStore (needs `--id`) |
| `[ref]<timestamp>` | `blobId,nodeId` references from the repository (needs `--ref`; node paths with `--verbose`) |
| `[consistency]<timestamp>` | References whose blob is **missing** from the DataStore |

There is no "unreferenced blobs" file - orphans are only computed by DataStore GC.

## Interpreting Results

### Healthy

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

### Problems

```
...
Starting consistency check
Consistency check found 131 missing blobs
Consistency check failure for the data store
Finished in 1 seconds
[consistency] - /path/to/output/[consistency]1736760000000
```

## 🔥 CRITICAL: The `gccand` File Misunderstanding

::: danger Common Mistake
The `gccand-<timestamp>` file (in `<out-dir>/gcworkdir-<timestamp>/`, default `datastore-out/`) is written by the `datastore` command - not by `datastorecheck` - and its meaning **flips with the operation**.
:::

### What `gccand` Actually Contains

```
datastore --collect-garbage   : gccand = DataStore Blob IDs - JCR References
                                       = orphan candidates (sweep deletes them)
datastore --check-consistency : gccand = JCR References - DataStore Blob IDs
                                       = MISSING blobs (also logged as "Missing Blob [...]")
```

**What operators think**: ❌ "gccand from a consistency check lists orphans, so it can be ignored"  
**What it actually means**: ✅ "After `--check-consistency`, every line is a blob that the repository references but the DataStore does not have" - the run also logs `Consistency check failure in the the blob store : …, check missing candidates in file …/gccand-…` and `Found N missing blobs`

### The Dangerous Misinterpretation

```bash
# Step 1: Run consistency check
$ java -jar oak-run-*.jar datastore --check-consistency \
    /path/to/segmentstore --fds-path /path/to/datastore --verbose

# Output: datastore-out/gcworkdir-<ts>/gccand-<ts>
# Result: 523 lines = blobs referenced in JCR but MISSING from the DataStore
# (--verbose rewrites them as backend IDs plus the referencing node path)

# Step 2: Misread gccand as "harmless orphans" and move on
# ❌ WRONG: after --check-consistency, gccand lists MISSING blobs

# Step 3: Re-indexing fails
ERROR: DataStoreException: Record d84d0b9e... does not exist
# Why? The missing blobs were detected - and ignored
```

### What Each Tool Actually Detects

| Scenario | `datastore --check-consistency` (gccand) | `count-nodes deep` Result |
|----------|------------------------------|---------------------------|
| **Blob in DS, referenced in JCR** | Not in gccand (normal) | No error (blob accessible) |
| **Blob in DS, NOT referenced in JCR** | Not listed (only GC's gccand lists orphans) | Not visited (no JCR path) |
| **Blob NOT in DS, referenced in JCR** | **In gccand** ✅ (`Missing Blob [...]`) | **Missing blob error** ✅ |
| **Corrupt DS file (unreadable)** | Not detected ❌ (IDs are listed, content never read) | **Missing blob error** ✅ |
| **Network issue to S3/Azure** | Run fails while listing blob IDs | **Missing blob error** ✅ |

`datastorecheck --consistency` detects the same "referenced but missing" case and writes it to `[consistency]<timestamp>`. In Oak 2.4, `--check-consistency` also accepts an optional `markOnly` boolean *(since Oak 1.54 — not in AEM 6.5)*.

### The Right Tool for Missing Blobs

**Start with `datastore --check-consistency --verbose`** (Apache Oak, lists missing blob IDs with their node paths). To also catch blobs that exist but cannot be read, **use `:count-nodes deep` in the oak-run console**:

::: warning ⚠️ Not in Apache Oak
`:count-nodes` and `:remove-nodes` are not part of Apache Jackrabbit Oak (any version). They come from a community fork. See [Fork-only console commands](/reference/oak-versions#fork-only-console-commands) for how to get a build that matches your Oak version.
:::

```bash
$ java -jar oak-run-*.jar console --read-write \
    --fds-path /path/to/datastore /path/to/segmentstore

> :count-nodes deep analysis
# This traverses the JCR tree and ACTUALLY READS each blob
# Missing blobs are logged to count-nodes-snfe-YYYYMMDD-HHmmss.log (console's working directory)
```

## The `repository-[UUID]` File: Identity Crisis and DataStore GC Failures

### What Is the Repository ID File?

When using a **shared DataStore** (multiple AEM instances sharing the same blob storage), each repository instance registers itself with a unique identifier.

```
DataStore Directory:
├── ab/
│   └── c1/
│       └── 23/
│           └── abc123...  (blob file: first 3 byte-pairs of the ID as dirs)
├── repository-aaaa-1111-2222-3333-444444444444  ← Repository ID marker
└── repository-bbbb-5555-6666-7777-888888888888  ← Another instance's marker
```

**File Properties**:
- **Name Format**: `repository-[UUID]` where UUID is the unique repository ID
- **Contents**: **EMPTY FILE** (0 bytes) - it's a marker, not data
- **Purpose**: Registers this repository instance as a user of the shared DataStore
- **Created**: On AEM startup when the DataStore is shared (re-registered on every start)

### Why Repository ID Matters for DataStore GC

DataStore GC uses a **mark-and-sweep** algorithm across all registered repositories:

```
Mark Phase (per repository):
1. Repository aaaa-1111 runs mark → creates references-aaaa-1111_<suffix>
2. Repository bbbb-2222 runs mark → creates references-bbbb-2222_<suffix>

Sweep Phase (global):
1. Checks every repository-* marker has a references-* record (else: "Not all repositories have marked references available")
2. Reads ALL references-* files and unions all blob IDs
3. Deletes blobs NOT in the union (and older than maxAge)
```

**The Critical Assumption**: Each `repository-[UUID]` file represents a **unique, active repository** that will participate in mark phase.

### When Repository IDs Go Wrong

::: danger Duplicate Repository IDs = Silent Data Loss
If two repositories have the **same UUID**, the "has every repository marked?" check is satisfied by either one's references, so a sweep can run before the other has marked and **silently delete blobs** that are still in use.
:::

**How Duplicates Happen**:
1. **Clone/copy repository** without resetting cluster ID
2. **Restore from backup** to different environment
3. **VM snapshot** restored to new instance
4. **Docker image** with embedded repository ID

**Why DataStore GC Fails**:

```
Scenario: Multiple repository-[UUID] files in SAME DataStore
├── repository-aaaa-1111  ← ONE marker, used by prod AND test (clone)
└── repository-bbbb-2222  ← From staging

What happens during GC:
1. Test runs mark → references-aaaa-1111_<suffix> (test blobs only)
2. Staging runs mark → references-bbbb-2222_<suffix>
3. Test runs sweep: every marker id has references → sweep allowed
   (prod never marked - Oak cannot tell prod and test apart)
4. Sweep deletes prod blobs not in test/staging references
5. Result: PROD DATA LOSS
   (if prod had also marked, Oak only logs "References for repository id
    aaaa-1111 already exists. Creating a duplicate one. Please check for
    inadvertent sharing of repository id by different repositories")
```

### How to Diagnose Duplicate Repository IDs

**Step 1: Check DataStore for repository files**
```bash
$ ls -la /path/to/datastore/repository-*
repository-aaaa-1111-2222-3333-444444444444
repository-bbbb-5555-6666-7777-888888888888
```

**Step 2: Check each AEM instance's cluster ID**
```bash
# The ID is stored IN the repository (property /:clusterConfig/:clusterId),
# not in a file; it is also exposed as repository descriptor "oak.clusterid".
# Offline, with AEM stopped:
$ java -jar oak-run-*.jar console /path/to/segmentstore
> :cd /:clusterConfig
> :pn
```

**Step 3: Verify references files match repository files**
```bash
$ ls -la /path/to/datastore/references-*
references-aaaa-1111_<suffix>  ← From instance aaaa-1111
references-bbbb-2222_<suffix>  ← From instance bbbb-2222
# But NO references-cccc-3333: Instance cccc-3333 hasn't run mark phase
```

### How to Fix Duplicate Repository IDs

::: warning CRITICAL
This must be done BEFORE running DataStore GC, or you risk massive data loss.
:::

**Reset Cluster ID with oak-run (on the clone, AEM stopped)**

```bash
# Stop AEM
$ ./crx-quickstart/bin/stop

# Delete /:clusterConfig/:clusterId from the repository
$ java -jar oak-run-*.jar resetclusterid /path/to/segmentstore
# → "clusterId deleted successfully. (old id was ...)"

# Do NOT remove repository-[OLD-UUID] if the original instance still uses that ID

# Start AEM (generates and registers a new cluster ID)
$ ./crx-quickstart/bin/start

# Verify new ID (offline: console :cd /:clusterConfig, :pn)
```

### Bottom Line

- 💡 **repository-[UUID] is an identity marker** for shared DataStore GC coordination
- 💡 **Duplicate IDs cause silent data loss** during GC (wrong references used)
- 💡 **Always reset cluster ID after cloning** repositories
- 💡 **Verify repository registration** before running DataStore GC

## Fixing Missing Blobs

If blobs are missing:

1. **Check backup** - Restore missing blobs from backup
2. **Check replication** - May exist on other instance
3. **Accept loss** - Remove references to missing blobs

### Finding Affected Content

```bash
# Apache Oak: missing blob IDs + referencing node paths
$ java -jar oak-run-*.jar datastore --check-consistency --verbose \
    --fds-path /path/to/datastore /path/to/segmentstore
# → datastore-out/gcworkdir-<ts>/gccand-<ts>

# Fork-only (see warning above): count-nodes to find paths with missing blobs
$ java -jar oak-run-*.jar console --read-write \
    --fds-path /path/to/datastore /path/to/segmentstore

> :count-nodes deep analysis
# Creates count-nodes-snfe-YYYYMMDD-HHmmss.log (working directory) with corrupted paths
```

## Key Takeaways

::: tip Remember
1. **Run after DataStore GC** - Verify nothing was incorrectly deleted
2. **Missing blobs = data loss** - Binary content is gone
3. **Unreferenced blobs = wasted space** - Safe to delete via GC
4. **gccand after `--check-consistency` shows MISSING blobs** (after `--collect-garbage` it shows orphans) - Don't misinterpret!
5. **Use count-nodes for unreadable blobs** - It actually reads each blob
6. **Reset cluster ID after cloning** - Prevents duplicate repository IDs
7. **Check before migration** - Ensure consistency before moving
:::
