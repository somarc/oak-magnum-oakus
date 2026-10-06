# 🖥️ Oak Console Commands

::: info 🎯 Scope
SegmentStore (TarMK) • Oak 1.22.x – 2.4.0 ([version scope](/reference/oak-versions))  
**Not for AEMaaCS**
:::

The oak-run console provides an interactive shell for repository operations.

## Starting the Console

```bash
# Read-only mode (safe)
$ java -jar oak-run-*.jar console /path/to/segmentstore

# Read-write mode (for modifications)
$ java -jar oak-run-*.jar console --read-write /path/to/segmentstore

# Run one command or a script, then exit
$ java -jar oak-run-*.jar console /path/to/segmentstore ":load script.groovy"
```

In a `:load` script, assign variables without `def` (a `def` local doesn't survive to the next line).

Use the oak-run release that matches the repository's Oak version: `oak-run-1.22.x.jar` for AEM 6.5, `oak-run-2.4.0.jar` on AEM 6.5 LTS SP3 (Java 17+). The scope box above links the details.

### Options

The console takes oak-run's common options *(same in Oak 1.22.24 and 2.4.0)*:

| Option | What it does |
|--------|--------------|
| *(none)* | Read-only. Prints `Repository connected in read-only mode. Use '--read-write' for write operations`. Takes no lock, so it also opens a store that AEM has open |
| `--read-write` | Opens the store writable. Takes `repo.lock` and **waits without any message** while another process (AEM, another oak-run) holds it. Also makes the DataStore writable |
| `--fds-path <dir>` | FileDataStore directory |
| `--fds <file>` / `--s3ds <file>` / `--azureblobds <file>` | DataStore from a config file (`.config` in OSGi format, or `.cfg`/`.properties`) |
| `--ds-read-write` | DataStore writable while the node store stays read-only |
| `--quiet` / `--shell` | Less output / stay in the shell after running the command-line arguments |

Without DataStore options the console can't read any binary in the DataStore: `IllegalStateException: Attempt to read external blob with blobId [<id>#<length>] without specifying BlobStore` (`pn` shows such a property as `{-1 bytes}`). That also affects the fork's `:count-nodes datastore-binaries` ([count-nodes](/reference/count-nodes)). With `--read-write` and no DataStore options, binaries you create are stored inside the segment store.

::: tip The jansi warning
On Apple Silicon Macs both releases start with `WARN ... Error loading console support. Some console features might not work properly. See https://issues.apache.org/jira/browse/OAK-5961` and an `UnsatisfiedLinkError` stack trace. The console works anyway (lab, both releases).
:::

## Navigation Commands

| Command | Description | Example |
|---------|-------------|---------|
| `cd <path>` | Change directory | `cd /content/dam` |
| `ls [limit]` | List child names (first 50 by default) | `ls` |
| `pn` | Print current node (properties + children) | `pn` |

::: warning What the Oak code actually does (Oak 1.22 and 2.4)
Oak's own commands are registered with a long name and a short name, and the short name has **no colon**: `cd` (`:change-dir`), `ls` (`:list`), `pn` (`:print-node`), `cp` (`:checkpoint`), `rf` (`:refresh`), `rt` (`:retrieve`), `lc` (`:lucene`). The long name works with or without the colon; the short name only without it. `:cd`, `:ls` and `:pn` fail in both releases with `groovysh_parse: 2: unexpected token: :`. Groovy's own commands (`:exit`, `:help`, `:load`) and the fork's commands (`:count-nodes` …) are long names, so they work with the colon. `:help` prints the list. The short names are also why a script variable named `cp` breaks: `cp = …` runs `:checkpoint` with `=` as its argument.
:::

## Recovery Commands

::: warning ⚠️ Not in Apache Oak
`:count-nodes`, `:remove-node`, `:remove-nodes` and `:binary-paths` are not part of Apache Jackrabbit Oak (any version). They come from a community fork. See [Fork-only console commands](/reference/oak-versions#fork-only-console-commands) for how to get a build that matches your Oak version.
:::

| Command | Description | Example |
|---------|-------------|---------|
| `:count-nodes` | Count and find corruption | `:count-nodes` |
| `:remove-node <path>` | Remove single node (no dry-run) | `:remove-node /path/to/bad` |
| `:remove-nodes <file>` | Remove nodes from file | `:remove-nodes /tmp/snfe.log` |
| `:binary-paths <file>` | Print JCR paths referencing the blob IDs in a file | `:binary-paths blob-ids.txt` |

## Index Commands

| Command | Description | Example |
|---------|-------------|---------|
| `:lucene` | Lucene index operations (`info`, `dump`, `rmdata`; `info` and `dump` default to `/oak:index/lucene`, so pass your index path) | `:lucene info` |
| `:checkpoint [seconds]` | **Creates** a checkpoint (default lifetime 1 hour) | `:checkpoint 3600` |

::: warning `:checkpoint` in read-only mode
Without `--read-write`, `:checkpoint` logs `ERROR ... Failed to create checkpoint <id>.` with `UnsupportedOperationException: Cannot write to read-only store`, and then still prints `Checkpoint created: <id> (expires: …).` Nothing is stored (lab, both releases).
:::

## Session Commands

| Command | Description | Example |
|---------|-------------|---------|
| `:refresh [auto\|manual\|now]` | Refresh session (default `now`) | `:refresh` |
| `retrieve <checkpoint-id>` | Show the tree as it is in that checkpoint, until the next `:refresh` | `retrieve 8afb6cf7-…` |
| `:exit` | Exit console | `:exit` |

Auto-refresh is **off** by default. The console reads the root once and keeps showing it: changes made after that, by AEM, a Groovy merge or the fork's `:remove-node`, don't appear in `ls`/`pn` until you run `:refresh` (or `:refresh auto`).

## Examples

### Explore Repository

```bash
> cd /content/dam
> ls
2024
2023
shared

> cd 2024
> ls
Q1
Q2
Q3
Q4

> pn
{ jcr:primaryType = sling:Folder, jcr:created = 2024-01-01T00:00:00.000Z, Q1 = { ... }, Q2 = { ... }, ... }
```

### Find Corruption

```bash
> :count-nodes
Counting nodes in tree /
Warning: Missing segment at /content/dam/2024/Q3/: Segment abc123... not found
Total nodes in tree /: 145678
...

> :exit
$ cat count-nodes-snfe-*.log      # written to the directory you started oak-run from
Warning: Missing segment at /content/dam/2024/Q3/: Segment abc123... not found
```

### Remove Corrupted Nodes

```bash
# Start in read-write mode
$ java -jar oak-run-*.jar console --read-write /path/to/segmentstore

> :remove-nodes count-nodes-snfe-YYYYMMDD-HHmmss.log dry-run
RemoveNodesCommand completed. Full detailed log at: /current/dir/remove-nodes-YYYYMMDD-HHmmss.log

> :remove-nodes count-nodes-snfe-YYYYMMDD-HHmmss.log
RemoveNodesCommand completed. Full detailed log at: /current/dir/remove-nodes-YYYYMMDD-HHmmss.log

> :exit
```

::: info `:remove-nodes` does not delete `Missing segment` lines
It deletes nodes for missing-blob (`DataStoreException: Record`), unreadable-node (`Unable to read node`) and datastore-consistency (`aa/bb/cc/<hex>,<path>`) lines, and refuses paths shallower than 3 levels. `Warning: Missing segment at …` lines are logged as `[WARN]` and skipped, with the `:remove-node <path>` to run for each.
:::

### Check Checkpoints

The console has no checkpoint listing command — `:checkpoint` *creates* one. From Groovy, `println session.store.checkpoints().toList()` prints the IDs, and that works read-only while AEM is running. Otherwise use the `checkpoints` run mode (not the console). It opens the store writable, so it needs AEM stopped; while AEM holds `repo.lock` it waits without a message:

```bash
$ java -jar oak-run-*.jar checkpoints /path/to/segmentstore list
$ java -jar oak-run-*.jar checkpoints /path/to/segmentstore rm-unreferenced
```

## Tips

::: tip Console Tips
1. **Use tab completion** - Commands and paths
2. **Start read-only** - Switch to read-write only when needed
3. **No commit step** - There is no `:commit`; the fork's `:remove-node`/`:remove-nodes` merge each removal immediately. The merge reaches `journal.log` at the next flush (every 5 seconds) or on `:exit`; a `kill -9` right after a merge loses it
4. **Check before exit** - Verify changes took effect (run `:refresh` first, or `ls` still shows the old tree)
:::

## Key Takeaways

::: tip Remember
1. **Interactive shell** - Explore and modify repository
2. **Read-only by default** - Safe for exploration
3. **Recovery commands** - count-nodes, remove-nodes (fork only)
4. **Always verify** - Check results before exiting
:::

::: info 📅 Last Updated
Content last reviewed: October 2026 • Verified against Oak 1.22.24 (AEM 6.5) and Oak 2.4.0 (AEM 6.5 LTS SP3)
:::
