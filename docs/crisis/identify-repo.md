# 🔍 Identify Your Repository Type

::: info 🎯 Scope
SegmentStore (TarMK) • Oak 1.22.x – 2.4.0 ([version scope](/reference/oak-versions))  
**Not for AEMaaCS**
:::

Before running any recovery commands, you **must** know what type of repository you have. Using the wrong commands can make things worse.

## Quick Identification

```bash
# Check for SegmentStore (TarMK)
ls -la crx-quickstart/repository/segmentstore/

# If you see files like:
# data00000a.tar
# data00001a.tar
# journal.log
# → You have SegmentStore (TarMK)
```

Nothing there? The store lives in `<repository.home>/segmentstore`, and `repository.home` (a property of the `org.apache.jackrabbit.oak.segment.SegmentNodeStoreService` config, or the framework property of the same name) can move it. AEM's default is `crx-quickstart/repository`.

```bash
# Check for DocumentNodeStore (MongoDB/RDB)
ls crx-quickstart/install/*DocumentNodeStoreService*.config

# If this file exists → You have DocumentNodeStore
```

::: tip No `install/` folder?
A default AEM 6.5 or 6.5 LTS install has no `crx-quickstart/install/` at all. The node store config that is actually active is kept under `crx-quickstart/launchpad/config/`, one file per PID:

```bash
# TarMK: this file exists
ls crx-quickstart/launchpad/config/org/apache/jackrabbit/oak/segment/SegmentNodeStoreService.config
# DocumentNodeStore: this exact file exists
ls crx-quickstart/launchpad/config/org/apache/jackrabbit/oak/plugins/document/DocumentNodeStoreService.config
```

Don't use a wildcard there: every TarMK install also has `DocumentNodeStoreServicePreset.config` in that folder, and `*DocumentNodeStoreService*` matches it.
:::

## SegmentStore (TarMK)

**Most common** for single-instance deployments.

### Characteristics

```
crx-quickstart/repository/
├── segmentstore/
│   ├── data00000a.tar      ← Segment data files
│   ├── data00001a.tar
│   ├── data00002a.tar
│   ├── journal.log         ← Commit history
│   ├── repo.lock           ← Process lock
│   └── manifest            ← Store version (store.version)
├── datastore/              ← Binary storage (optional)
└── index/                  ← Lucene indexes
```

### Recovery Commands

| Command | Purpose |
|---------|---------|
| `oak-run check` | Diagnose consistency |
| `oak-run recover-journal` | Rebuild journal |
| `oak-run compact` | Garbage collection, not a repair: never on a store that `check` hasn't passed ([why](/recovery/compaction#compaction-and-corruption)) |
| `oak-run console` | Interactive shell |

## DocumentNodeStore (MongoDB)

**Used for** AEM clustering and high-availability deployments.

### Characteristics

```
crx-quickstart/install/
├── org.apache.jackrabbit.oak.plugins.document.DocumentNodeStoreService.config
│   └── Contains: mongouri=mongodb://...
```

### Recovery Commands

| Command | Purpose |
|---------|---------|
| `oak-run recovery` | NOT recover-journal! |
| `oak-run console` | Interactive shell |

::: warning ⚠️ Important
**DO NOT** use `recover-journal` or `check` on DocumentNodeStore - they're for SegmentStore only! DocumentNodeStore recovery is out of scope for this guide.
:::

## DocumentNodeStore (RDB)

**Used for** AEM with relational database backend.

### Characteristics

```
crx-quickstart/install/
├── org.apache.jackrabbit.oak.plugins.document.DocumentNodeStoreService.config
│   └── Contains: documentStoreType=RDB (JDBC URL lives in a separate DataSource config, datasource.name=oak)
```

## Hybrid Configurations

Some deployments use:
- **DocumentNodeStore** for Author (clustered)
- **SegmentStore** for Publish (a farm of independent TarMK instances)

Check each instance separately!

::: info Which way round
Adobe's [Recommended Deployments](https://experienceleague.adobe.com/en/docs/experience-manager-65/content/implementing/deploying/deploying/recommended-deploys) for AEM 6.5: MongoMK is the exception for **author** clusters; it is "not recommended" for **publish**, which is "almost always" a TarMK farm (AEM Communities with a MongoMK common store is the exception there).
:::

## Still Not Sure?

### Check the Logs

```bash
# The store's own startup line (one per start, so search rotated logs too)
grep -h "Primary SegmentNodeStore initialized\|Starting DocumentNodeStore with\|Initializing DocumentNodeStore with dataSource" crx-quickstart/logs/error.log*

# Broader, if that finds nothing
grep -i "NodeStore" crx-quickstart/logs/error.log* | grep -v "DocumentNodeStoreServicePreset" | head -20

# Look for:
# "Primary SegmentNodeStore initialized" → SegmentStore
# "Starting DocumentNodeStore with host=" → DocumentNodeStore (MongoDB)
# "Initializing DocumentNodeStore with dataSource" → DocumentNodeStore (RDB)
# "MongoDocumentStore" → MongoDB backend
# "RDBDocumentStore" → RDB backend
```

::: warning What the logs actually show (Oak 1.22 and 2.4)
A bare `DocumentNodeStore` match proves nothing. The `oak-store-document` bundle ships with the AEM 6.5 and 6.5 LTS quickstart, and on TarMK it still logs `DocumentNodeStoreServicePreset` service events at startup: on the TarMK installs checked for this page, those were the first `NodeStore` lines in `error.log`. Read the store's own startup line instead, logged under `org.apache.jackrabbit.oak.segment.SegmentNodeStoreService` (`Primary SegmentNodeStore initialized`) or `org.apache.jackrabbit.oak.plugins.document.DocumentNodeStoreService` (`Starting DocumentNodeStore with host=…` for MongoDB, `Initializing DocumentNodeStore with dataSource …` for RDB). Those lines are written once per start, and `error.log` rolls over daily, so search the rotated `error.log.*` files too.
:::

### Check OSGi Config

```bash
# In running AEM, go to:
# http://localhost:4502/system/console/configMgr

# Search for "NodeStore" to see active configuration
```

## Summary Table

| Type | Directory | Config File | Recovery Tool |
|------|-----------|-------------|---------------|
| **SegmentStore** | `segmentstore/` | None needed in `install/` (active config: `launchpad/config/…/segment/SegmentNodeStoreService.config`) | `recover-journal` |
| **DocumentNodeStore (Mongo)** | N/A | `DocumentNodeStoreService.config` | `recovery` |
| **DocumentNodeStore (RDB)** | N/A | `DocumentNodeStoreService.config` | `recovery` |

::: info 📅 Last Updated
Content last reviewed: October 2026 • Verified against Oak 1.22.24 (AEM 6.5) and Oak 2.4.0 (AEM 6.5 LTS SP3)
:::
