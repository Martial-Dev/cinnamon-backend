const assert = require("node:assert/strict");
const test = require("node:test");
const { ethers } = require("ethers");
const {
  buildMerkleTree,
  movementLeaf,
  unitKeyOf,
  verifyMerkleProof,
} = require("../utils/merkle");

const hash = (seed) => ethers.keccak256(ethers.toUtf8Bytes(`m-${seed}`));
const leavesFor = (count) =>
  Array.from({ length: count }, (_, index) =>
    movementLeaf(unitKeyOf("B-1003", index + 1), hash(index)),
  );

test("every leaf proves against the root for many tree sizes", () => {
  for (const count of [1, 2, 3, 4, 5, 8, 9, 31, 33, 500]) {
    const leaves = leavesFor(count);
    const { root, proofs } = buildMerkleTree(leaves);
    leaves.forEach((leaf, index) => {
      assert.equal(verifyMerkleProof(leaf, proofs[index], root), true, `${count}/${index}`);
    });
    // Proofs stay short: about log2(count) hashes.
    assert.ok(proofs[0].length <= Math.ceil(Math.log2(count)));
  }
});

test("a single-movement tree has the leaf as its root", () => {
  const [leaf] = leavesFor(1);
  const { root, proofs } = buildMerkleTree([leaf]);
  assert.equal(root, leaf);
  assert.deepEqual(proofs[0], []);
});

test("changed data, a swapped proof, or another unit's key fail", () => {
  const leaves = leavesFor(6);
  const { root, proofs } = buildMerkleTree(leaves);
  const changed = movementLeaf(unitKeyOf("B-1003", 1), hash(999));
  const otherUnit = movementLeaf(unitKeyOf("B-1003", 2), hash(0));

  assert.equal(verifyMerkleProof(changed, proofs[0], root), false);
  assert.equal(verifyMerkleProof(leaves[0], proofs[1], root), false);
  assert.equal(verifyMerkleProof(otherUnit, proofs[0], root), false);
  assert.equal(verifyMerkleProof("not-hex", proofs[0], root), false);
});

test("movement fingerprints are accepted with or without a 0x prefix", () => {
  const unitKey = unitKeyOf("B-1003", 7);
  const plain = "ab".repeat(32);
  assert.equal(movementLeaf(unitKey, plain), movementLeaf(unitKey, `0x${plain}`));
  assert.throws(() => movementLeaf(unitKey, "abc"));
});
