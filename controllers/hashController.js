const hashService = require("../services/hashService");

exports.recordHashOnBlockchain = async (req, res) => {
  try {
    const { documentType, documentId, hash, materials } = req.body;
    const proof = await hashService.recordOnBlockchain(
      documentType,
      documentId,
      hash,
      materials || [],
    );
    res.status(201).json(proof);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.verifyHash = async (req, res) => {
  try {
    const { documentType, documentId, hash } = req.body;
    const result = await hashService.verifyHash(documentType, documentId, hash);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getBlockchainProof = async (req, res) => {
  try {
    const proof = await hashService.getProofByDocument(
      req.params.type || "PO",
      req.params.id,
    );
    if (!proof) return res.status(404).json({ message: "Proof not found" });
    res.json(proof);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
