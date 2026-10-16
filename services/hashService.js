const crypto = require("crypto");
const BlockchainProof = require("../models/BlockchainProof");

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
    const error = new Error(
      "On-chain proof recording is not configured for purchase orders.",
    );
    error.statusCode = 503;
    error.code = "PO_BLOCKCHAIN_NOT_CONFIGURED";
    throw error;
  }

  async getProofByDocument(documentType, documentId) {
    return BlockchainProof.findOne({
      documentType,
      documentId,
      network: { $ne: "polygon-mock" },
    });
  }

  async verifyHash() {
    return {
      verificationStatus: "NOT_CONFIGURED",
      verified: false,
      message:
        "Purchase-order hashes are not currently verifiable on the configured blockchain contract.",
    };
  }
}

module.exports = new HashService();
