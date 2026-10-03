# 🔍 Identify Your Repository Type

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

```bash
# Check for DocumentNodeStore (MongoDB/RDB)
ls crx-quickstart/install/*DocumentNodeStoreService*.config

# If this file exists → You have DocumentNodeStore
```

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
| `oak-run compact` | Garbage collection |
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
- **SegmentStore** for Author
- **DocumentNodeStore** for Publish (clustered)

Check each instance separately!

## Still Not Sure?

### Check the Logs

```bash
grep -i "NodeStore" crx-quickstart/logs/error.log | head -20

# Look for:
# "SegmentNodeStore" → SegmentStore
# "DocumentNodeStore" → DocumentNodeStore
# "MongoDocumentStore" → MongoDB backend
# "RDBDocumentStore" → RDB backend
```

### Check OSGi Config

```bash
# In running AEM, go to:
# http://localhost:4502/system/console/configMgr

# Search for "NodeStore" to see active configuration
```

## Summary Table

| Type | Directory | Config File | Recovery Tool |
|------|-----------|-------------|---------------|
| **SegmentStore** | `segmentstore/` | N/A | `recover-journal` |
| **DocumentNodeStore (Mongo)** | N/A | `DocumentNodeStoreService.config` | `recovery` |
| **DocumentNodeStore (RDB)** | N/A | `DocumentNodeStoreService.config` | `recovery` |
