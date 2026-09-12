export type NodeID = {
  clock: number; // Lamport timestamp
  site: string; // unique client ID (UUID)
};

export type RGANode = {
  id: NodeID;
  char: string; // the character at this position. Empty string '' for the sentinel head node
  deleted: boolean; // tombstoned — logically deleted but kept for position tracking
  prev: NodeID | null; // ID of the node this was inserted after
};

export type RGADocument = {
  nodes: RGANode[]; // ordered list of all nodes including tombstones, sentinel first
  clock: number; // this site's current Lamport clock
  site: string; // this site's unique ID
};

export type InsertOp = {
  type: "insert";
  node: RGANode;
};

export type DeleteOp = {
  type: "delete";
  targetId: NodeID;
};

export type RGAOp = InsertOp | DeleteOp;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * True when ID `a` wins a tie-break against `b`.
 * Higher clock wins; equal clock → higher site string (lexicographic) wins.
 */
function idGreaterThan(a: NodeID, b: NodeID): boolean {
  if (a.clock !== b.clock) return a.clock > b.clock;
  return a.site > b.site;
}

/**
 * Resolve a visible (non-tombstone, non-sentinel) index to the RGANode at
 * that position.
 *
 * index === -1  →  the sentinel head node (insert before all visible chars)
 * index >= 0    →  the n-th live, non-sentinel character
 *
 * Throws if `index` is out of bounds.
 */
function getNodeAtVisibleIndex(nodes: RGANode[], index: number): RGANode {
  // -1 means "insert after sentinel" — sentinel is always nodes[0]
  if (index === -1) {
    return nodes[0];
  }

  let count = -1;
  for (const node of nodes) {
    if (node.char === "") continue; // skip sentinel
    if (node.deleted) continue;    // skip tombstones
    count++;
    if (count === index) return node;
  }

  throw new Error(
    `Visible index ${index} out of bounds (visible length: ${count + 1})`
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new empty RGA document for the given site.
 * One sentinel node: { id: { clock: 0, site: '' }, char: '', deleted: false, prev: null }
 * Clock starts at 1.
 */
export function createDocument(site: string): RGADocument {
  const sentinel: RGANode = {
    id: { clock: 0, site: "" },
    char: "",
    deleted: false,
    prev: null,
  };

  return {
    nodes: [sentinel],
    clock: 1,
    site,
  };
}

/**
 * Return the visible (non-deleted, non-sentinel) text of the document.
 */
export function getVisibleText(doc: RGADocument): string {
  return doc.nodes
    .filter((n) => n.char !== "" && !n.deleted)
    .map((n) => n.char)
    .join("");
}

/**
 * Return the number of visible (non-deleted, non-sentinel) characters.
 */
export function getVisibleLength(doc: RGADocument): number {
  return doc.nodes.filter((n) => n.char !== "" && !n.deleted).length;
}

/**
 * Insert `char` at visible position `index` on this site.
 *
 * The predecessor is the node at visible index `index - 1`.
 * The new node is placed immediately after the predecessor in the node array
 * (local insert never needs tie-breaking — no concurrent ops exist locally).
 *
 * Returns [updatedDoc, InsertOp].
 */
export function localInsert(
  doc: RGADocument,
  index: number,
  char: string
): [RGADocument, InsertOp] {
  // Predecessor: visible index (index - 1).  For index === 0 that's -1 → sentinel.
  const prevNode = getNodeAtVisibleIndex(doc.nodes, index - 1);

  const prevIndex = doc.nodes.findIndex(
    (n) => n.id.clock === prevNode.id.clock && n.id.site === prevNode.id.site
  );

  const newNode: RGANode = {
    id: { clock: doc.clock, site: doc.site },
    char,
    deleted: false,
    prev: prevNode.id,
  };

  const newNodes = [
    ...doc.nodes.slice(0, prevIndex + 1),
    newNode,
    ...doc.nodes.slice(prevIndex + 1),
  ];

  const updatedDoc: RGADocument = {
    ...doc,
    nodes: newNodes,
    clock: doc.clock + 1,
  };

  const op: InsertOp = { type: "insert", node: newNode };

  return [updatedDoc, op];
}

/**
 * Delete the character at visible position `index` on this site.
 *
 * Marks the node as deleted (tombstone); the node is never physically removed.
 * Returns [updatedDoc, DeleteOp].
 */
export function localDelete(
  doc: RGADocument,
  index: number
): [RGADocument, DeleteOp] {
  const targetNode = getNodeAtVisibleIndex(doc.nodes, index);

  const newNodes = doc.nodes.map((n) =>
    n.id.clock === targetNode.id.clock && n.id.site === targetNode.id.site
      ? { ...n, deleted: true }
      : n
  );

  const updatedDoc: RGADocument = { ...doc, nodes: newNodes };
  const op: DeleteOp = { type: "delete", targetId: targetNode.id };

  return [updatedDoc, op];
}

/**
 * Apply a remote (or replayed) op to `doc`.
 *
 * Insert:
 *   1. Idempotency — skip if a node with the same (clock, site) already exists.
 *   2. Find predecessor.
 *   3. Scan forward past all nodes that beat the incoming node, regardless of
 *      their own `prev` pointer (concurrent runs are contiguous and must all
 *      be compared).
 *   4. Insert.
 *
 * Delete:
 *   Mark the target node as deleted (idempotent by nature).
 */
export function applyOp(doc: RGADocument, op: RGAOp): RGADocument {
  if (!op || !op.type) return doc;

  if (op.type === "insert") {
    if (!op.node || !op.node.id) return doc;

    // 1. Idempotency — check both clock AND site
    const exists = doc.nodes.some(
      (n) =>
        n.id.clock === op.node.id.clock && n.id.site === op.node.id.site
    );
    if (exists) return doc;

    // 2. Find predecessor index
    const predClock = op.node.prev?.clock ?? 0;
    const predSite = op.node.prev?.site ?? "";
    const predIndex = doc.nodes.findIndex(
      (n) => n.id.clock === predClock && n.id.site === predSite
    );
    if (predIndex === -1) {
      throw new Error(
        `Predecessor not found for op: ${JSON.stringify(op.node.id)}, prev: ${JSON.stringify(op.node.prev)}`
      );
    }

    // 3. Scan forward past all nodes that beat the incoming node.
    //
    //    Invariant: concurrent inserts at the same position form a contiguous
    //    run.  We must skip every node whose predecessor is at or after
    //    `predIndex` in the array AND whose ID beats the incoming node's ID.
    //
    //    We stop when:
    //      (a) The candidate's predecessor is positioned *before* predIndex —
    //          it belongs to a different (earlier) subtree, so we cannot
    //          leapfrog it, or
    //      (b) The candidate's ID does not beat the incoming node's ID —
    //          incoming node wins the tie-break, so insert here.
    let insertAt = predIndex + 1;
    while (insertAt < doc.nodes.length) {
      const candidate = doc.nodes[insertAt];

      const candidatePredClock = candidate.prev?.clock ?? 0;
      const candidatePredSite = candidate.prev?.site ?? "";
      const candidatePredIdx = doc.nodes.findIndex(
        (n) => n.id.clock === candidatePredClock && n.id.site === candidatePredSite
      );

      // Candidate belongs to an earlier subtree — stop
      if (candidatePredIdx < predIndex) break;

      // Candidate beats incoming — skip it
      if (idGreaterThan(candidate.id, op.node.id)) {
        insertAt++;
      } else {
        break;
      }
    }

    // 4. Insert
    const newNodes = [
      ...doc.nodes.slice(0, insertAt),
      op.node,
      ...doc.nodes.slice(insertAt),
    ];
    return {
      ...doc,
      nodes: newNodes,
      clock: Math.max(doc.clock, op.node.id.clock) + 1,
    };
  }

  if (op.type === "delete") {
    if (!op.targetId) return doc;
    const newNodes = doc.nodes.map((n) =>
      n.id.clock === op.targetId.clock && n.id.site === op.targetId.site
        ? { ...n, deleted: true }
        : n
    );
    return { ...doc, nodes: newNodes };
  }

  return doc;
}

export function serializeOp(op: RGAOp): string {
  return JSON.stringify(op);
}

export function deserializeOp(raw: string): RGAOp {
  return JSON.parse(raw) as RGAOp;
}
