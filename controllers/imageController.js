// filepath: /backend-mongodb/backend-mongodb/src/controllers/imageController.js
const multer = require("multer");
const path = require("path");

// Set up storage engine for multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

// Initialize upload variable
const upload = multer({ storage: storage });

// Upload image
exports.uploadImage = (req, res) => {
  upload.single("image")(req, res, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.status(200).json({ message: "Image uploaded successfully", file: req.file });
  });
};

// Get image
exports.getImage = (req, res) => {
  const imagePath = path.join(__dirname, "../../uploads", req.params.filename);
  res.sendFile(imagePath, (err) => {
    if (err) {
      res.status(404).json({ error: "Image not found" });
    }
  });
};