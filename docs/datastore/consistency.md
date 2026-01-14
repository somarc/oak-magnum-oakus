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

## 🔥 CRITICAL: The `gccand` File Misunderstanding

::: danger Common Mistake
The `gccand` file from `datastorecheck --consistency` is **frequently misinterpreted**.
:::

### What `gccand` Actually Contains

```
gccand = DataStore Blob IDs - JCR References
       = Orphaned blobs (safe to delete)
       = NOT missing blobs!
```

**What operators think**: ❌ "These are missing blobs that need to be fixed"  
**What it actually means**: ✅ "These blobs exist in DataStore but have no JCR reference (orphan candidates for GC)"

### The Dangerous Misinterpretation

```bash
# Step 1: Run consistency check
$ java -jar oak-run-*.jar datastore --check-consistency \
    /path/to/segmentstore --fds-path /path/to/datastore --verbose

# Output: gccand file with orphaned blobs
# Result: 523 blob IDs in DataStore with no JCR references

# Step 2: Misinterpret gccand as "missing blobs" and try to clean up
> :remove-nodes /tmp/gccand-* dry-run
# ❌ WRONG: gccand shows ORPHANED blobs, not MISSING blobs

# Step 3: Re-indexing still fails
ERROR: DataStoreException: Record d84d0b9e... does not exist
# Why? Because the ACTUAL missing blobs were never detected!
```

### What Each Tool Actually Detects

| Scenario | `datastore --verbose` Result | `count-nodes deep` Result |
|----------|------------------------------|---------------------------|
| **Blob in DS, referenced in JCR** | Not in gccand (normal) | No error (blob accessible) |
| **Blob in DS, NOT referenced in JCR** | In gccand (orphan) | Not visited (no JCR path) |
| **Blob NOT in DS, referenced in JCR** | Not detected ❌ | **Missing blob error** ✅ |
| **Corrupt DS file (unreadable)** | Not detected ❌ | **Missing blob error** ✅ |
| **Network issue to S3/Azure** | Not detected ❌ | **Missing blob error** ✅ |

### The Right Tool for Missing Blobs

**Use `:count-nodes deep` in oak-run console** to find actually missing blobs:

```bash
$ java -jar oak-run-*.jar console --read-write /path/to/segmentstore

> :count-nodes deep analysis
# This traverses the JCR tree and ACTUALLY READS each blob
# Missing blobs are logged to /tmp/count-nodes-snfe-*.log
```

## The `repository-[UUID]` File: Identity Crisis and DataStore GC Failures

### What Is the Repository ID File?

When using a **shared DataStore** (multiple AEM instances sharing the same blob storage), each repository instance registers itself with a unique identifier.

```
DataStore Directory:
├── 00/
│   ├── 00/
│   │   └── abc123...  (blob file)
│   └── 01/
│       └── def456...  (blob file)
├── repository-aaaa-1111-2222-3333-444444444444  ← Repository ID marker
└── repository-bbbb-5555-6666-7777-888888888888  ← Another instance's marker
```

**File Properties**:
- **Name Format**: `repository-[UUID]` where UUID is the unique repository ID
- **Contents**: **EMPTY FILE** (0 bytes) - it's a marker, not data
- **Purpose**: Registers this repository instance as a user of the shared DataStore
- **Created**: On first AEM startup with shared DataStore configured

### Why Repository ID Matters for DataStore GC

DataStore GC uses a **mark-and-sweep** algorithm across all registered repositories:

```
Mark Phase (per repository):
1. Repository aaaa-1111 runs mark → creates references-aaaa-1111
2. Repository bbbb-2222 runs mark → creates references-bbbb-2222

Sweep Phase (global):
1. Reads ALL references-* files
2. Unions all blob IDs from all repositories
3. Deletes blobs NOT in the union
```

**The Critical Assumption**: Each `repository-[UUID]` file represents a **unique, active repository** that will participate in mark phase.

### When Repository IDs Go Wrong

::: danger Duplicate Repository IDs = Silent Data Loss
If two repositories have the **same UUID**, DataStore GC will use the wrong references and **silently delete blobs** that are still in use.
:::

**How Duplicates Happen**:
1. **Clone/copy repository** without resetting cluster ID
2. **Restore from backup** to different environment
3. **VM snapshot** restored to new instance
4. **Docker image** with embedded repository ID

**Why DataStore GC Fails**:

```
Scenario: Multiple repository-[UUID] files in SAME DataStore
├── repository-aaaa-1111  ← From prod
├── repository-aaaa-1111  ← From test (duplicate!)
└── repository-bbbb-2222  ← From staging

What happens during GC:
1. Prod runs mark → references-aaaa-1111 (prod blobs)
2. Test runs mark → references-aaaa-1111 (OVERWRITES prod references!)
3. Sweep phase reads references-aaaa-1111 (test blobs only)
4. Sweep deletes prod blobs not in test references
5. Result: PROD DATA LOSS
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
# On each AEM instance:
$ cat crx-quickstart/repository/cluster_id.txt
# OR check via JMX: org.apache.jackrabbit.oak:type=ClusterRepositoryInfo
```

**Step 3: Verify references files match repository files**
```bash
$ ls -la /path/to/datastore/references-*
references-aaaa-1111  ← From instance aaaa-1111
references-bbbb-2222  ← From instance bbbb-2222
# But NO references-cccc-3333: Instance cccc-3333 hasn't run mark phase
```

### How to Fix Duplicate Repository IDs

::: warning CRITICAL
This must be done BEFORE running DataStore GC, or you risk massive data loss.
:::

**Option 1: Reset Cluster ID (Recommended)**

```bash
# Stop AEM
$ ./crx-quickstart/bin/stop

# Remove cluster ID file
$ rm crx-quickstart/repository/cluster_id.txt

# Remove repository marker from DataStore (if accessible)
$ rm /path/to/datastore/repository-[OLD-UUID]

# Start AEM (generates new cluster ID)
$ ./crx-quickstart/bin/start

# Verify new ID
$ cat crx-quickstart/repository/cluster_id.txt
```

**Option 2: Use oak-run resetclusterid**

```bash
$ java -jar oak-run-*.jar resetclusterid /path/to/segmentstore
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
# Use count-nodes to find paths with missing blobs:
$ java -jar oak-run-*.jar console --read-write /path/to/segmentstore

> :count-nodes deep analysis
# Creates /tmp/count-nodes-snfe-*.log with corrupted paths
```

## Key Takeaways

::: tip Remember
1. **Run after DataStore GC** - Verify nothing was incorrectly deleted
2. **Missing blobs = data loss** - Binary content is gone
3. **Unreferenced blobs = wasted space** - Safe to delete via GC
4. **gccand shows ORPHANS, not missing blobs** - Don't misinterpret!
5. **Use count-nodes for missing blobs** - It actually reads each blob
6. **Reset cluster ID after cloning** - Prevents duplicate repository IDs
7. **Check before migration** - Ensure consistency before moving
:::
