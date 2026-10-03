# 🖥️ Oak Console Commands

The oak-run console provides an interactive shell for repository operations.

## Starting the Console

```bash
# Read-only mode (safe)
$ java -jar oak-run-*.jar console /path/to/segmentstore

# Read-write mode (for modifications)
$ java -jar oak-run-*.jar console --read-write /path/to/segmentstore
```

## Navigation Commands

| Command | Description | Example |
|---------|-------------|---------|
| `:cd <path>` | Change directory | `:cd /content/dam` |
| `:ls [limit]` | List child names (first 50 by default) | `:ls` |
| `:pn` | Print current node (properties + children) | `:pn` |

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
| `:lucene` | Lucene index operations | `:lucene info` |
| `:checkpoint [seconds]` | **Creates** a checkpoint (default lifetime 1 hour) | `:checkpoint 3600` |

## Session Commands

| Command | Description | Example |
|---------|-------------|---------|
| `:refresh [auto\|manual\|now]` | Refresh session (default `now`) | `:refresh` |
| `:exit` | Exit console | `:exit` |

## Examples

### Explore Repository

```bash
> :cd /content/dam
> :ls
2024
2023
shared

> :cd 2024
> :ls
Q1
Q2
Q3
Q4

> :pn
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
It deletes nodes only for missing-blob (`DataStoreException: Record`) and datastore-consistency (`aa/bb/cc/<hex>,<path>`) lines, and refuses paths shallower than 3 levels. `Warning: Missing segment at …` lines are logged as `[WARN]` and skipped — remove those paths with `:remove-node <path>`.
:::

### Check Checkpoints

The console has no checkpoint listing — `:checkpoint` *creates* one. Use the `checkpoints` run mode instead (not the console):

```bash
$ java -jar oak-run-*.jar checkpoints /path/to/segmentstore list
$ java -jar oak-run-*.jar checkpoints /path/to/segmentstore rm-unreferenced
```

## Tips

::: tip Console Tips
1. **Use tab completion** - Commands and paths
2. **Start read-only** - Switch to read-write only when needed
3. **No commit step** - There is no `:commit`; the fork's `:remove-node`/`:remove-nodes` merge each removal immediately
4. **Check before exit** - Verify changes took effect
:::

## Key Takeaways

::: tip Remember
1. **Interactive shell** - Explore and modify repository
2. **Read-only by default** - Safe for exploration
3. **Recovery commands** - count-nodes, remove-nodes (fork only)
4. **Always verify** - Check results before exiting
:::
