const express = require("express");
const router = express.Router();
const hashController = require("../controllers/hashController");

router.post("/record", hashController.recordHashOnBlockchain);
router.post("/verify", hashController.verifyHash);
router.get("/proof/:type/:id", hashController.getBlockchainProof);

module.exports = router;
