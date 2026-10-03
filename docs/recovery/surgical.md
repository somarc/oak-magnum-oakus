# 🔪 Surgical Removal

::: info 🎯 Scope
SegmentStore (TarMK) • Oak 1.22.x – 2.4.0 ([version scope](/reference/oak-versions))  
**Not for AEMaaCS**
:::

::: warning ⚠️ Not in Apache Oak
`:count-nodes`, `:remove-nodes` and `:remove-node` are not part of Apache Jackrabbit Oak (any version). They come from a community fork. See [Fork-only console commands](/reference/oak-versions#fork-only-console-commands) for how to get a build that matches your Oak version.
:::

Surgical removal lets you **precisely remove corrupted paths** while preserving the rest of the repository. It's more work than journal recovery but can save more data.

## 🔍 Signals That Lead Here

```
oak-run check found good revision but you want to preserve recent changes
SegmentNotFoundException for specific paths (not system-wide)
count-nodes identified isolated corrupted paths in /content or /var
Want to remove corrupted content rather than rolling back
```

## ✅ Do / ❌ Don't

| ✅ DO | ❌ DON'T |
|-------|----------|
| Run `oak-run check` first | Skip straight to removal |
| Review log file before removal | Remove without dry-run |
| Use `dry-run` flag first | Remove `/oak:index/uuid` or `/jcr:system` |
| Verify with `check` after removal | Assume removal fixed everything |

## Overview

```mermaid
flowchart LR
    A[count-nodes] --> B[Identify bad paths]
    B --> C[Review log file]
    C --> D[remove-nodes dry-run]
    D --> E[remove-nodes / remove-node]
    E --> F[Verify with check]
```

## Step 1: Find Corrupted Paths

Use the `count-nodes` command in oak-run console:

```bash
$ java -jar oak-run-*.jar console --read-write /path/to/segmentstore

# In the console:
> :count-nodes deep analysis
```

`:count-nodes [segment-binaries | datastore-binaries | deep] [analysis]` always walks the whole tree from `/` (it takes no path argument) and only reads. `deep` also reads every segment and DataStore binary stream; `analysis` adds a grouped summary of corrupted paths with recovery hints.

### What count-nodes Does

- Traverses entire repository tree
- Tests accessibility of every node
- Logs `SegmentNotFoundException` errors to file
- Creates `count-nodes-snfe-yyyyMMdd-HHmmss.log` in the **current working directory** of the console (not `/tmp`)
- Prints progress every 50,000 nodes and flags nodes with ≥ 1,000 children

### Example Output

```
Counting nodes in tree /
  50000
  100000
Warning: Missing segment at /content/dam/2024/Q3/: Segment 0a1b2c3d-4e5f-6789-abcd-ef0123456789 not found
Warning: Missing blob (datastore) at /content/dam/2024/Q4/hero.jpg/jcr:content/renditions/original/jcr:content/: org.apache.jackrabbit.core.data.DataStoreException: Record ... does not exist
...
Total nodes in tree /: 1234567
Total binaries in tree /: 45678
Total missing segments: 1
Total missing blobs: 1
```

Printed paths end in `/`. Only problems are printed — healthy nodes are not listed.

### Time Estimate

| Repository Size | Approximate Time |
|-----------------|------------------|
| 10 GB | ~30 minutes |
| 50 GB | ~1 hour |
| 100 GB | ~2 hours |
| 500 GB | ~6-8 hours |
| 1 TB | ~12-24 hours |
| 2 TB | ~24-48 hours (multi-day) |
| 3 TB+ | ~48-96 hours (week-scale) |

::: warning ⚠️ Time Estimates Scale With Repository Size
These times are **I/O bound** - `count-nodes` must traverse every node in the repository tree. There is no way to parallelize or speed up these operations.

**Production reality**: On-premise AEM installations commonly accumulate **500GB-2TB** segment stores. Running `count-nodes` on a 2TB repository is a **multi-day operation**.
:::

## Step 2: Review the Log

```bash
$ grep '^Warning:' count-nodes-snfe-20240111-093500.log

Warning: Missing segment at /content/dam/2024/Q3/: Segment 0a1b2c3d-4e5f-6789-abcd-ef0123456789 not found
Warning: Missing blob at /content/dam/2024/Q4/hero.jpg/jcr:content/renditions/original/jcr:content/: org.apache.jackrabbit.core.data.DataStoreException: Record ... does not exist
Warning: Unable to read node /var/audit/2024/01/15/corrupted-entry/: ...
```

::: warning ⚠️ What `:remove-nodes` acts on
`:remove-nodes` only deletes for these input lines:
- `Warning: Missing blob at <path>: org.apache.jackrabbit.core.data.DataStoreException: Record …` (missing DataStore binaries)
- datastore consistency-check lines `aa/bb/cc/<64-hex blob id>,<path>`
- `Warning: Unable to read node <path>/: …` lines (removes that node)

**`Warning: Missing segment at …` lines are only counted and logged as `[WARN]` — they are never deleted.** For SNFE paths, review them and remove each one with [`:remove-node`](#single-node-removal).
:::

## 🚨 CRITICAL: Surgical Removal Limitations

**`count-nodes` + `remove-nodes` / `remove-node` is NOT a guarantee and NOT always viable!**

### When Surgical Removal Works ✅

Corrupted paths that are **non-critical and isolatable**:

| Path | Safe to Remove? | Notes |
|------|-----------------|-------|
| `/content/dam/corrupted-asset` | ✅ Yes | Individual DAM assets |
| `/content/site/corrupted-page` | ✅ Yes | Specific pages or subtrees |
| `/var/audit/corrupted-logs` | ✅ Yes | Audit logs, workflow instances |
| `/apps/myproject` | ✅ Yes | Custom code, redeploy via CI/CD |
| `/jcr:system/jcr:versionStorage/abc123` | ✅ Yes | Version history for one node only |
| `/home/users/a/ab/abc/user@example.com` | ✅ Yes | Regular user profile (non-system) |
| `/home/groups/g/gr/group/content-authors` | ✅ Yes | Regular group (non-system) |

### Lucene Index Nodes (CRITICAL DISTINCTION)

::: danger ⚠️ CRITICAL DISTINCTION - Lucene Index Nodes
- `/oak:index/damAssetLucene` **(index definition)** - **DO NOT DELETE** - Contains index configuration
- `/oak:index/damAssetLucene/:data` **(hidden index data)** - **Safe to delete** - Can be rebuilt
- `/oak:index/damAssetLucene/:suggest-data` **(hidden suggestion data)** - **Safe to delete** - Can be rebuilt
:::

| Path | Safe to Remove? | Notes |
|------|-----------------|-------|
| `/oak:index/damAssetLucene/:data` | ✅ Yes | Hidden index data, can be rebuilt |
| `/oak:index/cqPageLucene/:suggest-data` | ✅ Yes | Hidden suggestion data, can be rebuilt |
| `/oak:index/damAssetLucene` | ⚠️ **RISKY** | Index definition - deleting loses configuration |

### 🔥 CRITICAL WARNING - Full-Text Indexes (damAssetLucene, lucene)

::: danger Full-Text Index Re-indexing = WEEKS TO MONTHS of IO HELL
These indexes use **Apache Tika for binary text extraction** (PDFs, Word docs, videos, etc.)

**YES, you CAN remove `:data` nodes** - but at **MASSIVE IO COST**:
- Re-indexing from scratch = **WEEKS TO MONTHS** on large DAM repositories
- **Orders of magnitude slower** than simple property indexes (100x-1000x)
- **Example**: 500GB DAM with 100K PDFs = **2-4 weeks** of continuous re-indexing

**MANDATORY**: Use [pre-text extraction](/recovery/pre-text-extraction) to salvage existing indexed data from corrupted index. **DO NOT** just delete and re-index naively - you'll regret it for weeks.
:::

### When Surgical Removal FAILS ❌

Corrupted paths that are **critical to AEM/Oak operation**:

#### Property Indexes (Synchronous - AEM Won't Start if Corrupted)

Property indexes are **synchronous** - they are updated inside the same commit as every write. Oak does **not** run a startup validation of them; instead, any commit that has to update a corrupted index reads the missing segment and **fails**, so AEM's own startup writes fail and AEM **won't come up**.

| Path | Why Critical | Impact |
|------|--------------|--------|
| `/oak:index/uuid` | Maps JCR UUIDs to node paths | AEM cannot start - UUID lookups fail |
| `/oak:index/nodetype` | Indexes `jcr:primaryType` and `jcr:mixinTypes` | AEM cannot start - node type validation fails |

**Why Property Indexes are Critical:**
```
Property Index Characteristics:
1. Synchronous updates - every write immediately updates index
2. Updated inside the commit - a missing segment under the index fails the commit
3. Used by core Oak APIs - UUID lookups, node type queries
4. Cannot be disabled - required for JCR specification compliance

Failure Sequence:
1. Oak opens FileStore (no index validation happens here)
2. AEM startup commits content that touches uuid / nodetype
3. Index update reads the missing segment → SegmentNotFoundException → commit fails
4. Startup commits keep failing → AEM won't start
```

**Contrast with Lucene Indexes (Asynchronous):**
- Lucene indexes (`/oak:index/damAssetLucene`, `/oak:index/cqPageLucene`) are **asynchronous** (so is `/oak:index/counter`, an async `counter`-type index, not a property index)
- Updated in background by async indexing threads
- Corruption doesn't prevent AEM startup (indexing lane just fails)
- Can be deleted and rebuilt via re-indexing
- **Not on the commit path** - AEM starts even if Lucene indexes corrupted

#### Other Critical Paths

| Path | Why Critical | Impact |
|------|--------------|--------|
| `/jcr:system/jcr:nodeTypes` | Node type definitions | Repository unusable |
| `/jcr:system/jcr:namespaces` | Namespace registry | Repository unusable |
| `/jcr:system/rep:permissionStore` | Compiled ACL permissions (Oak permission store) | AEM cannot start |
| `/home/users/system/*/admin` | Admin user account | AEM unusable |
| `/home/users/system/*/authentication-service` | Authentication service user | Bundles fail to initialize |
| `/home/users/system/*/replication-service` | Replication service user | Replication fails |
| `/home/groups/*/administrators` | Administrators group | Admin access broken |

#### `/libs` Corruption - Special Case

If `/libs` paths are corrupted but AEM can still start:

**Option 1: Sidegrade from Vanilla Instance** (Recommended)
1. Instantiate clean vanilla AEM instance (no customizations)
2. Patch to **exact same service pack level** as affected instance
3. Stop both instances, then use `oak-upgrade` (same version as your oak-core) to sidegrade **only** corrupted `/libs` paths. Source and destination are positional and point at the **repository** directory that contains `segmentstore/` (oak-upgrade appends `segmentstore` itself):
   ```bash
   java -jar oak-upgrade-<oak-version>.jar \
     --include-paths=/libs/granite/core,/libs/cq/core \
     --src-datastore=/path/to/vanilla/crx-quickstart/repository/datastore \
     --datastore=/path/to/affected/crx-quickstart/repository/datastore \
     /path/to/vanilla/crx-quickstart/repository \
     /path/to/affected/crx-quickstart/repository
   ```
   With a FileDataStore, pass both `--src-datastore` and `--datastore` so the vanilla binaries are copied into the affected DataStore; without them only blob references are copied, and they would point at binaries the affected DataStore doesn't have. See [Sidegrade](/recovery/sidegrade).
4. Restart affected AEM instance to verify

**Option 2: Content Package from Parallel Instance**
- Create content package of `/libs` (only corrupted paths)
- Install via Package Manager
- Requires AEM to start and Package Manager to be accessible

## Decision Matrix: Can I Use Surgical Removal?

| Corrupted Path | Surgical Removal Viable? | Why? |
|----------------|-------------------------|------|
| `/content/dam/asset123` | ✅ Yes | Isolated asset, non-critical |
| `/content/site/page456` | ✅ Yes | Isolated page, non-critical |
| `/home/users/a/ab/abc/user@example.com` | ✅ Yes | Regular user, recreatable |
| `/home/groups/g/gr/group/content-authors` | ✅ Yes | Regular group, recreatable |
| `/home/users/system/*/admin` | ❌ **NO** | **CRITICAL**: Admin user |
| `/home/users/system/*/authentication-service` | ❌ **NO** | **CRITICAL**: Service user |
| `/home/groups/*/administrators` | ❌ **NO** | **CRITICAL**: Administrators group |
| `/jcr:system/jcr:versionStorage/abc123` | ✅ Yes | Version history for one node |
| `/oak:index/damAssetLucene/:data` | ✅ Yes | Index data (hidden), **but MASSIVE IO cost to rebuild** |
| `/oak:index/damAssetLucene` | ⚠️ **RISKY** | Index definition - must recreate manually |
| `/oak:index/uuid` | ❌ **NO** | **CRITICAL**: Property index (sync), AEM won't start |
| `/oak:index/nodetype` | ❌ **NO** | **CRITICAL**: Property index (sync), AEM won't start |
| `/jcr:system/jcr:nodeTypes` | ❌ **NO** | **CRITICAL**: Content model definitions |
| `/jcr:system/jcr:namespaces` | ❌ **NO** | **CRITICAL**: Namespace registry |
| `/jcr:system/rep:permissionStore` | ❌ **NO** | **CRITICAL**: Security/auth breaks |
| `/libs/*` | ⚠️ Maybe | May prevent startup, sidegrade from vanilla |
| `/apps/myproject` | ✅ Yes | Custom code, redeploy via CI/CD |

**Rule of Thumb**: If `count-nodes analysis` shows corruption in:
- `/oak:index` (especially `uuid`, `nodetype`)
- `/jcr:system/jcr:nodeTypes` or `/jcr:system/jcr:namespaces`
- `/jcr:system/rep:permissionStore`
- `/home/users/system/*` or `/home/groups/*/administrators`

**Skip surgical removal and go directly to restore/sidegrade**.

## Step 3: Dry Run

**Always** do a dry run first. `:remove-nodes <file> [dry-run] [debug]` takes the exact file name (no `*` wildcard expansion):

```bash
# In oak-run console:
> :remove-nodes count-nodes-snfe-20240111-093500.log dry-run
RemoveNodesCommand completed. Full detailed log at: /current/dir/remove-nodes-20240111-101500.log
```

### Dry Run Output

The console prints only the log location; the details go to `remove-nodes-yyyyMMdd-HHmmss.log` in the current directory:

```
[INFO] [count-nodes:blob-missing] Attempting advanced removal at: <path>
[DELETE] [count-nodes:blob-missing] Node at '<node>' removed (pattern type: <damOriginal|damRendition|folderThumb|...>). [DRY RUN]
[WARN] [count-nodes:segment-not-found] Warning: Missing segment at /content/dam/2024/Q3/: Segment 0a1b2c3d-... not found

==== Delete Summary Report ====
*** DRY RUN MODE: No nodes were actually deleted. ***
DAM Asset (original binary removed):        ...
...
```

Review this carefully before proceeding:
- A missing **original** rendition (`…/jcr:content/renditions/original/jcr:content`) deletes the **whole asset**; other renditions and `folderThumbnail` delete just that node.
- Paths shallower than 3 levels are refused.
- `Missing segment` lines show up as `[WARN]` only — handle them with `:remove-node`.

## Step 4: Execute Removal

Removal needs the console opened with `--read-write`. Each deletion is merged as its own commit.

```bash
# In oak-run console:
> :remove-nodes count-nodes-snfe-20240111-093500.log
RemoveNodesCommand completed. Full detailed log at: /current/dir/remove-nodes-20240111-102000.log

> :exit
```

## Step 5: Verify

```bash
$ java -jar oak-run-*.jar check /path/to/segmentstore
```

If check passes clean, start AEM.

## Single Node Removal

For removing a single known path — this is how you remove the `Missing segment at` paths from the count-nodes log (the `:remove-nodes` report prints the exact `:remove-node` command for each):

```bash
# In oak-run console (opened with --read-write):
> :remove-node /content/dam/2024/Q3
Node at path '/content/dam/2024/Q3' removed successfully.
```

`:remove-node` has **no dry-run** and writes no log file; it refuses the root and top-level nodes (depth ≤ 1).

## Best Practices

::: tip Surgical Removal Tips
1. **Always dry-run first** - No undo for remove-nodes
2. **Save the log file** - Document what was removed
3. **Check critical paths** - Never remove system nodes
4. **Verify after** - Run check to confirm success
5. **Backup first** - If possible, backup before removal
6. **Understand index types** - Property indexes (sync) vs Lucene indexes (async)
:::

## When Surgical Removal Won't Work

- **Critical paths corrupted** - Must restore or sidegrade
- **Property indexes corrupted** - AEM won't start even after removal
- **Too many paths** - Sidegrade might be faster
- **Root segments corrupted** - Journal recovery or sidegrade
- **Full-text index corruption** - Removal works but re-indexing takes weeks

## Key Takeaways

::: tip Remember
1. **count-nodes finds problems** - Logs corrupted paths
2. **remove-nodes / remove-node fix them** - remove-nodes handles missing-blob lines; missing-segment paths need remove-node
3. **Always dry-run** - Review before executing
4. **Check critical paths** - Some paths cannot be removed
5. **Property indexes are CRITICAL** - uuid, nodetype cannot be removed
6. **Lucene indexes are EXPENSIVE** - Full-text re-indexing takes weeks
7. **Verify with check** - Confirm repository is healthy
:::
