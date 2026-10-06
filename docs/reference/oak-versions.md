# 🎯 Oak Version Scope

::: info 🎯 Scope
SegmentStore (TarMK) • Oak 1.22.x (AEM 6.5) → Oak 2.4.0 (AEM 6.5 LTS SP3)  
**Not for AEMaaCS**
:::

Every command, flag, default, and log message in this guide has been checked against Apache Oak source at both ends of the on-premise AEM 6.5 family: **Oak 1.22.24** (AEM 6.5) and **Oak 2.4.0** (AEM 6.5 LTS SP3). Where the two behave differently, the page tells you which Oak release introduced the change.

## The Oak Versions This Guide Covers

| AEM release | Oak (`oak-core`) | Matching oak-run | Java for oak-run |
|-------------|------------------|------------------|------------------|
| **AEM 6.5** service packs | **1.22.x** (6.5.25.0 requires 1.22.20 or later) | `oak-run-1.22.x` — same patch as your `oak-core` | 8 or 11 |
| AEM 6.5 LTS GA | 1.68.x | `oak-run-1.68.0` | 11+ |
| AEM 6.5 LTS SP1 | 1.78.1 (Adobe build `1.78.1.B002`) | `oak-run-1.78.0` (no Apache 1.78.1 exists) | 11+ |
| AEM 6.5 LTS SP2 | 1.88.0 | `oak-run-1.88.0` | 11+ |
| **AEM 6.5 LTS SP3** | **2.4.0** | `oak-run-2.4.0` | 17+ |

Sources: AEM 6.5 and 6.5 LTS release notes, and the bundle lists Adobe publishes with each LTS service pack (`65lts_sp1_bundles` … `65lts_sp3_bundles`), cross-checked against real AEM 6.5.23 and LTS SP3 installs and the LTS SP1 quickstart.

AEM 6.5 LTS does **not** stay on one Oak line: each service pack moves it forward. Always check your own `oak-core` version (below) instead of assuming.

## 🏷️ Reading the Version Markers

- **No marker** → the statement holds for every Oak version in the table.
- ***(since Oak 1.46 — not in AEM 6.5)*** → applies when your `oak-core` is 1.46 or newer: every AEM 6.5 LTS service pack, but not AEM 6.5.
- ***(since Oak 1.80)*** → AEM 6.5 LTS SP2 (1.88.0) and SP3 (2.4.0), but not LTS GA or SP1.
- ***(before Oak 1.86)*** → applies when your `oak-core` is older than 1.86: AEM 6.5, LTS GA and LTS SP1.
- An **Oak 1.22 vs 2.4** box shows both ends side by side. If you run an LTS release between them, use the "since" release in the box to place yourself.

## ❌ Out of Scope

| Not covered | Why |
|-------------|-----|
| **Oak 2.6.0+** (newer Apache releases and trunk) | Not shipped in any AEM 6.5 release yet. Flags and defaults keep changing. |
| **Oak versions older than 1.22** | Not verified against this guide. |
| **AEMaaCS** | No filesystem access; Adobe operates the repository. |
| **DocumentNodeStore** (MongoMK / RDB) | Different persistence. None of the TarMK procedures apply. |

## 🔍 Find Your Oak Version

**AEM is running:** open `/system/console/bundles` and read the version of `org.apache.jackrabbit.oak-core`.

**AEM will not start:** read it from the Felix bundle cache on disk (read-only):

```bash
cd crx-quickstart/launchpad/felix
for j in bundle*/version*/bundle.jar; do
  m=$(unzip -p "$j" META-INF/MANIFEST.MF 2>/dev/null | tr -d '\r')
  echo "$m" | grep -qx 'Bundle-SymbolicName: org.apache.jackrabbit.oak-core' \
    && echo "$m" | grep '^Bundle-Version'
done
```

Example output: `Bundle-Version: 1.22.22` on AEM 6.5.23, `Bundle-Version: 2.4.0` on AEM 6.5 LTS SP3.

## 🧰 Get the Matching oak-run

```bash
# Set V to your oak-core version from the table above (1.22.x, 1.68.0, 1.78.0, 1.88.0 or 2.4.0)
V=1.22.24
curl -LO https://repo1.maven.org/maven2/org/apache/jackrabbit/oak-run/$V/oak-run-$V.jar
java -jar oak-run-$V.jar help   # prints "Apache Jackrabbit Oak <V>" and the run modes
```

| oak-run | Java 8 | Java 11 | Java 17 / 21 |
|---------|--------|---------|--------------|
| 1.22.x | ✅ | ✅ | starts; prefer the JDK your AEM 6.5 runs on (8 or 11) |
| 1.68.0 – 1.88.0 | ❌ `UnsupportedClassVersionError` | ✅ | ✅ |
| 2.4.0 | ❌ | ❌ `UnsupportedClassVersionError` | ✅ |

::: warning Why the version has to match
Oak 1.22.24 and 2.4.0 write the same on-disk format (segment version 13, store version 2), so a mismatched oak-run will usually open your repository. What changes between releases is **behavior**: available flags, compaction modes, cleanup rules, and defaults. With a mismatched oak-run, you are running an unverified procedure on a damaged repository.
:::

## 🔀 What Differs Between Oak 1.22 and 2.4

Everything not listed here behaves the same at both ends of the range. "Changed in" is the first Apache Oak release with the 2.4 behavior: if your `oak-core` is at least that version, use the 2.4 column.

| Area | AEM 6.5 (Oak 1.22.x) | AEM 6.5 LTS SP3 (Oak 2.4.0) | Changed in | Details |
|------|----------------------|-----------------------------|------------|---------|
| Offline compaction mode | Always full | Full by default; `--tail` for tail compaction | 1.60 | [Compaction](/recovery/compaction) |
| `compact --compactor` | Not available | `classic`, `diff`, `parallel` (default `parallel`) | 1.28 (`parallel` 1.58) | [Generational GC](/architecture/gc) |
| `compact --threads` | Not available | Threads for the `parallel` compactor (default 1) | 1.58 | [Compaction](/recovery/compaction) |
| `compact --force` | Boolean: write `--force=true` (a bare `--force` means `false`) | Plain flag | 1.60 | [Compaction](/recovery/compaction) |
| `check --fail-fast` | Not available | Stop at the first inconsistent revision | 1.66 | [oak-run check](/recovery/check) |
| `datastore --check-consistency [markOnly]` | No `markOnly` argument | Optional `markOnly` | 1.54 | [Consistency Check](/datastore/consistency) |
| `datastore --sweep-only-refs-past-retention` | Not available | Available | 1.28 | [DataStore GC](/datastore/gc) |
| `datastorecheck --verboseRootPath` | Not available | Available | 1.26 | [Consistency Check](/datastore/consistency) |
| Async-indexing checkpoint lifetime | 1000 days | 100 days | 1.66 | [Async Indexing](/checkpoints/async-indexing) |
| `failingIndexTimeoutSeconds` default | 1800 s (30 min) | 604800 s (7 days) | 1.32 | [Death Loop](/checkpoints/death-loop) |
| Move a stuck index lane forward | Offline procedure only | IndexStats MBean `forceIndexLaneCatchup("CONFIRM")` | 1.66 | [Checkpoint Advancement](/checkpoints/checkpoint-advancement) |
| Cleanup of a TAR file with no `.gph` graph | Always rewritten | Rewritten only when more than 25% is reclaimable | 1.86 | [TAR Files](/architecture/tar-files) |

## 🍴 Fork-Only Console Commands {#fork-only-console-commands}

`:count-nodes`, `:remove-nodes`, `:remove-node`, and `:binary-paths` are **not part of Apache Jackrabbit Oak (any version)**. Their source lives in the community fork [somarc/jackrabbit-oak](https://github.com/somarc/jackrabbit-oak), branch `feature/oak-run` ([command source](https://github.com/somarc/jackrabbit-oak/tree/feature/oak-run/oak-run/src/main/groovy/org/apache/jackrabbit/oak/console/commands)). The branch itself is an unreleased Oak development snapshot, not a release, so its oak-run matches no AEM release. Don't run it as-is. Instead, add the four commands to the Apache oak-run release that matches your `oak-core`.

The recipe below has been built and smoke-tested (count, dry-run, delete) on Oak 1.22.24, 1.68.0, 1.78.0, 1.88.0, and 2.4.0, the full AEM 6.5 / 6.5 LTS range.

```bash
V=1.22.24   # the oak-run release matching your oak-core (see the table above)
git clone --depth 1 -b jackrabbit-oak-$V https://github.com/apache/jackrabbit-oak oak-$V
git clone --depth 1 -b feature/oak-run https://github.com/somarc/jackrabbit-oak oak-fork

SRC=oak-fork/oak-run/src/main/groovy/org/apache/jackrabbit/oak/console
C=oak-$V/oak-run/src/main/groovy/org/apache/jackrabbit/oak/console
for c in CountNodes RemoveNodes RemoveNode BinaryPaths; do
  cp $SRC/commands/${c}Command.groovy $SRC/commands/${c}Command.properties $C/commands/
done

# Register the commands in the console
perl -0pi -e 's/new ExportCommand\(shell\)/new ExportCommand(shell),\n                new CountNodesCommand(shell), new RemoveNodeCommand(shell),\n                new RemoveNodesCommand(shell), new BinaryPathsCommand(shell)/' $C/GroovyConsole.groovy

# Build: JDK 11 for 1.22.x – 1.88.0, JDK 17+ for 2.4.0
cd oak-$V/oak-run
mvn -B package -DskipTests -Dbaseline.skip=true -Drat.skip=true -Dcheckstyle.skip -Denforcer.skip
# → target/oak-run-$V.jar   (Java 8+ for 1.22.x, 11+ for 1.68–1.88, 17+ for 2.4.0)
```

Only `oak-run` is built; every other Oak module comes from Maven Central at the same version.

### What the commands actually do

| Command | Syntax | Writes to the store? | Log file (current directory) |
|---------|--------|----------------------|------------------------------|
| `:count-nodes` | `:count-nodes [segment-binaries \| datastore-binaries \| deep] [analysis]` | No | `count-nodes-snfe-yyyyMMdd-HHmmss.log` |
| `:remove-nodes` | `:remove-nodes <input-file> [dry-run] [debug]` | Yes (needs `--read-write` unless `dry-run`) | `remove-nodes-yyyyMMdd-HHmmss.log` |
| `:remove-node` | `:remove-node <path>` | Yes, immediately (needs `--read-write`; no dry-run) | none |
| `:binary-paths` | `:binary-paths <blob-ids-file>` | No | none |

- `:count-nodes` always walks the whole tree from `/`; there is no path argument. Pick at most one of the three binary modes. It logs `Warning: Missing segment at <path>: …`, `Warning: Missing blob at <path>: …`, and `Warning: Unable to read node <path>: …`.
- `:remove-nodes` deletes for datastore-consistency lines (`aa/bb/cc/<id>,<path>`), `Missing blob … DataStoreException: Record` lines, and `Unable to read node` lines; a missing DAM original removes the whole asset. **`Missing segment` lines are only logged, never deleted**; the report prints the `:remove-node <path>` to run for each. It refuses paths shallower than depth 3.
- `:remove-node` refuses `/` and top-level nodes.
- `:binary-paths` matches external DataStore blobs only. Blobs stored inside segments have no content identity, so they never match.

