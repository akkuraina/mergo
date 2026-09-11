import {
  createDocument,
  localInsert,
  localDelete,
  applyOp,
  getVisibleText,
  getVisibleLength,
  serializeOp,
  deserializeOp,
} from "./rga";

function runTests() {
  console.log("Running RGA CRDT tests...");

  // 1. Insert into empty document
  {
    const doc = createDocument("site-1");
    const [updatedDoc, op] = localInsert(doc, 0, "a");
    console.assert(
      getVisibleText(updatedDoc) === "a",
      `Test 1 Failed: Expected "a", got "${getVisibleText(updatedDoc)}"`
    );
    console.assert(
      getVisibleLength(updatedDoc) === 1,
      `Test 1 Failed: Expected length 1, got ${getVisibleLength(updatedDoc)}`
    );
    console.assert(op.type === "insert", "Test 1 Failed: Expected insert op");
    console.log("✓ Test 1 Passed: Insert into empty document");
  }

  // 2. Sequential inserts — text is in correct order
  {
    let doc = createDocument("site-1");
    const chars = ["H", "e", "l", "l", "o"];
    for (let i = 0; i < chars.length; i++) {
      const [nextDoc] = localInsert(doc, i, chars[i]);
      doc = nextDoc;
    }
    console.assert(
      getVisibleText(doc) === "Hello",
      `Test 2 Failed: Expected "Hello", got "${getVisibleText(doc)}"`
    );
    console.assert(
      getVisibleLength(doc) === 5,
      `Test 2 Failed: Expected length 5, got ${getVisibleLength(doc)}`
    );

    // Insert in the middle: 'H' (idx 0), 'e' (idx 1) -> insert 'y' at index 1 -> "Hye llo"
    const [docWithMiddle] = localInsert(doc, 1, "-");
    console.assert(
      getVisibleText(docWithMiddle) === "H-ello",
      `Test 2 Failed: Expected "H-ello", got "${getVisibleText(docWithMiddle)}"`
    );
    console.log("✓ Test 2 Passed: Sequential inserts");
  }

  // 3. Delete — character disappears from visible text but node remains in doc.nodes
  {
    let doc = createDocument("site-1");
    const [d1] = localInsert(doc, 0, "a");
    const [d2] = localInsert(d1, 1, "b");
    const [d3] = localInsert(d2, 2, "c");
    // Visible: "abc", nodes count: 4 (sentinel + a + b + c)
    console.assert(getVisibleText(d3) === "abc", "Test 3 Setup failed");
    console.assert(d3.nodes.length === 4, "Test 3 Setup node length failed");

    // Delete 'b' at visible index 1
    const [deletedDoc, deleteOp] = localDelete(d3, 1);
    console.assert(
      getVisibleText(deletedDoc) === "ac",
      `Test 3 Failed: Expected "ac", got "${getVisibleText(deletedDoc)}"`
    );
    console.assert(
      deletedDoc.nodes.length === 4,
      `Test 3 Failed: Node count should remain 4, got ${deletedDoc.nodes.length}`
    );
    console.assert(
      deleteOp.type === "delete",
      "Test 3 Failed: Expected delete op"
    );
    console.log("✓ Test 3 Passed: Delete with tombstone preservation");
  }

  // 4. Concurrent insert conflict — two documents (site A and site B) both insert at position 0 simultaneously.
  {
    let docA = createDocument("site-A");
    let docB = createDocument("site-B");

    const [docAAfterInsert, opA] = localInsert(docA, 0, "X");
    const [docBAfterInsert, opB] = localInsert(docB, 0, "Y");

    // Apply A's op to B and B's op to A
    const finalDocA = applyOp(docAAfterInsert, opB);
    const finalDocB = applyOp(docBAfterInsert, opA);

    const textA = getVisibleText(finalDocA);
    const textB = getVisibleText(finalDocB);

    console.assert(
      textA === textB,
      `Test 4 Failed: Convergence error: textA="${textA}", textB="${textB}"`
    );
    console.log(
      `✓ Test 4 Passed: Concurrent insert conflict converged to "${textA}"`
    );
  }

  // 5. Idempotency — applying the same InsertOp twice produces the same document as applying it once
  {
    const doc = createDocument("site-1");
    const [, op] = localInsert(createDocument("site-2"), 0, "Z");

    const appliedOnce = applyOp(doc, op);
    const appliedTwice = applyOp(appliedOnce, op);

    console.assert(
      appliedOnce.nodes.length === appliedTwice.nodes.length,
      "Test 5 Failed: Node count changed after duplicate op"
    );
    console.assert(
      getVisibleText(appliedOnce) === getVisibleText(appliedTwice),
      "Test 5 Failed: Visible text changed after duplicate op"
    );
    console.log("✓ Test 5 Passed: Idempotency");
  }

  // 6. Delete of a concurrently inserted character
  {
    // Initial document on both sites with text "H"
    let docA = createDocument("site-A");
    const [docWithH, initOp] = localInsert(docA, 0, "H");
    docA = docWithH;

    let docB = createDocument("site-B");
    docB = applyOp(docB, initOp);

    // Site A inserts 'i' at index 1 -> "Hi"
    const [docA2, insertOpA] = localInsert(docA, 1, "i");

    // Site B deletes 'H' at index 0 -> ""
    const [docB2, deleteOpB] = localDelete(docB, 0);

    // Now exchange ops
    const finalA = applyOp(docA2, deleteOpB);
    const finalB = applyOp(docB2, insertOpA);

    const textA = getVisibleText(finalA);
    const textB = getVisibleText(finalB);

    console.assert(
      textA === textB,
      `Test 6 Failed: Convergence error: textA="${textA}", textB="${textB}"`
    );
    console.assert(
      textA === "i",
      `Test 6 Failed: Expected visible text to be "i", got "${textA}"`
    );
    console.log(
      `✓ Test 6 Passed: Delete of concurrently inserted character converged to "${textA}"`
    );
  }

  // 7. Serialization and Deserialization
  {
    const doc = createDocument("site-1");
    const [, insertOp] = localInsert(doc, 0, "k");
    const rawInsert = serializeOp(insertOp);
    const parsedInsert = deserializeOp(rawInsert);
    console.assert(
      parsedInsert.type === insertOp.type &&
        parsedInsert.node.char === insertOp.node.char,
      "Serialization test failed for insert"
    );

    const [, deleteOp] = localDelete(applyOp(doc, insertOp), 0);
    const rawDelete = serializeOp(deleteOp);
    const parsedDelete = deserializeOp(rawDelete);
    console.assert(
      parsedDelete.type === deleteOp.type &&
        parsedDelete.targetId.clock === deleteOp.targetId.clock,
      "Serialization test failed for delete"
    );
    console.log("✓ Test 7 Passed: Op serialization and deserialization");
  }

  console.log("All RGA CRDT tests passed successfully!");
}

runTests();
