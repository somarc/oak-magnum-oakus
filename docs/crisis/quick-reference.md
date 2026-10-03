# ⚡ Quick Reference Card

> **Print this. Laminate it. Tape it to your monitor.**

## 🔴 STOP - Before You Do Anything

```
□ Do you have a RECENT backup? → RESTORE IT. You're done.
□ Is AEM still running? → STOP IT NOW (graceful shutdown)
□ Do you know your repository type? → Check below
```

## 🔍 Identify Repository Type

```bash
# SegmentStore (TarMK) - Most common
ls crx-quickstart/repository/segmentstore/
# If exists → You have SegmentStore

# DocumentNodeStore (MongoDB/RDB)
ls crx-quickstart/install/*DocumentNodeStoreService*.config
# If exists → You have DocumentNodeStore
```

## 📋 Command Cheat Sheet

| Situation | Command | Notes |
|-----------|---------|-------|
| **Diagnose** | `oak-run check /path/to/segmentstore` | Always run first |
| **Rebuild journal** | `oak-run recover-journal /path/to/segmentstore` | Safe, non-destructive |
| **Find corruption** | `:count-nodes` in console | ⚠️ fork only; log in current dir |
| **Remove bad nodes** | `:remove-nodes <logfile> dry-run` | ⚠️ fork only; never deletes `Missing segment` lines |
| **Extract content** | `oak-upgrade --exclude-paths=<bad> <src-repo-dir> <dst-repo-dir>` | Last resort [sidegrade](/recovery/sidegrade); aborts on any unreadable node |

::: warning ⚠️ Not in Apache Oak
`:count-nodes` and `:remove-nodes` are not part of Apache Jackrabbit Oak (any version). They come from a community fork. See [Fork-only console commands](/reference/oak-versions#fork-only-console-commands) for how to get a build that matches your Oak version.
:::

`oak-run` = the release matching your Oak version: `oak-run-1.22.x.jar` for AEM 6.5; for AEM 6.5 LTS the oak-run equal to your oak-core version (`oak-run-2.4.0.jar` on SP3, Java 17+) — see [which LTS SP has which Oak](/reference/oak-versions).

## ⚠️ NEVER Do These

| ❌ DON'T | Why |
|----------|-----|
| Run `compact` before `check` | Deletes segments you might need |
| Run `compact` if check shows errors | Fixes nothing; a successful run deletes the older revisions you could roll back to |
| Remove `/oak:index/uuid` or `/jcr:system` | Bricks the repository |
| Skip dry-run before remove-nodes | No undo! |

## 🕐 Time Estimates

::: danger ⚠️ CRITICAL: Time Scales With Size
All oak-run operations are **I/O bound** and must traverse the entire segment store. There is no way to parallelize or speed up these operations (exception: offline `compact --threads N` *(since Oak 1.58 — not in AEM 6.5)*).

**First**: Know your repository size:
```bash
du -sh crx-quickstart/repository/segmentstore/
```
:::

### Reference: 100GB Repository (SSD)

| Operation | Time |
|-----------|------|
| `oak-run check` | ~15 min |
| `recover-journal` | ~30-45 min |
| `count-nodes` (full) | ~2 hours |
| `remove-nodes` | ~10-30 min |
| `oak-upgrade` sidegrade | ~4-6 hours |
| Backup restore | ~1-2 hours |

### Production Reality: Scaling Factor

| Repository Size | Multiply Times By |
|-----------------|-------------------|
| 100GB | 1x (baseline) |
| 250GB | 2-3x |
| 500GB | 4-6x |
| 1TB | 10-15x |
| 2TB+ | 20-30x |

**Example**: `recover-journal` on a 1TB repo = 30 min × 15 = **7-12 hours**

::: tip On-Prem Reality
Production on-premise AEM installations commonly have **500GB-2TB** segment stores after years of content accumulation. Plan recovery windows accordingly.
:::
