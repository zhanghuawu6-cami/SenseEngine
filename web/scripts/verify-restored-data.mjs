import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,239}$/;

function requireRealDatabase(databasePath) {
  const metadata = fs.lstatSync(databasePath);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error();
  }
}

function requireRealMediaRoot(mediaRoot) {
  const metadata = fs.lstatSync(mediaRoot);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error();
  }
}

function verifyRegularMediaFile(filePath, expectedSize) {
  const pathMetadata = fs.lstatSync(filePath);
  if (pathMetadata.isSymbolicLink() || !pathMetadata.isFile()) {
    throw new Error();
  }

  let descriptor;
  try {
    descriptor = fs.openSync(
      filePath,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
    const descriptorMetadata = fs.fstatSync(descriptor);
    if (
      !descriptorMetadata.isFile()
      || descriptorMetadata.dev !== pathMetadata.dev
      || descriptorMetadata.ino !== pathMetadata.ino
      || descriptorMetadata.size !== expectedSize
    ) {
      throw new Error();
    }
  } finally {
    if (descriptor !== undefined) {
      fs.closeSync(descriptor);
    }
  }
}

function verifyRestoredData() {
  const databasePath = process.env.DATABASE_PATH;
  const mediaRoot = process.env.MEDIA_ROOT;
  if (
    !databasePath
    || !mediaRoot
    || !path.isAbsolute(databasePath)
    || !path.isAbsolute(mediaRoot)
  ) {
    throw new Error();
  }

  requireRealDatabase(databasePath);
  requireRealMediaRoot(mediaRoot);

  let database;
  try {
    database = new Database(databasePath, { fileMustExist: true, readonly: true });
    const integrityRows = database.prepare("PRAGMA integrity_check").all();
    if (
      integrityRows.length !== 1
      || integrityRows[0] === null
      || typeof integrityRows[0] !== "object"
      || integrityRows[0].integrity_check !== "ok"
    ) {
      throw new Error();
    }

    const rows = database.prepare("SELECT filename, size FROM media").all();
    const expectedMedia = new Map();
    for (const row of rows) {
      if (
        row === null
        || typeof row !== "object"
        || typeof row.filename !== "string"
        || !SAFE_FILENAME.test(row.filename)
        || typeof row.size !== "number"
        || !Number.isSafeInteger(row.size)
        || row.size < 0
        || expectedMedia.has(row.filename)
      ) {
        throw new Error();
      }
      expectedMedia.set(row.filename, row.size);
    }

    const entries = fs.readdirSync(mediaRoot);
    const observedMedia = new Set();
    for (const filename of entries) {
      if (!SAFE_FILENAME.test(filename)) {
        throw new Error();
      }
      const filePath = path.join(mediaRoot, filename);
      const pathMetadata = fs.lstatSync(filePath);
      if (pathMetadata.isSymbolicLink() || !pathMetadata.isFile()) {
        throw new Error();
      }
      const expectedSize = expectedMedia.get(filename);
      if (expectedSize === undefined) {
        throw new Error();
      }
      verifyRegularMediaFile(filePath, expectedSize);
      observedMedia.add(filename);
    }

    if (
      observedMedia.size !== expectedMedia.size
      || [...expectedMedia.keys()].some((filename) => !observedMedia.has(filename))
    ) {
      throw new Error();
    }
  } finally {
    if (database !== undefined) {
      database.close();
    }
  }
}

try {
  verifyRestoredData();
  process.stdout.write("restored data verification passed\n");
} catch {
  process.stderr.write("Restored data verification failed.\n");
  process.exitCode = 1;
}
