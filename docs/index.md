---
layout: home

hero:
  name: "The Magnum OAKus"
  text: "Production-grade recovery for Apache Oak"
  tagline: "A checklist for the 3 AM incident, and the corpus that explains why it works."
  image:
    src: /oak-tree.svg
    alt: Oak Tree
  actions:
    - theme: brand
      text: 🚨 In crisis? Start here
      link: /crisis/
    - theme: alt
      text: Read the corpus
      link: "#corpus"

# Rendered by theme/components/HomeScope.vue under the hero buttons
scope:
  fits:
    - SegmentStore (TarMK)
    - AEM 6.5 & 6.5 LTS (Oak 1.22.x – 2.4.0)
    - filesystem access
  excludes:
    - AEMaaCS
    - DocumentNodeStore (MongoMK/RDB)
  link:
    text: Which Oak do I have?
    href: /reference/oak-versions

# Rendered by theme/components/HomeIncident.vue. The card condenses /crisis/ Steps 1-5 and its
# NEVER list - keep them in sync. Each symptom tile summarizes the page it links to.
incident:
  kicker: In an incident
  title: Follow the boxes in order. Do not skip boxes.
  card:
    note: Print this · Laminate it · Tape it to your monitor
    title: Crisis checklist
    steps:
      - title: Do you have a backup?
        body: "Recent, tested (&lt; 24 hours)? <strong>Restore it now.</strong> Stop reading. Old backup the business won't accept, or none: continue, and prepare for data loss. Don't know? Find out first."
        link: "/crisis/#✅-step-1-do-you-have-a-backup"
      - title: Identify your repository type
        body: "<code>segmentstore/</code> under <code>crx-quickstart/repository/</code>: SegmentStore (TarMK), continue. DocumentNodeStore is out of scope. Not sure what you're looking at? Stop. Get someone who knows Oak."
        link: "/crisis/#✅-step-2-identify-your-repository-type"
      - title: Run the diagnostic
        body: "Stop AEM. Use the oak-run release that matches your oak-core, and save the output."
        command: "java -jar oak-run-*.jar check /path/to/segmentstore 2>&1 | tee check.log"
        link: "/crisis/#✅-step-3-run-diagnostic-command"
        outcomes:
          - tone: good
            signal: "Latest good revision for paths and checkpoints checked is…"
            action: Recoverable. Go to box 4.
          - tone: warn
            signal: "No good revision found"
            action: Severely corrupted. Go to box 5.
          - tone: bad
            signal: "Fails with SegmentNotFoundException or IOException"
            action: Bricked. Restore from backup. No other option.
      - title: Choose a recovery path
        body: "<code>recover-journal</code>: simpler, loses recent changes. Surgical removal: preserves more data, slower, and needs fork-only console commands (<code>:count-nodes</code>, <code>:remove-nodes</code>, <code>:remove-node</code>)."
        link: "/crisis/#✅-step-4-choose-recovery-path"
      - title: Last resort
        body: "No good revision. Reconsider any backup, even an old one. Otherwise rebuild the journal with <code>recover-journal</code> and check again; still no good revision? Sidegrade with <code>oak-upgrade</code>, excluding the paths check flagged. <strong>This will lose data.</strong>"
        link: "/crisis/#✅-step-5-last-resort-no-good-revision"
    never:
      text: "run <code>compact</code> before <code>check</code>, when <code>check</code> shows any errors, or while you suspect corruption."
      more: All six never-dos
      link: "/crisis/#🚫-never-do-these"
  symptoms:
    title: What are you seeing?
    items:
      - signal: "SegmentNotFoundException: Segment … not found"
        log: true
        cause: Segment corruption or a missing TAR file.
        dest: SNFE Playbook
        link: /recovery/snfe-playbook
      - signal: "Unable to access revision …, rewinding..."
        log: true
        cause: Journal entries point at missing segments. Oak rewinds to an older revision, so recent changes look lost.
        dest: "Crisis checklist, box 3"
        link: "/crisis/#✅-step-3-run-diagnostic-command"
      - signal: "IllegalStateException: … is in use by another store."
        log: true
        cause: The store is already open (repo.lock held). If startup just hangs, another process holds it. Find it with lsof; don't delete the lock.
        dest: "Repository Won't Start"
        link: "/reference/troubleshooting#repository-won-t-start"
      - signal: Disk 100% full
        cause: "Free space first: a full disk can stop the repository opening. Don't compact to make room; compaction itself needs 2× the store size."
        dest: "Crisis checklist, box 3"
        link: "/crisis/#✅-step-3-run-diagnostic-command"
      - signal: "DataStoreException: Record does not exist"
        log: true
        cause: A blob is missing from the DataStore.
        dest: DataStore Consistency
        link: /datastore/consistency
      - signal: "OutOfMemoryError during startup"
        log: true
        tone: calm
        cause: Heap too small for the repository size.
        dest: Not corruption. Increase the heap.
      - signal: Disk keeps growing; compaction doesn't reclaim space
        cause: Orphaned checkpoints pinning old segments.
        dest: Checkpoint Disk Bloat
        link: /checkpoints/disk-bloat
      - signal: Search misses recent content; indexer keeps restarting
        cause: Async indexing failing over and over while checkpoints pile up.
        dest: The Indexer Death Loop
        link: /checkpoints/death-loop
      - signal: Repository slow, high CPU or I/O
        cause: Too many TAR files, too many checkpoints, or a large repository.
        dest: Performance Issues
        link: "/reference/troubleshooting#performance-issues"
  sizes:
    title: How long will this take?
    lede: Repository size decides everything. Measure it first.
    command: du -sh crx-quickstart/repository/segmentstore/
    rows:
      - size: "< 100 GB"
        time: Hours, one shift
      - size: 100–500 GB
        time: Half to full day
      - size: 500 GB–1 TB
        time: 12–48 hours
      - size: 1–2 TB
        time: 24–96 hours
      - size: 2 TB+
        time: Week-scale
    note: "oak-run operations are I/O bound and read most of the segment store, so time scales with size. On-premise stores commonly reach 500 GB–2 TB. Uncertain, stressed, or doing this for the first time? Multiply every estimate by 3–5×."
    link:
      text: Time per operation
      href: "/crisis/#⏱️-time-estimates"

# Rendered by theme/components/HomeCorpus.vue. Chapters come from the sidebar; word counts and
# reading times are measured at build time (theme/word-counts.data.ts).
corpus:
  kicker: The corpus
  title: Understand before you act.
  lede: "Thousands of hours of production incident response, written down. The checklist tells you what to do; the corpus explains why it works, and when it won't."
  parts:
    - prefix: /architecture/
      title: Architecture
      blurb: Why recovery works the way it does. Segments, TAR files, journal, and generational garbage collection.
    - prefix: /recovery/
      title: Recovery Operations
      blurb: oak-run check, journal recovery, surgical removal, compaction, and sidegrade procedures.
    - prefix: /checkpoints/
      title: Checkpoints
      blurb: Disk bloat, async indexing errors, and the dreaded "death loop".
    - prefix: /datastore/
      title: DataStore
      blurb: Consistency checking and garbage collection for FileDataStore, S3, and Azure.
    - prefix: /reference/
      title: Reference
      blurb: oak-run commands, console operations, Oak version scope, and troubleshooting.
---

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

