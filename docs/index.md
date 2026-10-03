---
layout: home

hero:
  name: "The Magnum OAKus"
  text: "Production-grade recovery for Apache Oak"
  tagline: "SegmentStore (TarMK) • Oak 1.22.x – 2.4.0 (AEM 6.5 & 6.5 LTS) • Not for AEMaaCS"
  image:
    src: /oak-tree.svg
    alt: Oak Tree
  actions:
    - theme: alt
      text: 🚨 IN CRISIS? START HERE
      link: /crisis/
    - theme: brand
      text: 📚 Learn the Architecture
      link: /architecture/
    - theme: alt
      text: View on GitHub
      link: https://github.com/somarc/oak-magnum-oakus

features:
  - icon: 🚨
    title: Crisis Response
    details: Checkbox-driven checklist for repository corruption. Follow the boxes, zero fluff. Get your repository back online.
    link: /crisis/
  - icon: 🏗️
    title: Architecture Primer
    details: Understand why recovery works the way it does. Segments, TAR files, journal, and generational garbage collection.
    link: /architecture/
  - icon: 🛠️
    title: Recovery Operations
    details: oak-run check, journal recovery, surgical removal, compaction, and sidegrade procedures.
    link: /recovery/
  - icon: 📋
    title: Checkpoint Management
    details: Fix disk bloat, async indexing errors, and the dreaded "death loop" scenario.
    link: /checkpoints/
  - icon: 💾
    title: DataStore Tools
    details: Consistency checking, garbage collection, and blob management for FileDataStore, S3, and Azure.
    link: /datastore/
  - icon: 📚
    title: Command Reference
    details: Complete reference for oak-run commands, console operations, and troubleshooting guides.
    link: /reference/
---

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: linear-gradient(135deg, #4ade80 0%, #22c55e 50%, #16a34a 100%);
}
</style>

## 🌳 What is The Magnum OAKus?

The definitive guide to Apache Oak repository operations, born from years of production incident response and deep architectural understanding.

::: danger 🎯 SCOPE
This guide requires direct filesystem access to the repository.

Verified against **Oak 1.22.x** (AEM 6.5) and **Oak 2.4.0** (AEM 6.5 LTS SP3). [Check your Oak version →](/reference/oak-versions)

**Not for AEMaaCS**
:::

**This guide will help you:**

- 🚨 **Recover from corruption** - Step-by-step procedures for every scenario
- 🏗️ **Understand the architecture** - Know why recovery works (or doesn't)
- ⚡ **Optimize performance** - Compaction, checkpoints, and disk management
- 🔍 **Diagnose issues** - Tools and techniques for root cause analysis

## ⚠️ Critical Reality Check

> **Repository corruption scenarios fall into three categories:**
>
> 1. **Recoverable** - Good revision found by `oak-run check` ✅
> 2. **Partially Recoverable** - Check completes but finds "no good revision" ⚠️
> 3. **Unrecoverable** - Check fails completely with SegmentNotFoundException ❌
>
> **If you have a recent, tested backup: RESTORE IT NOW.** Stop reading. Don't run diagnostics. Every minute spent "investigating" is wasted time when you have a guaranteed good state.

## 📏 Know Your Repository Size

::: warning Production Reality
On-premise AEM installations commonly accumulate **500GB to 2TB+** segment stores over years of operation. Time estimates throughout this guide scale dramatically with repository size.

| Repository Size | Recovery Reality |
|-----------------|------------------|
| < 100GB | Hours - manageable in a single shift |
| 100-500GB | Half-day to full day operations |
| 500GB-1TB | Multi-day operations (12-48 hours) |
| 1-2TB | Multi-day operations (24-96 hours) |
| 2TB+ | Week-scale operations - plan accordingly |

**Before estimating recovery time**, determine your segment store size:
```bash
du -sh crx-quickstart/repository/segmentstore/
```

All oak-run operations are **I/O bound** and traverse the entire segment store. There is no way to parallelize or speed up these operations.
:::

## 🚀 Quick Navigation

| Scenario | Start Here |
|----------|------------|
| **AEM won't start** | [Crisis Checklist](/crisis/) |
| **SegmentNotFoundException** | [Recovery Decision Tree](/crisis/decision-tree) |
| **Disk full / bloating** | [Checkpoint Management](/checkpoints/) |
| **Slow performance** | [Compaction Guide](/recovery/compaction) |
| **Learning the system** | [Architecture Primer](/architecture/) |

## 📖 About This Guide

Originally authored for Adobe Customer Support, The Magnum OAKus represents thousands of hours of production incident response distilled into actionable procedures.

**Scope:**

| ✅ Applicable | ❌ Not Applicable |
|--------------|------------------|
| SegmentStore (TarMK) | AEMaaCS |
| Direct filesystem access | DocumentNodeStore (MongoMK/RDB) |
| | Abstracted repository layer |

**Version Context:**
- **AEM 6.5** runs Oak **1.22.x** (6.5.25.0 requires `oak-core` 1.22.20 or later)
- **AEM 6.5 LTS** moves Oak forward with each service pack: GA 1.68.x → SP1 1.78.1 → SP2 1.88.0 → SP3 **2.4.0**
- Every procedure is checked against Oak 1.22.24 and 2.4.0; differences are marked with the Oak release that introduced them
- Use the oak-run release that matches your `oak-core` — see [Oak Version Scope](/reference/oak-versions)

**Philosophy:**
- **Backup-first** - The only guaranteed recovery method
- **Understand before acting** - Know why procedures work
- **Time-bounded decisions** - When in doubt, restore from backup

::: info 📅 Last Updated
Content last reviewed: October 2026 • Verified against Oak 1.22.24 (AEM 6.5) and Oak 2.4.0 (AEM 6.5 LTS SP3)
:::

