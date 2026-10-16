const { ethers } = require("ethers");
const { batchKeyOf, toBytes32 } = require("./merkle");

const TRACEABILITY_ABI = [
  "function recordBatch(bytes32 batchKey, bytes32 dataHash) external",
  "function verifyBatch(bytes32 batchKey, bytes32 dataHash) external view returns (bool)",
  "function anchorMovements(bytes32 root, uint32 leafCount) external",
  "function verifyMovement(bytes32 root, bytes32 leaf, bytes32[] proof) external view returns (bool)",
  "function movementAnchors(bytes32 root) external view returns (uint64 anchoredAt, uint32 leafCount)",
];

class BatchBlockchainService {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.contract = null;
    this.confirmations = 1;
  }

  initialize(rpcUrl, privateKey, contractAddress, options = {}) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, this.provider);
    this.contract = new ethers.Contract(
      contractAddress,
      TRACEABILITY_ABI,
      this.signer,
    );
    this.confirmations = Number(options.confirmations) || 1;
  }

  isConfigured() {
    return Boolean(this.contract);
  }

  async recordBatch(batchId, dataHash) {
    if (!this.contract) return { status: "not_configured" };
    const transaction = await this.contract.recordBatch(
      batchKeyOf(batchId),
      toBytes32(dataHash),
    );
    const receipt = await transaction.wait(this.confirmations);
    return this.formatReceipt(receipt);
  }

  async verifyBatch(batchId, dataHash) {
    if (!this.contract) return null;
    return this.contract.verifyBatch(batchKeyOf(batchId), toBytes32(dataHash));
  }

  /**
   * Anchors one Merkle root covering `leafCount` movements. `onSubmitted`
   * receives the transaction hash before mining so it can be saved; if the
   * process stops while waiting, the anchor can be found again by its root.
   */
  async anchorMovements(root, leafCount, onSubmitted) {
    if (!this.contract) return { status: "not_configured" };
    const transaction = await this.contract.anchorMovements(
      toBytes32(root),
      leafCount,
    );
    if (onSubmitted) await onSubmitted(transaction.hash);
    const receipt = await transaction.wait(this.confirmations);
    return this.formatReceipt(receipt);
  }

  /** Whether a root is on chain, and when. Free read. */
  async getMovementAnchor(root) {
    if (!this.contract) return null;
    const [anchoredAt, leafCount] = await this.contract.movementAnchors(
      toBytes32(root),
    );
    return {
      anchored: anchoredAt > 0n,
      anchoredAt: anchoredAt > 0n ? new Date(Number(anchoredAt) * 1000) : null,
      leafCount: Number(leafCount),
    };
  }

  async verifyMovement(root, leaf, proof) {
    if (!this.contract) return null;
    return this.contract.verifyMovement(
      toBytes32(root),
      toBytes32(leaf),
      (proof || []).map(toBytes32),
    );
  }

  async formatReceipt(receipt) {
    const txId = receipt.hash;
    let network = "unknown";
    try {
      const networkInfo = await this.provider.getNetwork();
      network =
        networkInfo.name && networkInfo.name !== "unknown"
          ? networkInfo.name
          : `chain-${networkInfo.chainId}`;
    } catch (_error) {
      // The mined transaction remains valid if optional network metadata is unavailable.
    }
    return {
      status: "recorded",
      txId,
      blockNumber: Number(receipt.blockNumber),
      network,
      contractAddress: this.contract.target,
      explorerUrl: this.explorerUrl(txId),
    };
  }

  explorerUrl(txId) {
    const explorerBaseUrl = process.env.BLOCKCHAIN_EXPLORER_URL;
    return explorerBaseUrl && txId
      ? `${explorerBaseUrl.replace(/\/$/, "")}/tx/${txId}`
      : "";
  }
}

module.exports = new BatchBlockchainService();
module.exports.TRACEABILITY_ABI = TRACEABILITY_ABI;
