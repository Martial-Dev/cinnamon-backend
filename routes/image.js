const express = require("express");
const router = express.Router();
const multer = require("multer");
const imageController = require("../controllers/imageController");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage: storage });

router.post("/", upload.single("image"), imageController.uploadImage);
router.get("/:filename", imageController.getImage);

module.exports = router;