const express = require("express");
const crypto = require("crypto");
const yauzl = require("yauzl");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();
const entries = new Map();
const fileHashes = new Map();

/**
 * Validates a file path for security.
 * @param {string} path - The path to validate.
 * @returns {boolean} - True if the path is valid, false otherwise.
 */
const validatePath = (path) => {
  if (typeof path !== "string") return false;
  if (path.includes("..")) return false;
  if (/^([A-Za-z]:[\\/]|\\|[/\\])/i.test(path)) return false;
  return true;
};

/**
 * Validates the hashes object for required properties.
 * @param {object} hashes - The hashes object to validate.
 * @returns {boolean} - True if the hashes object is valid, false otherwise.
 */
const validateHashes = (hashes) => {
  return (
    hashes &&
    typeof hashes.sha1 === "string" &&
    typeof hashes.sha512 === "string"
  );
};

/**
 * Processes a ZIP buffer to extract and validate modrinth.index.json.
 * @param {Buffer} buffer - The ZIP file buffer.
 * @returns {Promise<object>} - The parsed and validated JSON object.
 */
const processZip = (buffer) =>
  new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      zipfile.on("entry", (entry) => {
        if (entry.fileName === "modrinth.index.json") {
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) return reject(err);

            let data = [];
            readStream.on("data", (chunk) => data.push(chunk));
            readStream.on("end", () => {
              zipfile.close();
              try {
                const json = JSON.parse(Buffer.concat(data).toString());

                if (!json.files || !Array.isArray(json.files)) {
                  return reject(
                    new Error("Invalid modrinth.index.json format")
                  );
                }

                for (const file of json.files) {
                  if (!validatePath(file.path)) {
                    return reject(
                      new Error(`Invalid path detected: ${file.path}`)
                    );
                  }
                  if (!validateHashes(file.hashes)) {
                    return reject(new Error("Missing required hashes"));
                  }
                }

                resolve(json);
              } catch (e) {
                reject(e);
              }
            });
          });
        } else {
          zipfile.readEntry();
        }
      });

      zipfile.on("error", reject);
      zipfile.readEntry();
    });
  });

router.post("/upload", async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).send("No file uploaded");
    }

    const file = req.files.file;
    if (!file.name.endsWith(".mrpack")) {
      return res.status(400).send("Invalid file type");
    }

    const hash = crypto.createHash("sha256").update(file.data).digest("hex");

    if (fileHashes.has(hash)) {
      const existing = fileHashes.get(hash);
      if (entries.has(existing.uuid)) {
        entries.get(existing.uuid).expiresAt = Date.now() + 180000;
        return res.json({ url: `/mrpack/entry/${existing.uuid}` });
      }
    }

    const json = await processZip(file.data);

    const uuid = uuidv4();
    const expiresAt = Date.now() + 180000;

    entries.set(uuid, { data: json, expiresAt });
    fileHashes.set(hash, { uuid, expiresAt });

    res.json({ url: `/mrpack/entry/${uuid}` });
  } catch (err) {
    console.error(err);
    res.status(400).send(err.message);
  }
});

router.get("/entry/:uuid", (req, res) => {
  const entry = entries.get(req.params.uuid);
  if (!entry || entry.expiresAt < Date.now()) {
    return res.status(404).send("Not found or expired");
  }
  res.json(entry.data);
});

setInterval(() => {
  const now = Date.now();
  for (const [uuid, entry] of entries.entries()) {
    if (entry.expiresAt < now) {
      entries.delete(uuid);
    }
  }
  for (const [hash, entry] of fileHashes.entries()) {
    if (entry.expiresAt < now) {
      fileHashes.delete(hash);
    }
  }
}, 60000);

module.exports = router;