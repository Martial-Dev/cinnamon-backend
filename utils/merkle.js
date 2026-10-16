const { ethers } = require("ethers");

// Merkle tree for anchoring many unit movements with one transaction.
// Must match BatchTraceability.verifyMovement (OpenZeppelin MerkleProof):
// pairs are hashed in sorted order, and leaves are double-hashed so a leaf can
// never be mistaken for an inner node.

const abi = ethers.AbiCoder.defaultAbiCoder();

const toBytes32 = (hex) => {
  const value = String(hex || "").toLowerCase();
  const prefixed = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-f]{64}$/.test(prefixed)) {
    throw new Error("Expected a 32-byte hex value.");
  }
  return prefixed;
};

const batchKeyOf = (batchId) => ethers.keccak256(ethers.toUtf8Bytes(batchId));

const unitKeyOf = (batchId, unitNumber) =>
  ethers.keccak256(ethers.toUtf8Bytes(`${batchId}:${unitNumber}`));

/** Leaf for one movement of one unit. */
const movementLeaf = (unitKey, movementHash) =>
  ethers.keccak256(
    ethers.keccak256(
      abi.encode(["bytes32", "bytes32"], [toBytes32(unitKey), toBytes32(movementHash)]),
    ),
  );

const hashPair = (left, right) =>
  left <= right
    ? ethers.keccak256(ethers.concat([left, right]))
    : ethers.keccak256(ethers.concat([right, left]));

/**
 * Builds the tree and returns the root plus one proof per leaf, in input order.
 * An odd node at the end of a level is carried up unchanged.
 */
const buildMerkleTree = (leaves) => {
  if (!Array.isArray(leaves) || leaves.length === 0) {
    throw new Error("A Merkle tree needs at least one leaf.");
  }
  const levels = [leaves.map(toBytes32)];
  while (levels[levels.length - 1].length > 1) {
    const level = levels[levels.length - 1];
    const next = [];
    for (let index = 0; index < level.length; index += 2) {
      next.push(
        index + 1 < level.length ? hashPair(level[index], level[index + 1]) : level[index],
      );
    }
    levels.push(next);
  }

  const proofs = leaves.map((_, leafIndex) => {
    const proof = [];
    let index = leafIndex;
    for (let depth = 0; depth < levels.length - 1; depth += 1) {
      const level = levels[depth];
      const sibling = index % 2 === 0 ? index + 1 : index - 1;
      if (sibling < level.length) proof.push(level[sibling]);
      index = Math.floor(index / 2);
    }
    return proof;
  });

  return { root: levels[levels.length - 1][0], proofs };
};

/** Same check the contract runs, done locally. */
const verifyMerkleProof = (leaf, proof, root) => {
  try {
    const computed = (proof || []).reduce(
      (node, sibling) => hashPair(node, toBytes32(sibling)),
      toBytes32(leaf),
    );
    return computed === toBytes32(root);
  } catch {
    return false;
  }
};

module.exports = {
  batchKeyOf,
  unitKeyOf,
  movementLeaf,
  buildMerkleTree,
  verifyMerkleProof,
  toBytes32,
};
