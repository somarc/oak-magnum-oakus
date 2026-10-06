# 📚 Command Reference

::: info 🎯 Scope
SegmentStore (TarMK) • Oak 1.22.x – 2.4.0 ([version scope](/reference/oak-versions))  
**Not for AEMaaCS**
:::

Complete reference for oak-run commands and console operations.

## oak-run Commands

### Diagnostic Commands

| Command | Description |
|---------|-------------|
| `check` | Verify repository consistency |
| `checkpoints` | Manage checkpoints |
| `datastorecheck` | Verify DataStore consistency |
| `explore` | Interactive repository browser |

### Recovery Commands

| Command | Description |
|---------|-------------|
| `recover-journal` | Rebuild journal.log |
| `console` | Interactive console for repairs |
| `compact` | Run offline compaction |

### Maintenance Commands

| Command | Description |
|---------|-------------|
| `datastore` | DataStore garbage collection (deletes nothing without `--ds-read-write`, see [DataStore GC](/datastore/gc)) |
| `tarmkdiff` | Diff revisions within one segment store |

## Console Commands

When running `oak-run console`:

| Command | Description |
|---------|-------------|
| `:help` | Show available commands |
| `:count-nodes` | Count nodes and detect corruption ⚠️ fork only |
| `:remove-nodes` | Remove nodes listed in a log (not `Missing segment` lines) ⚠️ fork only |
| `:remove-node` | Remove one node immediately, no dry-run ⚠️ fork only |
| `:refresh` | Refresh repository state (auto-refresh is off, so the console shows the root it first read until you run it) |
| `:exit` | Exit console |

Oak's navigation commands have no colon: `cd`, `ls`, `pn` (`:cd`, `:ls`, `:pn` are a parse error in both releases). See [Console Commands](/reference/console#navigation-commands).

::: warning ⚠️ Not in Apache Oak
`:count-nodes`, `:remove-node` and `:remove-nodes` are not part of Apache Jackrabbit Oak (any version). They come from a community fork. See [Fork-only console commands](/reference/oak-versions#fork-only-console-commands) for how to get a build that matches your Oak version.
:::

## Detailed Guides

- [count-nodes](/reference/count-nodes) - Deep node analysis
- [Console Commands](/reference/console) - Interactive console reference
- [Troubleshooting](/reference/troubleshooting) - Common issues and solutions

::: info 📅 Last Updated
Content last reviewed: October 2026 • Verified against Oak 1.22.24 (AEM 6.5) and Oak 2.4.0 (AEM 6.5 LTS SP3)
:::
