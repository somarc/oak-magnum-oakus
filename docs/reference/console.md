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
| `:ls` | List children | `:ls` |
| `:pn` | Print node properties | `:pn` |
| `:pwd` | Print working directory | `:pwd` |

## Recovery Commands

| Command | Description | Example |
|---------|-------------|---------|
| `:count-nodes` | Count and find corruption | `:count-nodes` |
| `:remove-node <path>` | Remove single node | `:remove-node /path/to/bad` |
| `:remove-nodes <file>` | Remove nodes from file | `:remove-nodes /tmp/snfe.log` |
| `:binary-paths` | List binary references | `:binary-paths` |

## Index Commands

| Command | Description | Example |
|---------|-------------|---------|
| `:lucene` | Lucene index operations | `:lucene info` |
| `:checkpoint` | Checkpoint operations | `:checkpoint list` |

## Session Commands

| Command | Description | Example |
|---------|-------------|---------|
| `:refresh` | Refresh session | `:refresh` |
| `:commit` | Commit changes | `:commit` |
| `:exit` | Exit console | `:exit` |

## Examples

### Explore Repository

```bash
> :cd /content/dam
> :ls
2024/
2023/
shared/

> :cd 2024
> :ls
Q1/
Q2/
Q3/
Q4/

> :pn
jcr:primaryType = sling:Folder
jcr:created = 2024-01-01T00:00:00
```

### Find Corruption

```bash
> :count-nodes
Counting...
Found corruption at /content/dam/2024/Q3
Logged to /tmp/count-nodes-snfe-*.log

> :exit
$ cat /tmp/count-nodes-snfe-*.log
/content/dam/2024/Q3/bad-asset.pdf
```

### Remove Corrupted Nodes

```bash
# Start in read-write mode
$ java -jar oak-run-*.jar console --read-write /path/to/segmentstore

> :remove-nodes /tmp/count-nodes-snfe-*.log dry-run
Would remove: /content/dam/2024/Q3/bad-asset.pdf

> :remove-nodes /tmp/count-nodes-snfe-*.log
Removed: /content/dam/2024/Q3/bad-asset.pdf

> :exit
```

### Check Checkpoints

```bash
> :checkpoint list
b8dbd53c-... (ACTIVE)
a7cac42b-... (ORPHANED)

> :checkpoint rm-unreferenced
Removed 1 orphaned checkpoint
```

## Tips

::: tip Console Tips
1. **Use tab completion** - Commands and paths
2. **Start read-only** - Switch to read-write only when needed
3. **Commit changes** - Use `:commit` after modifications
4. **Check before exit** - Verify changes took effect
:::

## Key Takeaways

::: tip Remember
1. **Interactive shell** - Explore and modify repository
2. **Read-only by default** - Safe for exploration
3. **Recovery commands** - count-nodes, remove-nodes
4. **Always verify** - Check results before exiting
:::
