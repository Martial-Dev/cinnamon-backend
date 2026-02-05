const admin = require("firebase-admin");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

let bucket = null;
let firebaseConfigured = false;

if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  try {
    const serviceAccount = JSON.parse(
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
    );

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: "travemobile.appspot.com",
      });
      bucket = admin.storage().bucket();
      firebaseConfigured = true;
      console.log("✅ Firebase configured");
    }
  } catch (error) {
    console.warn("⚠️ Firebase not configured - image uploads disabled", error.message);
  }
} else {
  console.warn("⚠️ Firebase not configured (GOOGLE_APPLICATION_CREDENTIALS_JSON not set)");
}

async function uploadImageToFirebase(
  fileBuffer,
  originalName,
  folder = "uploads"
) {
  if (!firebaseConfigured || !bucket) {
    throw new Error("Firebase storage is not configured");
  }

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

module.exports = uploadImageToFirebase;
