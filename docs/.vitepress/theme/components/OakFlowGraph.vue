<script setup lang="ts">
import { ref, computed, useId } from 'vue'

interface Node {
  id: string
  type: string
  x: number
  y: number
  label: string
  icon: string
  color: string
  description?: string
  radius?: number
}

interface Edge {
  from: string
  to: string
  type: string
  color: string
  label?: string
  width?: number
  curve?: number // bend of the quadratic curve; negative bends the other way
}

const props = defineProps<{
  flow: 'segment-structure' | 'tar-lifecycle' | 'gc-cycle' | 'compaction' | 'checkpoint-pin' | 'recovery-decision' | 'journal-rebuild' | 'pre-text-extraction'
  interactive?: boolean
}>()

const emit = defineEmits(['nodeClick'])

// Unique per instance: several graphs can share a page.
const uid = useId()
const hoveredNode = ref<Node | null>(null)
const nodes = ref<Node[]>([])
const edges = ref<Edge[]>([])
const isAnimating = ref(false)
const animationPackets = ref<{ id: string; x: number; y: number; color: string }[]>([])

// Oak-specific node types
const NODE_TYPES: Record<string, { icon: string; color: string }> = {
  SEGMENT: { icon: '📦', color: '#3b82f6' },
  TAR_FILE: { icon: '🗃️', color: '#8b5cf6' },
  JOURNAL: { icon: '📜', color: '#f59e0b' },
  CHECKPOINT: { icon: '📍', color: '#ec4899' },
  ROOT: { icon: '🌳', color: '#4ade80' },
  NODE_RECORD: { icon: '📄', color: '#06b6d4' },
  BLOB_REF: { icon: '🔗', color: '#f97316' },
  GARBAGE: { icon: '🗑️', color: '#ef4444' },
  LIVE: { icon: '✅', color: '#22c55e' },
  GENERATION: { icon: '🔢', color: '#a855f7' },
  COMPACTION: { icon: '⚙️', color: '#6366f1' },
  REAPER: { icon: '🧹', color: '#64748b' },
  DECISION: { icon: '❓', color: '#eab308' },
  SUCCESS: { icon: '✅', color: '#22c55e' },
  FAILURE: { icon: '❌', color: '#ef4444' },
  BACKUP: { icon: '💾', color: '#0ea5e9' },
  BINARY: { icon: '📁', color: '#f97316' },
  CSV: { icon: '📋', color: '#06b6d4' },
  TIKA: { icon: '🔍', color: '#a855f7' },
  TEXT_STORE: { icon: '📝', color: '#22c55e' },
  INDEX: { icon: '🔎', color: '#ec4899' },
  OSGI: { icon: '⚙️', color: '#f59e0b' },
}

const EDGE_COLORS: Record<string, string> = {
  DATA: '#4ade80',
  REFERENCE: '#3b82f6',
  CONTROL: '#8b5cf6',
  DELETE: '#ef4444',
  COPY: '#22c55e',
}

const DEFAULT_RADIUS = 28
const LABEL_CHAR_WIDTH = 7 // approximate px per character at the label font sizes
const PADDING = 16
const MIN_SCALE = 0.75 // below this, scroll horizontally instead of shrinking the text

// The canvas is fitted to the nodes, their labels and the edge labels, so nothing can be clipped.
const viewBox = computed(() => {
  const xs: number[] = []
  const ys: number[] = []
  for (const n of nodes.value) {
    const r = (n.radius || DEFAULT_RADIUS) + 8 // outer glow ring
    const half = Math.max(r, (n.label.length * LABEL_CHAR_WIDTH) / 2)
    xs.push(n.x - half, n.x + half)
    ys.push(n.y - r, n.y + r + 16) // label sits below the circle
  }
  for (const e of edges.value) {
    const g = edgeGeometry(e)
    if (!g) continue
    const half = ((e.label?.length || 0) * LABEL_CHAR_WIDTH) / 2
    xs.push(g.mid.x - half, g.mid.x + half)
    ys.push(g.mid.y - 8, g.mid.y + 8)
  }
  if (!xs.length) return { x: 0, y: 0, w: 850, h: 400 }
  const x = Math.floor(Math.min(...xs) - PADDING)
  const y = Math.floor(Math.min(...ys) - PADDING)
  return { x, y, w: Math.ceil(Math.max(...xs) + PADDING) - x, h: Math.ceil(Math.max(...ys) + PADDING) - y }
})

const arrowColors = computed(() => [...new Set(edges.value.map(e => e.color))])
const arrowId = (color: string) => `${uid}-arrow-${arrowColors.value.indexOf(color)}`

function handleNodeEnter(node: Node) {
  hoveredNode.value = node
  // No scaling - nodes remain stationary
}

function handleNodeLeave(node: Node) {
  hoveredNode.value = null
}

function initFlow() {
  switch (props.flow) {
    case 'segment-structure':
      initSegmentStructure()
      break
    case 'tar-lifecycle':
      initTarLifecycle()
      break
    case 'gc-cycle':
      initGCCycle()
      break
    case 'compaction':
      initCompaction()
      break
    case 'checkpoint-pin':
      initCheckpointPin()
      break
    case 'recovery-decision':
      initRecoveryDecision()
      break
    case 'journal-rebuild':
      initJournalRebuild()
      break
    case 'pre-text-extraction':
      initPreTextExtraction()
      break
  }
}

function addNode(id: string, type: string, x: number, y: number, options: Partial<Node> = {}) {
  const nodeType = NODE_TYPES[type] || NODE_TYPES.SEGMENT
  nodes.value.push({
    id,
    type,
    x,
    y,
    label: options.label || type,
    icon: options.icon || nodeType.icon,
    color: options.color || nodeType.color,
    description: options.description,
    radius: options.radius || 28,
  })
}

function addEdge(from: string, to: string, type: string = 'DATA', options: Partial<Edge> = {}) {
  edges.value.push({
    from,
    to,
    type,
    color: options.color || EDGE_COLORS[type] || EDGE_COLORS.DATA,
    label: options.label,
    width: options.width || 2,
    curve: options.curve,
  })
}

// ============================================================================
// FLOW INITIALIZERS
// ============================================================================

function initSegmentStructure() {
  nodes.value = []
  edges.value = []
  
  // Segment internals on the left; the records that reference other segments sit on
  // the outer rows so their arrows to Segment B/C cross nothing
  addNode('segment', 'SEGMENT', 260, 200, { label: 'Segment', description: 'Up to 256KB immutable block', radius: 40 })
  addNode('uuid', 'NODE_RECORD', 80, 154, { label: 'UUID', description: 'Unique segment identifier' })
  addNode('nodes', 'NODE_RECORD', 80, 62, { label: 'Node Records', description: 'JCR node structure' })
  addNode('props', 'NODE_RECORD', 80, 338, { label: 'Value Records', description: 'Property values' })
  addNode('blobs', 'BLOB_REF', 80, 246, { label: 'Blob Refs', description: 'External binary references' })
  
  // References to other segments
  addNode('ref1', 'SEGMENT', 440, 110, { label: 'Segment B', description: 'Referenced segment' })
  addNode('ref2', 'SEGMENT', 440, 290, { label: 'Segment C', description: 'Referenced segment' })
  
  // TAR container
  addNode('tar', 'TAR_FILE', 620, 200, { label: 'data00001a.tar', description: 'TAR archive containing segments', radius: 35 })
  
  addEdge('segment', 'uuid', 'DATA', { label: 'contains' })
  addEdge('segment', 'nodes', 'DATA')
  addEdge('segment', 'props', 'DATA', { curve: -0.2 })
  addEdge('segment', 'blobs', 'DATA')
  addEdge('nodes', 'ref1', 'REFERENCE', { label: 'refs', curve: -0.2 })
  addEdge('props', 'ref2', 'REFERENCE', { label: 'refs' })
  addEdge('segment', 'tar', 'DATA', { label: 'stored in' })
  addEdge('ref1', 'tar', 'DATA')
  addEdge('ref2', 'tar', 'DATA')
}

function initTarLifecycle() {
  nodes.value = []
  edges.value = []
  
  // Initial state
  addNode('gen_a1', 'TAR_FILE', 80, 100, { label: 'data00000a.tar', description: 'Only old-generation data' })
  addNode('gen_a2', 'TAR_FILE', 80, 200, { label: 'data00001a.tar', description: 'Partly reclaimable' })
  addNode('gen_a3', 'TAR_FILE', 80, 300, { label: 'data00002a.tar', description: 'Mostly live: kept as is' })
  
  // Compaction
  addNode('compact', 'COMPACTION', 280, 200, { label: 'Compaction', description: 'Rewrite HEAD + checkpoints' })
  
  // New generation
  addNode('gen_b1', 'TAR_FILE', 480, 100, { label: 'data00003a.tar', description: 'New generation in a new file' })
  addNode('gen_b2', 'TAR_FILE', 680, 230, { label: 'data00001b.tar', description: 'Rewritten: >25% reclaimable' })
  
  // Cleanup
  addNode('cleanup', 'REAPER', 480, 300, { label: 'Cleanup', description: 'Per TAR: remove, rewrite or keep' })
  
  // Removed files
  addNode('bak', 'GARBAGE', 680, 360, { label: 'Removed', description: 'data00000a.tar: nothing left' })
  
  addEdge('gen_a1', 'compact', 'DATA', { label: 'read' })
  addEdge('gen_a2', 'compact', 'DATA')
  addEdge('gen_a3', 'compact', 'DATA')
  addEdge('compact', 'gen_b1', 'COPY', { label: 'write' })
  addEdge('compact', 'cleanup', 'CONTROL', { label: 'then' })
  addEdge('cleanup', 'gen_b2', 'COPY', { label: 'rewrite' })
  addEdge('cleanup', 'bak', 'DELETE', { label: 'remove' })
}

function initGCCycle() {
  nodes.value = []
  edges.value = []
  
  // Start
  addNode('journal', 'JOURNAL', 60, 220, { label: 'Journal Head', description: 'Current repository state' })
  
  // Estimation phase
  addNode('estimate', 'COMPACTION', 200, 110, { label: 'Estimation', description: 'Growth since last GC' })
  addNode('threshold', 'DECISION', 200, 330, { label: 'Threshold?', description: 'Grew ≥ sizeDeltaEstimation (1 GiB)?' })
  
  // Compaction phase
  addNode('traverse', 'ROOT', 370, 90, { label: 'Tree Traversal', description: 'HEAD + every checkpoint' })
  addNode('mark', 'LIVE', 370, 220, { label: 'Reachable Records', description: 'Only what HEAD/checkpoints use' })
  addNode('copy', 'COMPACTION', 370, 350, { label: 'Rewrite', description: 'Into new-generation segments' })
  
  // Cleanup phase
  addNode('new_gen', 'GENERATION', 540, 160, { label: 'New Generation', description: 'Compacted segments' })
  addNode('old_gen', 'GARBAGE', 540, 290, { label: 'Old Generations', description: 'Never copied; 2 generations retained' })
  
  // Final
  addNode('cleanup', 'REAPER', 690, 220, { label: 'Cleanup', description: 'Reclaim old generations' })
  addNode('done', 'SUCCESS', 820, 220, { label: 'Complete', description: 'Space reclaimed' })
  
  addEdge('journal', 'estimate', 'DATA', { label: 'analyze' })
  addEdge('journal', 'threshold', 'CONTROL')
  addEdge('threshold', 'traverse', 'CONTROL', { label: 'yes' })
  addEdge('estimate', 'traverse', 'DATA')
  addEdge('traverse', 'mark', 'DATA', { label: 'walk' })
  addEdge('mark', 'copy', 'CONTROL', { label: 'live' })
  addEdge('copy', 'new_gen', 'COPY', { label: 'write' })
  addEdge('copy', 'old_gen', 'DELETE', { label: 'skip' })
  addEdge('new_gen', 'cleanup', 'CONTROL')
  addEdge('old_gen', 'cleanup', 'DELETE')
  addEdge('cleanup', 'done', 'DATA')
}

function initCompaction() {
  nodes.value = []
  edges.value = []
  
  // Before compaction
  addNode('head', 'JOURNAL', 70, 200, { label: 'HEAD', description: 'Current revision' })
  addNode('cp1', 'CHECKPOINT', 70, 320, { label: 'Checkpoint', description: 'Async indexer reference' })
  
  // Segments
  addNode('seg_live1', 'LIVE', 220, 100, { label: 'Live Seg 1', description: 'Referenced by HEAD' })
  addNode('seg_live2', 'LIVE', 220, 200, { label: 'Live Seg 2', description: 'Referenced by HEAD' })
  addNode('seg_dead1', 'GARBAGE', 220, 300, { label: 'Dead Seg 1', description: 'Not referenced' })
  addNode('seg_dead2', 'GARBAGE', 220, 400, { label: 'Dead Seg 2', description: 'Not referenced' })
  
  // Compaction process
  addNode('compact', 'COMPACTION', 420, 200, { label: 'Compaction', description: 'Copy live, skip dead' })
  
  // Result
  addNode('new_seg1', 'SEGMENT', 620, 150, { label: 'New Seg 1', description: 'Compacted segment' })
  addNode('new_seg2', 'SEGMENT', 620, 250, { label: 'New Seg 2', description: 'Compacted segment' })
  addNode('new_head', 'JOURNAL', 780, 200, { label: 'New HEAD', description: 'Updated revision' })
  
  addEdge('head', 'seg_live1', 'REFERENCE')
  addEdge('head', 'seg_live2', 'REFERENCE')
  addEdge('cp1', 'seg_live2', 'REFERENCE', { label: 'pins' })
  addEdge('seg_live1', 'compact', 'DATA', { label: 'copy' })
  addEdge('seg_live2', 'compact', 'DATA', { label: 'copy' })
  addEdge('seg_dead1', 'compact', 'DELETE', { label: 'skip' })
  addEdge('seg_dead2', 'compact', 'DELETE', { label: 'skip' })
  addEdge('compact', 'new_seg1', 'COPY')
  addEdge('compact', 'new_seg2', 'COPY')
  addEdge('new_seg1', 'new_head', 'REFERENCE')
  addEdge('new_seg2', 'new_head', 'REFERENCE')
}

function initCheckpointPin() {
  nodes.value = []
  edges.value = []
  
  // Current state
  addNode('head', 'JOURNAL', 100, 100, { label: 'HEAD (R100)', description: 'Current revision' })
  addNode('async', 'CHECKPOINT', 100, 250, { label: '/:async@async', description: 'Indexer checkpoint reference' })
  
  // Checkpoints
  addNode('cp_active', 'CHECKPOINT', 300, 250, { label: 'CP Active', description: 'Referenced by indexer' })
  addNode('cp_orphan1', 'CHECKPOINT', 300, 350, { label: 'CP Orphan 1', description: 'No longer referenced' })
  addNode('cp_orphan2', 'CHECKPOINT', 300, 450, { label: 'CP Orphan 2', description: 'No longer referenced' })
  
  // Segments pinned
  addNode('seg_current', 'SEGMENT', 520, 100, { label: 'Current Segs', description: 'HEAD references' })
  addNode('seg_pinned', 'SEGMENT', 520, 250, { label: 'Pinned Segs', description: 'Active CP references' })
  addNode('seg_orphan', 'GARBAGE', 520, 400, { label: 'Orphan Segs', description: 'Orphan CPs reference' })
  
  // TAR files
  addNode('tar_current', 'TAR_FILE', 720, 100, { label: 'New Gen: HEAD', description: 'Compacted HEAD content' })
  addNode('tar_pinned', 'TAR_FILE', 720, 250, { label: 'New Gen: Active CP', description: 'Mostly shared with HEAD' })
  addNode('tar_blocked', 'TAR_FILE', 720, 400, { label: 'New Gen: Orphans', description: 'Copied forward on every GC' })
  
  addEdge('head', 'seg_current', 'REFERENCE')
  addEdge('async', 'cp_active', 'REFERENCE', { label: 'refs' })
  addEdge('cp_active', 'seg_pinned', 'REFERENCE', { label: 'pins' })
  addEdge('cp_orphan1', 'seg_orphan', 'REFERENCE', { label: 'pins' })
  addEdge('cp_orphan2', 'seg_orphan', 'REFERENCE', { label: 'pins' })
  addEdge('seg_current', 'tar_current', 'DATA')
  addEdge('seg_pinned', 'tar_pinned', 'DATA')
  addEdge('seg_orphan', 'tar_blocked', 'DATA', { label: 'copied' })
}

function initRecoveryDecision() {
  nodes.value = []
  edges.value = []
  
  // Start
  addNode('start', 'DECISION', 80, 200, { label: 'oak-run check', description: 'Run consistency check' })
  
  // Decision points
  addNode('check_result', 'DECISION', 250, 200, { label: 'Check Result?', description: 'What did check find?' })
  addNode('good_rev', 'SUCCESS', 420, 100, { label: 'Good Revision', description: 'Recoverable state found' })
  addNode('no_good', 'FAILURE', 420, 300, { label: 'No Good Rev', description: 'Severely corrupted' })
  addNode('check_fail', 'FAILURE', 420, 200, { label: 'Check Failed', description: 'Repository bricked' })
  
  // Recovery options
  addNode('rollback', 'BACKUP', 600, 50, { label: 'Rollback', description: 'recover-journal (fast)' })
  addNode('surgical', 'COMPACTION', 600, 142, { label: 'Surgical', description: 'count-nodes + remove-node(s)' })
  addNode('sidegrade', 'COMPACTION', 600, 326, { label: 'Sidegrade', description: 'oak-upgrade extract' })
  addNode('restore', 'BACKUP', 600, 234, { label: 'Restore Backup', description: 'Only option' })
  
  // Outcomes
  addNode('success', 'SUCCESS', 780, 142, { label: 'Recovered', description: 'Repository accessible' })
  addNode('partial', 'DECISION', 780, 326, { label: 'Partial Loss', description: 'Some data lost' })
  
  addEdge('start', 'check_result', 'DATA', { label: 'run' })
  addEdge('check_result', 'good_rev', 'DATA', { label: 'found' })
  addEdge('check_result', 'no_good', 'DATA', { label: 'none' })
  addEdge('check_result', 'check_fail', 'DELETE', { label: 'error' })
  addEdge('good_rev', 'rollback', 'CONTROL', { label: 'fast' })
  addEdge('good_rev', 'surgical', 'CONTROL', { label: 'preserve' })
  addEdge('no_good', 'sidegrade', 'CONTROL', { label: 'extract' })
  addEdge('check_fail', 'restore', 'DELETE', { label: 'only' })
  addEdge('rollback', 'success', 'COPY')
  addEdge('surgical', 'success', 'COPY')
  addEdge('sidegrade', 'partial', 'DATA')
  addEdge('restore', 'success', 'COPY')
}

function initJournalRebuild() {
  nodes.value = []
  edges.value = []
  
  // Corrupted state
  addNode('corrupt_journal', 'FAILURE', 80, 200, { label: 'Corrupt Journal', description: 'journal.log damaged' })
  
  // TAR files
  addNode('tar1', 'TAR_FILE', 250, 100, { label: 'data00000a.tar', description: 'Contains segments' })
  addNode('tar2', 'TAR_FILE', 250, 200, { label: 'data00001a.tar', description: 'Contains segments' })
  addNode('tar3', 'TAR_FILE', 250, 300, { label: 'data00002a.tar', description: 'Contains segments' })
  
  // Scan process
  addNode('scan', 'COMPACTION', 450, 200, { label: 'Scan TAR Files', description: 'Find valid root nodes' })
  
  // Found roots
  addNode('root1', 'ROOT', 620, 120, { label: 'Root R1', description: 'Valid revision found' })
  addNode('root2', 'ROOT', 620, 200, { label: 'Root R2', description: 'Valid revision found' })
  addNode('root3', 'ROOT', 620, 280, { label: 'Root R3', description: 'Most recent valid' })
  
  // New journal
  addNode('new_journal', 'JOURNAL', 780, 200, { label: 'New Journal', description: 'Rebuilt from R3' })
  
  addEdge('corrupt_journal', 'scan', 'DELETE', { label: 'ignore' })
  addEdge('tar1', 'scan', 'DATA', { label: 'read' })
  addEdge('tar2', 'scan', 'DATA')
  addEdge('tar3', 'scan', 'DATA')
  addEdge('scan', 'root1', 'DATA', { label: 'find' })
  addEdge('scan', 'root2', 'DATA')
  addEdge('scan', 'root3', 'DATA')
  addEdge('root3', 'new_journal', 'COPY', { label: 'write' })
}

function initPreTextExtraction() {
  nodes.value = []
  edges.value = []
  
  // Phase 1: Generate CSV
  addNode('repo', 'ROOT', 70, 230, { label: 'Repository', description: 'SegmentStore with binaries', radius: 32 })
  addNode('datastore', 'BINARY', 70, 90, { label: 'DataStore', description: 'FileDataStore or S3', radius: 32 })
  addNode('tika_gen', 'COMPACTION', 220, 160, { label: 'tika --generate', description: 'Scan repo for binaries' })
  addNode('csv', 'CSV', 370, 160, { label: 'binary-stats.csv', description: 'List of all binary refs' })
  
  // Phase 2: Extract text
  addNode('tika_extract', 'TIKA', 520, 90, { label: 'tika --extract', description: 'Apache Tika extraction' })
  addNode('text_store', 'TEXT_STORE', 670, 200, { label: 'Pre-extracted Store', description: './store directory' })
  
  // Alternative: Use existing index
  addNode('existing_idx', 'INDEX', 370, 330, { label: 'Index Dump', description: 'Text stored on the binary node' })
  addNode('tika_populate', 'COMPACTION', 520, 300, { label: 'tika --populate', description: 'Reuse indexed text' })
  
  // Phase 3: Configure OSGi
  addNode('osgi', 'OSGI', 800, 100, { label: 'Point Indexer', description: 'OSGi or --pre-extracted-text-dir' })
  addNode('reindex', 'INDEX', 800, 230, { label: 'Re-index', description: 'Store used during reindex' })
  addNode('success', 'SUCCESS', 800, 360, { label: 'Complete', description: 'Index rebuilt' })
  
  // Edges - Phase 1
  addEdge('repo', 'tika_gen', 'DATA', { label: 'scan' })
  addEdge('datastore', 'tika_gen', 'DATA')
  addEdge('tika_gen', 'csv', 'COPY', { label: 'write' })
  
  // Edges - Phase 2 (Tika path)
  addEdge('csv', 'tika_extract', 'DATA', { label: 'read' })
  addEdge('datastore', 'tika_extract', 'DATA', { label: 'binaries', curve: -0.1 })
  addEdge('tika_extract', 'text_store', 'COPY', { label: 'extract' })
  
  // Edges - Phase 2 (Index dump path)
  addEdge('existing_idx', 'tika_populate', 'DATA', { label: 'dump' })
  addEdge('csv', 'tika_populate', 'DATA')
  addEdge('tika_populate', 'text_store', 'COPY', { label: 'populate' })
  
  // Edges - Phase 3
  addEdge('text_store', 'osgi', 'CONTROL', { label: 'configure', curve: -0.2 })
  addEdge('osgi', 'reindex', 'CONTROL', { label: 'enable' })
  addEdge('reindex', 'success', 'DATA')
}

// Quadratic curve between the two nodes' glow rings; `mid` is the point on the curve at t = 0.5.
function curveBetween(fromNode: Node, toNode: Node, curvature = 0.2) {
  const dx = toNode.x - fromNode.x
  const dy = toNode.y - fromNode.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const offsetFrom = (fromNode.radius || DEFAULT_RADIUS) + 8
  const offsetTo = (toNode.radius || DEFAULT_RADIUS) + 8
  const start = { x: fromNode.x + (dx / dist) * offsetFrom, y: fromNode.y + (dy / dist) * offsetFrom }
  const end = { x: toNode.x - (dx / dist) * offsetTo, y: toNode.y - (dy / dist) * offsetTo }
  const ctrl = { x: (start.x + end.x) / 2 - dy * curvature, y: (start.y + end.y) / 2 + dx * curvature }
  const mid = { x: (start.x + end.x) / 4 + ctrl.x / 2, y: (start.y + end.y) / 4 + ctrl.y / 2 }
  return { start, end, ctrl, mid }
}

function edgeGeometry(edge: Edge) {
  const fromNode = nodes.value.find(n => n.id === edge.from)
  const toNode = nodes.value.find(n => n.id === edge.to)
  return fromNode && toNode ? curveBetween(fromNode, toNode, edge.curve) : null
}

function getEdgePath(edge: Edge): string {
  const g = edgeGeometry(edge)
  return g ? `M ${g.start.x} ${g.start.y} Q ${g.ctrl.x} ${g.ctrl.y} ${g.end.x} ${g.end.y}` : ''
}

function getEdgeLabelPosition(edge: Edge): { x: number; y: number } {
  return edgeGeometry(edge)?.mid ?? { x: 0, y: 0 }
}

function getEdgeStrokeDasharray(edge: Edge): string {
  if (edge.type === 'CONTROL') return '8 4'
  if (edge.type === 'DELETE') return '4 4'
  return 'none'
}

async function playAnimation() {
  if (isAnimating.value) return
  isAnimating.value = true
  
  // Animation sequences for each flow type
  const sequences: Record<string, { from: string; to: string; color: string }[][]> = {
    'segment-structure': [
      [{ from: 'segment', to: 'uuid', color: '#4ade80' }],
      [{ from: 'segment', to: 'nodes', color: '#4ade80' }, { from: 'segment', to: 'props', color: '#4ade80' }],
      [{ from: 'segment', to: 'blobs', color: '#4ade80' }],
      [{ from: 'nodes', to: 'ref1', color: '#3b82f6' }, { from: 'props', to: 'ref2', color: '#3b82f6' }],
      [{ from: 'segment', to: 'tar', color: '#4ade80' }],
    ],
    'gc-cycle': [
      [{ from: 'journal', to: 'estimate', color: '#4ade80' }],
      [{ from: 'journal', to: 'threshold', color: '#8b5cf6' }],
      [{ from: 'threshold', to: 'traverse', color: '#8b5cf6' }],
      [{ from: 'traverse', to: 'mark', color: '#4ade80' }],
      [{ from: 'mark', to: 'copy', color: '#8b5cf6' }],
      [{ from: 'copy', to: 'new_gen', color: '#22c55e' }, { from: 'copy', to: 'old_gen', color: '#ef4444' }],
      [{ from: 'new_gen', to: 'cleanup', color: '#8b5cf6' }, { from: 'old_gen', to: 'cleanup', color: '#ef4444' }],
      [{ from: 'cleanup', to: 'done', color: '#4ade80' }],
    ],
    'recovery-decision': [
      [{ from: 'start', to: 'check_result', color: '#4ade80' }],
      [{ from: 'check_result', to: 'good_rev', color: '#22c55e' }],
      [{ from: 'good_rev', to: 'rollback', color: '#8b5cf6' }],
      [{ from: 'rollback', to: 'success', color: '#22c55e' }],
    ],
    'checkpoint-pin': [
      [{ from: 'head', to: 'seg_current', color: '#3b82f6' }],
      [{ from: 'async', to: 'cp_active', color: '#ec4899' }],
      [{ from: 'cp_active', to: 'seg_pinned', color: '#ec4899' }],
      [{ from: 'cp_orphan1', to: 'seg_orphan', color: '#ef4444' }, { from: 'cp_orphan2', to: 'seg_orphan', color: '#ef4444' }],
      [{ from: 'seg_current', to: 'tar_current', color: '#4ade80' }],
      [{ from: 'seg_pinned', to: 'tar_pinned', color: '#4ade80' }],
      [{ from: 'seg_orphan', to: 'tar_blocked', color: '#ef4444' }],
    ],
    'tar-lifecycle': [
      [{ from: 'gen_a1', to: 'compact', color: '#4ade80' }, { from: 'gen_a2', to: 'compact', color: '#4ade80' }, { from: 'gen_a3', to: 'compact', color: '#4ade80' }],
      [{ from: 'compact', to: 'gen_b1', color: '#22c55e' }],
      [{ from: 'compact', to: 'cleanup', color: '#8b5cf6' }],
      [{ from: 'cleanup', to: 'gen_b2', color: '#22c55e' }, { from: 'cleanup', to: 'bak', color: '#ef4444' }],
    ],
    'compaction': [
      [{ from: 'head', to: 'seg_live1', color: '#3b82f6' }, { from: 'head', to: 'seg_live2', color: '#3b82f6' }],
      [{ from: 'cp1', to: 'seg_live2', color: '#ec4899' }],
      [{ from: 'seg_live1', to: 'compact', color: '#4ade80' }, { from: 'seg_live2', to: 'compact', color: '#4ade80' }],
      [{ from: 'seg_dead1', to: 'compact', color: '#ef4444' }, { from: 'seg_dead2', to: 'compact', color: '#ef4444' }],
      [{ from: 'compact', to: 'new_seg1', color: '#22c55e' }, { from: 'compact', to: 'new_seg2', color: '#22c55e' }],
      [{ from: 'new_seg1', to: 'new_head', color: '#3b82f6' }, { from: 'new_seg2', to: 'new_head', color: '#3b82f6' }],
    ],
    'journal-rebuild': [
      [{ from: 'tar1', to: 'scan', color: '#4ade80' }, { from: 'tar2', to: 'scan', color: '#4ade80' }, { from: 'tar3', to: 'scan', color: '#4ade80' }],
      [{ from: 'scan', to: 'root1', color: '#4ade80' }, { from: 'scan', to: 'root2', color: '#4ade80' }, { from: 'scan', to: 'root3', color: '#4ade80' }],
      [{ from: 'root3', to: 'new_journal', color: '#22c55e' }],
    ],
    'pre-text-extraction': [
      // Phase 1: Generate CSV
      [{ from: 'repo', to: 'tika_gen', color: '#4ade80' }, { from: 'datastore', to: 'tika_gen', color: '#f97316' }],
      [{ from: 'tika_gen', to: 'csv', color: '#06b6d4' }],
      // Phase 2: Extract (show both paths)
      [{ from: 'csv', to: 'tika_extract', color: '#06b6d4' }],
      [{ from: 'datastore', to: 'tika_extract', color: '#f97316' }],
      [{ from: 'tika_extract', to: 'text_store', color: '#22c55e' }],
      // Alternative path
      [{ from: 'existing_idx', to: 'tika_populate', color: '#ec4899' }],
      [{ from: 'tika_populate', to: 'text_store', color: '#22c55e' }],
      // Phase 3: Configure
      [{ from: 'text_store', to: 'osgi', color: '#8b5cf6' }],
      [{ from: 'osgi', to: 'reindex', color: '#8b5cf6' }],
      [{ from: 'reindex', to: 'success', color: '#22c55e' }],
    ],
  }
  
  const seq = sequences[props.flow] || []
  
  for (const step of seq) {
    await Promise.all(step.map(s => animatePacket(s.from, s.to, s.color)))
    await new Promise(r => setTimeout(r, 200))
  }
  
  isAnimating.value = false
}

async function animatePacket(fromId: string, toId: string, color: string): Promise<void> {
  const edge = edges.value.find(e => e.from === fromId && e.to === toId)
  const g = edge && edgeGeometry(edge)
  if (!g) return
  
  const packetId = `${fromId}-${toId}-${Date.now()}`
  const duration = 600
  const startTime = performance.now()
  const { start, ctrl, end } = g
  
  return new Promise(resolve => {
    function animate() {
      const elapsed = performance.now() - startTime
      const t = Math.min(elapsed / duration, 1)
      
      const x = (1-t)*(1-t)*start.x + 2*(1-t)*t*ctrl.x + t*t*end.x
      const y = (1-t)*(1-t)*start.y + 2*(1-t)*t*ctrl.y + t*t*end.y
      
      const existing = animationPackets.value.find(p => p.id === packetId)
      if (existing) {
        existing.x = x
        existing.y = y
      } else {
        animationPackets.value.push({ id: packetId, x, y, color })
      }
      
      if (t < 1) {
        requestAnimationFrame(animate)
      } else {
        animationPackets.value = animationPackets.value.filter(p => p.id !== packetId)
        resolve()
      }
    }
    requestAnimationFrame(animate)
  })
}

// Build the graph during setup so it is part of the pre-rendered HTML.
initFlow()
</script>

<template>
  <div class="oak-flow-container">
    <div class="flow-controls">
      <button class="flow-btn play-btn" @click="playAnimation" :disabled="isAnimating">
        <span>{{ isAnimating ? '⏳' : '▶' }}</span>
        <span>{{ isAnimating ? 'Playing...' : 'Play Animation' }}</span>
      </button>
    </div>
    
    <div class="flow-wrapper">
      <svg 
        :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`"
        :style="{ minWidth: `${Math.round(viewBox.w * MIN_SCALE)}px` }"
        class="flow-svg"
      >
        <defs>
          <!-- One arrowhead per edge colour, so each arrow matches its line -->
          <marker
            v-for="color in arrowColors"
            :key="color"
            :id="arrowId(color)"
            markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" :fill="color" />
          </marker>
          <filter :id="`${uid}-glow`">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        <!-- Edges -->
        <g class="edges">
          <path
            v-for="edge in edges"
            :key="`${edge.from}-${edge.to}`"
            :d="getEdgePath(edge)"
            fill="none"
            :stroke="edge.color"
            :stroke-width="edge.width || 2"
            :stroke-dasharray="getEdgeStrokeDasharray(edge)"
            :marker-end="`url(#${arrowId(edge.color)})`"
            class="edge-path"
          />
        </g>
        
        <!-- Nodes -->
        <g class="nodes">
          <g 
            v-for="node in nodes" 
            :key="node.id"
            :transform="`translate(${node.x}, ${node.y})`"
            class="node-wrapper"
          >
            <g
              class="node"
              :class="{ hovered: hoveredNode?.id === node.id }"
              @mouseenter="handleNodeEnter(node)"
              @mouseleave="handleNodeLeave(node)"
              @click="emit('nodeClick', node)"
            >
            <circle
              :r="(node.radius || 28) + 8"
              fill="none"
              :stroke="node.color"
              stroke-width="1"
              class="node-glow"
            />
            <circle
              :r="node.radius || 28"
              fill="#0a1628"
              :stroke="node.color"
              stroke-width="2"
              :filter="hoveredNode?.id === node.id ? `url(#${uid}-glow)` : undefined"
              class="node-circle"
            />
            <text
              text-anchor="middle"
              dominant-baseline="central"
              font-size="18"
              class="node-icon"
            >
              {{ node.icon }}
            </text>
            <text
              text-anchor="middle"
              :y="(node.radius || 28) + 18"
              class="node-label"
            >
              {{ node.label }}
            </text>
            </g>
          </g>
        </g>

        <!-- Edge labels sit on their curve, above nodes and edges -->
        <g class="edge-labels">
          <template v-for="edge in edges" :key="`${edge.from}-${edge.to}`">
            <text
              v-if="edge.label"
              :x="getEdgeLabelPosition(edge).x"
              :y="getEdgeLabelPosition(edge).y"
              text-anchor="middle"
              dominant-baseline="central"
              class="edge-label"
            >
              {{ edge.label }}
            </text>
          </template>
        </g>
        
        <!-- Animation packets -->
        <g class="packets">
          <circle
            v-for="packet in animationPackets"
            :key="packet.id"
            :cx="packet.x"
            :cy="packet.y"
            r="6"
            :fill="packet.color"
            :filter="`url(#${uid}-glow)`"
            class="packet"
          />
        </g>
      </svg>
      
      <!-- Info panel -->
      <div v-if="hoveredNode && interactive !== false" class="info-panel">
        <div class="info-header">
          <span class="info-icon">{{ hoveredNode.icon }}</span>
          <span class="info-title">{{ hoveredNode.label }}</span>
        </div>
        <p v-if="hoveredNode.description" class="info-desc">{{ hoveredNode.description }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.oak-flow-container {
  margin: 1.5rem 0;
}

.flow-controls {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.flow-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: #0a1628;
  border: 1px solid rgba(74, 222, 128, 0.3);
  border-radius: 8px;
  color: #e6edf3;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.flow-btn:hover:not(:disabled) {
  background: #0f2847;
  border-color: #4ade80;
  transform: translateY(-2px);
}

.flow-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.flow-btn.play-btn {
  background: linear-gradient(135deg, #4ade80, #22c55e);
  border: none;
  color: #030712;
  font-weight: 600;
}

.flow-btn.play-btn:hover:not(:disabled) {
  box-shadow: 0 4px 20px rgba(74, 222, 128, 0.4);
}

.flow-wrapper {
  position: relative;
  background: #030712;
  border: 1px solid rgba(74, 222, 128, 0.2);
  border-radius: 12px;
  overflow-x: auto; /* scroll rather than shrink below MIN_SCALE */
}

.flow-svg {
  display: block;
  width: 100%;
  height: auto;
  background-image: 
    linear-gradient(rgba(74, 222, 128, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(74, 222, 128, 0.03) 1px, transparent 1px);
  background-size: 20px 20px;
}

.edge-path {
  transition: stroke-width 0.2s ease;
}

.edge-label {
  fill: rgba(255, 255, 255, 0.75);
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 500;
  /* dark halo keeps the label readable where it crosses a line */
  paint-order: stroke;
  stroke: #030712;
  stroke-width: 4px;
  stroke-linejoin: round;
  pointer-events: none;
}

.node-wrapper {
  transform-origin: center;
}

.node {
  cursor: pointer;
}

.node-glow {
  opacity: 0.2;
  transition: opacity 0.3s ease;
}

.node.hovered .node-glow {
  opacity: 0.5;
}

.node-circle {
  transition: filter 0.2s ease;
}

.node-icon {
  pointer-events: none;
}

.node-label {
  fill: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  font-weight: 500;
  /* same halo as edge labels: an arrow entering from below passes under the text */
  paint-order: stroke;
  stroke: #030712;
  stroke-width: 4px;
  stroke-linejoin: round;
  pointer-events: none;
}

.packet {
  pointer-events: none;
}

.info-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 200px;
  background: #0f2847;
  border: 1px solid rgba(74, 222, 128, 0.3);
  border-radius: 10px;
  padding: 14px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 10;
}

.info-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(74, 222, 128, 0.2);
}

.info-icon {
  font-size: 22px;
}

.info-title {
  font-weight: 600;
  font-size: 13px;
  color: #4ade80;
}

.info-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  margin: 0;
  line-height: 1.5;
}

@media (max-width: 768px) {
  .info-panel {
    position: static;
    width: 100%;
    margin-top: 16px;
  }
}
</style>
