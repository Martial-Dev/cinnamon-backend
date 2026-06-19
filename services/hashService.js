const crypto = require("crypto");
const BlockchainProof = require("../models/BlockchainProof");
const blockchainUtil = require("../utils/blockchain");

class HashService {
  generatePOHash(po) {
    const dataString = JSON.stringify({
      supplierId: po.supplierId,
      products: po.items || po.products || [],
      totalAmount: po.totalAmount || po.total,
      dueDate: po.dueDate,
      timestamp: new Date().toISOString(),
    });
    return crypto.createHash("sha256").update(dataString).digest("hex");
  }

  generateMaterialHash(material) {
    const s = JSON.stringify({
      type: material.materialType,
      supplierId: material.supplierId,
      batchId: material.batchId,
      quantity: material.quantity,
      timestamp: new Date().toISOString(),
    });
    return crypto.createHash("sha256").update(s).digest("hex");
  }

  async recordOnBlockchain(documentType, documentId, dataHash, materials = []) {
    // For development use mock recording
    const result = await blockchainUtil.recordSupplierHashMock(
      dataHash,
      String(documentId),
    );

    // Save proof record in DB
    const proof = new BlockchainProof({
      documentType,
      documentId,
      dataHash,
      txId: result.txId,
      network: result.network,
      contractAddress: result.contractAddress,
      explorerUrl: result.explorerUrl,
      verified: true,
      materials: materials.map((m) => ({
        materialType: m.materialType,
        batchId: m.batchId,
        materialHash: m.hash,
      })),
      recordedAt: result.recordedAt,
    });

    await proof.save();
    return proof;
  }

  async getProofByDocument(documentType, documentId) {
    return BlockchainProof.findOne({ documentType, documentId });
  }

  async verifyHash(documentType, documentId, hash) {
    const proof = await this.getProofByDocument(documentType, documentId);
    if (!proof) return { verified: false };
    return { verified: proof.dataHash === hash, proof };
  }
}

module.exports = new HashService();
