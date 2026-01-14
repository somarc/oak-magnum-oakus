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
| **Find corruption** | `:count-nodes` in console | Logs to `/tmp/count-nodes-snfe-*.log` |
| **Remove bad nodes** | `:remove-nodes <logfile> dry-run` | Always dry-run first! |
| **Extract content** | `oak-upgrade --copy-binaries src dst` | Last resort sidegrade |

## ⚠️ NEVER Do These

| ❌ DON'T | Why |
|----------|-----|
| Run `compact` before `check` | Deletes segments you might need |
| Run `compact` if check shows errors | Makes corruption permanent |
| Remove `/oak:index/uuid` or `/jcr:system` | Bricks the repository |
| Skip dry-run before remove-nodes | No undo! |

## 🕐 Time Estimates (100GB repo, SSD)

| Operation | Time |
|-----------|------|
| `oak-run check` | ~15 min |
| `recover-journal` | ~30 min |
| `count-nodes` (full) | ~2 hours |
| `remove-nodes` | ~10-30 min |
| `oak-upgrade` sidegrade | ~4-6 hours |
| Backup restore | ~1-2 hours |

## 🆘 Emergency Contact

**Adobe Support** - Your only realistic option for crisis response.

- AEM Cloud Service / AMS customers: Open a P1 support ticket
- On-premise customers: Contact your Adobe support representative

::: warning Reality Check
The Apache mailing lists are not responsive for crisis situations. Stack Overflow is effectively dead for niche technical topics in the age of AI. **Adobe Support is your lifeline.**
:::
