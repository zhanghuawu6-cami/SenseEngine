import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function requireEntry(entryPath, description) {
  try {
    return fs.lstatSync(entryPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(`${description} is missing: ${entryPath}`);
    }
    throw error;
  }
}

function requireDirectory(directoryPath, description) {
  const stats = requireEntry(directoryPath, description);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${description} must be a real directory: ${directoryPath}`);
  }
  return fs.realpathSync(directoryPath);
}

function requireFile(filePath, description) {
  const stats = requireEntry(filePath, description);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`${description} must be a regular file: ${filePath}`);
  }
}

function requireDescendant(realRoot, realCandidate, description) {
  const relativePath = path.relative(realRoot, realCandidate);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`${description} is outside its allowed root: ${realCandidate}`);
  }
}

function rejectSymlinks(sourceRoot) {
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    const entryPath = path.join(sourceRoot, entry.name);
    const stats = fs.lstatSync(entryPath);
    if (entry.isSymbolicLink() || stats.isSymbolicLink()) {
      throw new Error(`Source asset trees cannot contain symlinks: ${entryPath}`);
    }
    if (stats.isDirectory()) {
      rejectSymlinks(entryPath);
    }
  }
}

function replaceAssetTree(source, destination, standaloneRoot) {
  const resolvedRoot = path.resolve(standaloneRoot);
  const resolvedDestination = path.resolve(destination);
  if (!resolvedDestination.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing to replace assets outside standalone output: ${resolvedDestination}`);
  }

  let existingParent = path.dirname(resolvedDestination);
  while (!fs.existsSync(existingParent)) {
    const nextParent = path.dirname(existingParent);
    if (nextParent === existingParent) {
      throw new Error(`Cannot resolve destination parent: ${resolvedDestination}`);
    }
    existingParent = nextParent;
  }
  const realRoot = fs.realpathSync(resolvedRoot);
  const realParent = fs.realpathSync(existingParent);
  if (realParent !== realRoot && !realParent.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error(`Refusing to replace assets outside standalone output: ${resolvedDestination}`);
  }

  fs.rmSync(resolvedDestination, { force: true, recursive: true });
  fs.mkdirSync(path.dirname(resolvedDestination), { recursive: true });
  fs.cpSync(source, resolvedDestination, { recursive: true });
}

export function prepareStandalone(webRoot) {
  const resolvedWebRoot = path.resolve(webRoot);
  const nextRoot = path.join(resolvedWebRoot, ".next");
  const publicSource = path.join(resolvedWebRoot, "public");
  const staticSource = path.join(nextRoot, "static");
  const standaloneRoot = path.join(nextRoot, "standalone");
  const serverEntry = path.join(standaloneRoot, "server.js");

  const realWebRoot = requireDirectory(resolvedWebRoot, "Web root");
  const realPublicSource = requireDirectory(publicSource, "public directory");
  const realStaticSource = requireDirectory(staticSource, "Next static directory");
  const realStandaloneRoot = requireDirectory(standaloneRoot, "standalone output");
  const realNextRoot = fs.realpathSync(nextRoot);

  requireDescendant(realWebRoot, realPublicSource, "public directory");
  requireDescendant(realWebRoot, realStaticSource, "Next static directory");
  requireDescendant(realNextRoot, realStandaloneRoot, "standalone output");
  requireFile(serverEntry, "standalone server");
  rejectSymlinks(publicSource);
  rejectSymlinks(staticSource);

  replaceAssetTree(publicSource, path.join(standaloneRoot, "public"), standaloneRoot);
  replaceAssetTree(staticSource, path.join(standaloneRoot, ".next", "static"), standaloneRoot);
  return standaloneRoot;
}

const scriptPath = fileURLToPath(import.meta.url);
const isDirectInvocation = process.argv[1] && path.resolve(process.argv[1]) === scriptPath;

if (isDirectInvocation) {
  const webRoot = path.resolve(path.dirname(scriptPath), "..");
  const standaloneRoot = prepareStandalone(webRoot);
  process.chdir(standaloneRoot);
  await import(pathToFileURL(path.join(standaloneRoot, "server.js")).href);
}
