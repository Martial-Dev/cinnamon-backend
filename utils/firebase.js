const { getApps, initializeApp, cert } = require("firebase-admin/app");
const { getStorage } = require("firebase-admin/storage");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const serviceAccount = JSON.parse(
  process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
);

// Modern check to see if firebase has been initialized in this session
if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
    storageBucket: "travemobile.appspot.com",
  });
}

// Access bucket via explicit storage getter
const bucket = getStorage().bucket();

async function uploadImageToFirebase(
  fileBuffer,
  originalName,
  folder = "uploads"
) {
  const ext = path.extname(originalName).toLowerCase();
  const filename = `${folder}/${uuidv4()}${ext}`;
  const file = bucket.file(filename);

  // Detect content type
  let contentType = "application/octet-stream";
  if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
  else if (ext === ".png") contentType = "image/png";
  else if (ext === ".gif") contentType = "image/gif";
  else if (ext === ".pdf") contentType = "application/pdf";

  await file.save(fileBuffer, {
    metadata: { contentType },
    public: true,
    validation: "md5",
  });

  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${filename}`;
}

// Export the function using standard CommonJS
module.exports = uploadImageToFirebase;