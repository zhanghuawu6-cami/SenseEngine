import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function requireDirectory(directoryPath, description) {
  if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
    throw new Error(`${description} is missing: ${directoryPath}`);
  }
}

function requireFile(filePath, description) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${description} is missing: ${filePath}`);
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
  const publicSource = path.join(resolvedWebRoot, "public");
  const staticSource = path.join(resolvedWebRoot, ".next", "static");
  const standaloneRoot = path.join(resolvedWebRoot, ".next", "standalone");
  const serverEntry = path.join(standaloneRoot, "server.js");

  requireDirectory(publicSource, "public directory");
  requireDirectory(staticSource, "Next static directory");
  requireFile(serverEntry, "standalone server");

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
