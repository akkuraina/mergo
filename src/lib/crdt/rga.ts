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

function isSameId(a: NodeID | null, b: NodeID | null): boolean {
  if (a === null || b === null) return a === b;
  return a.clock === b.clock && a.site === b.site;
}

function isGreater(a: NodeID, b: NodeID): boolean {
  if (a.clock !== b.clock) {
    return a.clock > b.clock;
  }
  return a.site > b.site;
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
  let prevNode: RGANode = doc.nodes[0]; // sentinel for index 0

  if (index > 0) {
    let visibleCount = 0;
    let found = false;
    for (let i = 1; i < doc.nodes.length; i++) {
      const node = doc.nodes[i];
      if (!node.deleted) {
        if (visibleCount === index - 1) {
          prevNode = node;
          found = true;
          break;
        }
        visibleCount++;
      }
    }
    if (!found) {
      prevNode = doc.nodes[doc.nodes.length - 1];
    }
  }

  const prevIndex = doc.nodes.findIndex((n) => isSameId(n.id, prevNode.id));

  const newNode: RGANode = {
    id: { clock: doc.clock, site: doc.site },
    char,
    deleted: false,
    prev: prevNode.id,
  };

  const newNodes = [...doc.nodes];
  newNodes.splice(prevIndex + 1, 0, newNode);

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
  let targetIndex = -1;
  let visibleCount = 0;

  for (let i = 1; i < doc.nodes.length; i++) {
    const node = doc.nodes[i];
    if (!node.deleted) {
      if (visibleCount === index) {
        targetIndex = i;
        break;
      }
      visibleCount++;
    }
  }

  if (targetIndex === -1) {
    throw new Error(`Visible index ${index} out of bounds`);
  }

  const targetNode = doc.nodes[targetIndex];
  const newNodes = doc.nodes.map((n, i) =>
    i === targetIndex ? { ...n, deleted: true } : n
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
  if (op.type === "insert") {
    const exists = doc.nodes.some((n) => isSameId(n.id, op.node.id));
    if (exists) {
      return doc;
    }

    let prevIndex = -1;
    if (op.node.prev === null) {
      prevIndex = 0;
    } else {
      prevIndex = doc.nodes.findIndex((n) => isSameId(n.id, op.node.prev));
    }

    if (prevIndex === -1) {
      prevIndex = 0;
    }

    let insertIndex = prevIndex + 1;
    while (
      insertIndex < doc.nodes.length &&
      isGreater(doc.nodes[insertIndex].id, op.node.id)
    ) {
      insertIndex++;
    }

    const newNodes = [...doc.nodes];
    newNodes.splice(insertIndex, 0, op.node);

    return {
      ...doc,
      nodes: newNodes,
      clock: Math.max(doc.clock, op.node.id.clock) + 1,
    };
  }

  if (op.type === "delete") {
    const newNodes = doc.nodes.map((n) =>
      isSameId(n.id, op.targetId) ? { ...n, deleted: true } : n
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
    .slice(1)
    .filter((n) => !n.deleted)
    .map((n) => n.char)
    .join("");
}

export function getVisibleLength(doc: RGADocument): number {
  return doc.nodes.slice(1).filter((n) => !n.deleted).length;
}

export function serializeOp(op: RGAOp): string {
  return JSON.stringify(op);
}

export function deserializeOp(raw: string): RGAOp {
  return JSON.parse(raw) as RGAOp;
}
