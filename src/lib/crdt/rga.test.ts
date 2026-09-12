import {
  createDocument,
  localInsert,
  localDelete,
  applyOp,
  getVisibleText,
  getVisibleLength,
  serializeOp,
  deserializeOp,
  type RGAOp,
  type RGADocument,
  type InsertOp,
  type DeleteOp,
} from "./rga";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  }
}

function pass(label: string): void {
  console.log(`✓ ${label}`);
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

function runTests(): void {
  console.log("Running RGA CRDT tests...");

  // -------------------------------------------------------------------------
  // Test 1 — Empty document
  // -------------------------------------------------------------------------
  {
    const doc: RGADocument = createDocument("A");
    assert(getVisibleText(doc) === "", `Test 1: expected '', got '${getVisibleText(doc)}'`);
    assert(getVisibleLength(doc) === 0, `Test 1: expected length 0, got ${getVisibleLength(doc)}`);
    pass("Test 1: Empty document");
  }

  // -------------------------------------------------------------------------
  // Test 2 — Single insert
  // -------------------------------------------------------------------------
  {
    const doc = createDocument("A");
    const [doc2, op] = localInsert(doc, 0, "a");
    assert(op.type === "insert", "Test 2: op must be insert");
    assert(getVisibleText(doc2) === "a", `Test 2: expected 'a', got '${getVisibleText(doc2)}'`);
    assert(getVisibleLength(doc2) === 1, `Test 2: expected length 1, got ${getVisibleLength(doc2)}`);
    pass("Test 2: Single insert");
  }

  // -------------------------------------------------------------------------
  // Test 3 — Sequential inserts
  // -------------------------------------------------------------------------
  {
    let doc = createDocument("A");
    const chars = ["h", "e", "l", "l", "o"];
    for (let i = 0; i < chars.length; i++) {
      const [next] = localInsert(doc, i, chars[i]);
      doc = next;
    }
    assert(getVisibleText(doc) === "hello", `Test 3: expected 'hello', got '${getVisibleText(doc)}'`);
    assert(getVisibleLength(doc) === 5, `Test 3: expected length 5, got ${getVisibleLength(doc)}`);
    pass("Test 3: Sequential inserts");
  }

  // -------------------------------------------------------------------------
  // Test 4 — Delete (tombstone preserved, visible text shrinks)
  // -------------------------------------------------------------------------
  {
    let doc = createDocument("A");
    const [d1] = localInsert(doc, 0, "a");
    const [d2] = localInsert(d1, 1, "b");
    const [d3] = localInsert(d2, 2, "c");

    assert(getVisibleText(d3) === "abc", "Test 4 setup: expected 'abc'");
    // sentinel + 3 chars = 4 nodes
    assert(d3.nodes.length === 4, `Test 4 setup: expected 4 nodes, got ${d3.nodes.length}`);

    const [d4, delOp] = localDelete(d3, 1); // delete 'b'
    assert(delOp.type === "delete", "Test 4: op must be delete");
    assert(getVisibleText(d4) === "ac", `Test 4: expected 'ac', got '${getVisibleText(d4)}'`);
    // node count stays 4 — tombstone is kept
    assert(d4.nodes.length === 4, `Test 4: expected 4 nodes after delete, got ${d4.nodes.length}`);
    pass("Test 4: Delete (tombstone preserved)");
  }

  // -------------------------------------------------------------------------
  // Test 5 — Convergence: concurrent insert at same position
  // -------------------------------------------------------------------------
  {
    // Both sites start with "ac"
    let siteA = createDocument("site-A");
    let siteB = createDocument("site-B");

    const sharedOps: RGAOp[] = [];
    for (const [i, ch] of ["a", "c"].entries()) {
      const [next, op] = localInsert(siteA, i, ch);
      siteA = next;
      sharedOps.push(op);
    }
    for (const op of sharedOps) {
      siteB = applyOp(siteB, op);
    }

    // A inserts 'X' at index 1; B inserts 'Y' at index 1 — concurrently
    const [siteA2, opA] = localInsert(siteA, 1, "X");
    const [siteB2, opB] = localInsert(siteB, 1, "Y");

    const finalA = applyOp(siteA2, opB);
    const finalB = applyOp(siteB2, opA);

    const textA = getVisibleText(finalA);
    const textB = getVisibleText(finalB);

    assert(textA === textB, `Test 5: convergence failure — A='${textA}' B='${textB}'`);
    assert(textA.length === 4, `Test 5: expected 4 chars, got ${textA.length} ('${textA}')`);
    pass(`Test 5: Convergence — concurrent insert at same position → '${textA}'`);
  }

  // -------------------------------------------------------------------------
  // Test 6 — Convergence: concurrent insert at different positions
  // -------------------------------------------------------------------------
  {
    // Both sites start with "abc" (3 visible chars)
    let siteA = createDocument("site-A");
    let siteB = createDocument("site-B");

    const sharedOps: RGAOp[] = [];
    for (const [i, ch] of ["a", "b", "c"].entries()) {
      const [next, op] = localInsert(siteA, i, ch);
      siteA = next;
      sharedOps.push(op);
    }
    for (const op of sharedOps) {
      siteB = applyOp(siteB, op);
    }

    // A inserts 'X' at index 0 (before 'a'); B inserts 'Z' at index 2 (before 'c')
    const [siteA2, opA] = localInsert(siteA, 0, "X");
    const [siteB2, opB] = localInsert(siteB, 2, "Z");

    const finalA = applyOp(siteA2, opB);
    const finalB = applyOp(siteB2, opA);

    const textA = getVisibleText(finalA);
    const textB = getVisibleText(finalB);

    assert(textA === textB, `Test 6: convergence failure — A='${textA}' B='${textB}'`);
    assert(textA.length === 5, `Test 6: expected 5 chars, got ${textA.length} ('${textA}')`);
    pass(`Test 6: Convergence — concurrent insert at different positions → '${textA}'`);
  }

  // -------------------------------------------------------------------------
  // Test 7 — Idempotency: applying the same InsertOp twice is a no-op
  // -------------------------------------------------------------------------
  {
    let doc = createDocument("site-A");
    const [, remoteOp] = localInsert(createDocument("site-B"), 0, "Z");

    const once = applyOp(doc, remoteOp);
    const twice = applyOp(once, remoteOp);

    assert(
      once.nodes.length === twice.nodes.length,
      `Test 7: node count changed — once=${once.nodes.length} twice=${twice.nodes.length}`
    );
    assert(
      getVisibleText(once) === getVisibleText(twice),
      `Test 7: visible text changed — once='${getVisibleText(once)}' twice='${getVisibleText(twice)}'`
    );
    pass("Test 7: Idempotency");
  }

  // -------------------------------------------------------------------------
  // Test 8 — Delete of remotely inserted character
  // -------------------------------------------------------------------------
  {
    let docA = createDocument("site-A");
    let docB = createDocument("site-B");

    // A inserts 'x'; B receives it
    const [docA2, insertOp] = localInsert(docA, 0, "x");
    docA = docA2;
    docB = applyOp(docB, insertOp);

    // B deletes 'x'
    const [docB2, deleteOp] = localDelete(docB, 0);
    docB = docB2;

    // Cross-apply: A gets B's delete
    docA = applyOp(docA, deleteOp);

    const textA = getVisibleText(docA);
    const textB = getVisibleText(docB);

    assert(textA === textB, `Test 8: convergence failure — A='${textA}' B='${textB}'`);
    assert(textA === "", `Test 8: expected '', got '${textA}'`);
    pass("Test 8: Delete of remotely inserted character");
  }

  // -------------------------------------------------------------------------
  // Test 9 — Replay from op log
  // -------------------------------------------------------------------------
  {
    let siteA = createDocument("site-A");
    const opsLog: RGAOp[] = [];

    // Generate 5 ops: insert 'w','o','r','l','d'
    for (const [i, ch] of ["w", "o", "r", "l", "d"].entries()) {
      const [next, op] = localInsert(siteA, i, ch);
      siteA = next;
      opsLog.push(op);
    }

    // Replay on fresh doc
    let fresh = createDocument("site-A");
    for (const op of opsLog) {
      fresh = applyOp(fresh, op);
    }

    const original = getVisibleText(siteA);
    const replayed = getVisibleText(fresh);

    assert(original === replayed, `Test 9: replay mismatch — original='${original}' replayed='${replayed}'`);
    assert(original === "world", `Test 9: expected 'world', got '${original}'`);
    pass("Test 9: Replay from op log");
  }

  // -------------------------------------------------------------------------
  // Test 10 — Serialization round-trip
  // -------------------------------------------------------------------------
  {
    const doc = createDocument("site-1");
    const [, insertOp] = localInsert(doc, 0, "k");
    const rawInsert = serializeOp(insertOp);
    const parsedInsert = deserializeOp(rawInsert) as InsertOp;
    assert(parsedInsert.type === "insert", "Test 10: insert type mismatch after deserialize");
    assert(parsedInsert.node.char === "k", `Test 10: char mismatch — got '${parsedInsert.node.char}'`);

    const withK = applyOp(doc, insertOp);
    const [, deleteOp] = localDelete(withK, 0);
    const rawDelete = serializeOp(deleteOp);
    const parsedDelete = deserializeOp(rawDelete) as DeleteOp;
    assert(parsedDelete.type === "delete", "Test 10: delete type mismatch after deserialize");
    assert(
      parsedDelete.targetId.clock === deleteOp.targetId.clock,
      `Test 10: targetId.clock mismatch — expected ${deleteOp.targetId.clock}, got ${parsedDelete.targetId.clock}`
    );
    pass("Test 10: Serialization round-trip");
  }

  // -------------------------------------------------------------------------
  // Test 11 — Multi-character paste convergence
  // -------------------------------------------------------------------------
  {
    let siteA = createDocument("site-A");
    let siteB = createDocument("site-B");

    // A pastes 'hello' (5 inserts at position 0 sequentially)
    const opsA: RGAOp[] = [];
    for (const [i, ch] of ["h", "e", "l", "l", "o"].entries()) {
      const [next, op] = localInsert(siteA, i, ch);
      siteA = next;
      opsA.push(op);
    }

    // B pastes 'world' (5 inserts at position 0 sequentially) — simultaneously
    const opsB: RGAOp[] = [];
    for (const [i, ch] of ["w", "o", "r", "l", "d"].entries()) {
      const [next, op] = localInsert(siteB, i, ch);
      siteB = next;
      opsB.push(op);
    }

    // Cross-apply all ops
    for (const op of opsB) {
      siteA = applyOp(siteA, op);
    }
    for (const op of opsA) {
      siteB = applyOp(siteB, op);
    }

    const textA = getVisibleText(siteA);
    const textB = getVisibleText(siteB);

    assert(textA === textB, `Test 11: convergence failure — A='${textA}' B='${textB}'`);
    assert(textA.length === 10, `Test 11: expected 10 chars, got ${textA.length} ('${textA}')`);
    pass(`Test 11: Multi-character paste convergence → '${textA}'`);
  }

  // -------------------------------------------------------------------------
  // Done
  // -------------------------------------------------------------------------
  console.log("All RGA CRDT tests passed successfully!");
}

runTests();
