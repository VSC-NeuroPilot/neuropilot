import * as fs from "fs";
import * as path from "path";
import ignore from "ignore";

/**
 * Recursively find the first path that is ignored by .gitignore
 * @param baseDir - Root directory where .gitignore is located
 * @param targets - List of file or folder paths to check (absolute or relative to baseDir)
 * @returns The first ignored path found, or false if none match
 */
export function findIgnoredFile(baseDir: string, targets: string[]): string | false {
  const gitignorePath = path.join(baseDir, ".gitignore");

  if (!fs.existsSync(gitignorePath)) {
    throw new Error(`.gitignore not found in: ${baseDir}`);
  }

  const ig = ignore();
  const gitignoreContent = fs.readFileSync(gitignorePath, "utf8");
  ig.add(gitignoreContent);

  /**
   * Recursively walk through a folder and return first ignored file/folder
   */
  function checkRecursive(targetPath: string): string | false {
    const relPath = path.relative(baseDir, targetPath);

    // Check if this path itself is ignored
    if (ig.ignores(relPath)) {
      return targetPath;
    }

    // If it's a directory, walk through it
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
      const files = fs.readdirSync(targetPath);
      for (const file of files) {
        const childPath = path.join(targetPath, file);
        const result = checkRecursive(childPath);
        if (result) return result;
      }
    }

    return false;
  }

  for (const target of targets) {
    const absPath = path.isAbsolute(target) ? target : path.join(baseDir, target);
    const result = checkRecursive(absPath);
    if (result) return result;
  }

  return false;
}

// Example usage (optional)
if (require.main === module) {
  const base = process.cwd();
  const list = process.argv.slice(2);
  const result = findIgnoredFile(base, list);
  console.log(result || "No ignored files found");
}
