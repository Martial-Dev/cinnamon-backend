const express = require("express");
const checkAuth = require("../middleware/check-auth");
const requireAdmin = require("../middleware/require-admin");
const router = express.Router();
const hashController = require("../controllers/hashController");

router.use(checkAuth, requireAdmin);
router.post("/record", hashController.recordHashOnBlockchain);
router.post("/verify", hashController.verifyHash);
router.get("/proof/:type/:id", hashController.getBlockchainProof);

module.exports = router;
