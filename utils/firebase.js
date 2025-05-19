const admin = require("firebase-admin");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const serviceAccount =  JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "travemobile.appspot.com",
  });
}

const bucket = admin.storage().bucket();

async function uploadImageToFirebase(
  fileBuffer,
  originalName,
  folder = "uploads"
) {
  const ext = path.extname(originalName);
  const filename = `${folder}/${uuidv4()}${ext}`;
  const file = bucket.file(filename);

  await file.save(fileBuffer, {
    metadata: { contentType: "image/jpeg" }, // or detect from file
    public: true,
    validation: "md5",
  });

  // Make file public and get URL
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${filename}`;
}

module.exports = uploadImageToFirebase;
