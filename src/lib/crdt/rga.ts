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

function idGreaterThan(a: NodeID, b: NodeID): boolean {
  if (a.clock !== b.clock) return a.clock > b.clock;
  return a.site > b.site;
}

function getNodeAtVisibleIndex(nodes: RGANode[], index: number): RGANode {
  // index -1 means "insert after sentinel"
  if (index === -1) {
    return nodes[0]; // sentinel is always first
  }
  let count = -1;
  for (const node of nodes) {
    if (node.char === "") continue; // skip sentinel
    if (!node.deleted) {
      count++;
      if (count === index) return node;
    }
  }
  throw new Error(
    `Visible index ${index} out of bounds (visible length: ${count + 1})`
  );
}

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

export function localInsert(
  doc: RGADocument,
  index: number,
  char: string
): [RGADocument, InsertOp] {
  let prevNode: RGANode;
  try {
    prevNode = getNodeAtVisibleIndex(doc.nodes, index - 1);
  } catch {
    prevNode = doc.nodes[doc.nodes.length - 1] ?? doc.nodes[0];
  }

  const prevIndex = doc.nodes.findIndex(
    (n) => n.id.clock === prevNode.id.clock && n.id.site === prevNode.id.site
  );

  const resolvedPrevIndex = prevIndex === -1 ? 0 : prevIndex;
  const actualPrevNode = doc.nodes[resolvedPrevIndex];

  const newNode: RGANode = {
    id: { clock: doc.clock, site: doc.site },
    char,
    deleted: false,
    prev: actualPrevNode.id,
  };

  const newNodes = [...doc.nodes];
  newNodes.splice(resolvedPrevIndex + 1, 0, newNode);

  const updatedDoc: RGADocument = {
    ...doc,
    nodes: newNodes,
    clock: doc.clock + 1,
  };

  const op: InsertOp = {
    type: "insert",
    node: newNode,
  };

  return [updatedDoc, op];
}

export function localDelete(
  doc: RGADocument,
  index: number
): [RGADocument, DeleteOp] {
  let targetNode: RGANode | null = null;
  try {
    targetNode = getNodeAtVisibleIndex(doc.nodes, index);
  } catch {
    targetNode = null;
  }

  if (!targetNode) {
    return [
      doc,
      { type: "delete", targetId: { clock: -1, site: "" } },
    ];
  }

  const newNodes = doc.nodes.map((n) =>
    n.id.clock === targetNode?.id.clock && n.id.site === targetNode?.id.site
      ? { ...n, deleted: true }
      : n
  );

  const updatedDoc: RGADocument = {
    ...doc,
    nodes: newNodes,
  };

  const op: DeleteOp = {
    type: "delete",
    targetId: targetNode.id,
  };

  return [updatedDoc, op];
}

export function applyOp(doc: RGADocument, op: RGAOp): RGADocument {
  if (!op || !op.type) return doc;

  if (op.type === "insert") {
    if (!op.node || !op.node.id) return doc;

    // 1. idempotency check
    if (
      doc.nodes.some(
        (n) =>
          n.id.clock === op.node.id.clock && n.id.site === op.node.id.site
      )
    ) {
      return doc;
    }

    // 2. find predecessor index
    const predIndex = doc.nodes.findIndex(
      (n) =>
        n.id.clock === (op.node.prev?.clock ?? 0) &&
        n.id.site === (op.node.prev?.site ?? "")
    );
    if (predIndex === -1) {
      throw new Error(
        `Predecessor not found for op: ${JSON.stringify(op.node.id)}`
      );
    }

    // 3. scan forward past all nodes that beat the incoming node
    // Do NOT stop just because a node has a different prev —
    // concurrent inserts at the same position form a contiguous run
    // and ALL of them must be compared against the incoming node
    let insertAt = predIndex + 1;
    while (insertAt < doc.nodes.length) {
      const candidate = doc.nodes[insertAt];

      // Stop if this node was inserted AFTER the predecessor's subtree
      // i.e. its prev is "before" our predecessor in the document
      const candidatePredIndex = doc.nodes.findIndex(
        (n) =>
          n.id.clock === (candidate.prev?.clock ?? 0) &&
          n.id.site === (candidate.prev?.site ?? "")
      );
      if (candidatePredIndex < predIndex) break;

      // Within the concurrent run, skip nodes that beat the incoming node
      if (idGreaterThan(candidate.id, op.node.id)) {
        insertAt++;
      } else {
        break;
      }
    }

    // 4. insert
    const newNodes = [...doc.nodes];
    newNodes.splice(insertAt, 0, op.node);
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

    return {
      ...doc,
      nodes: newNodes,
    };
  }

  return doc;
}

export function getVisibleText(doc: RGADocument): string {
  return doc.nodes
    .filter((n) => n.char !== "" && !n.deleted)
    .map((n) => n.char)
    .join("");
}

export function getVisibleLength(doc: RGADocument): number {
  return doc.nodes.filter((n) => n.char !== "" && !n.deleted).length;
}

export function serializeOp(op: RGAOp): string {
  return JSON.stringify(op);
}

export function deserializeOp(raw: string): RGAOp {
  return JSON.parse(raw) as RGAOp;
}
