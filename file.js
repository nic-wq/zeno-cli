// file.js
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import chalk from 'chalk';

// Utility to promisify exec
function execPromise(command, options) {
  return new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        // console.warn(chalk.yellow(`Exec error for command "${command}": ${error.message}`));
        // Resolve with error details for the AI to process, instead of rejecting outright unless it's a fatal exec error
        resolve({ success: false, stdout, stderr: stderr || error.message, error: error });
        return;
      }
      if (stderr) {
        // console.warn(chalk.yellow(`Exec stderr for command "${command}": ${stderr}`));
        // Consider stderr as part of the output, might be useful info or a non-fatal warning
      }
      resolve({ success: true, stdout, stderr });
    });
  });
}


/**
 * Creates a new file with the given content.
 * @param {string} basePath The base working directory.
 * @param {string} relativeFilePath Path to the new file, relative to basePath.
 * @param {string} fileContent Content of the new file.
 * @returns {Promise<string>} A message indicating success or failure.
 */
export async function createNewFile(basePath, relativeFilePath, fileContent) {
  if (!relativeFilePath || typeof relativeFilePath !== 'string' || relativeFilePath.includes('..')) {
    return "Error: Invalid or potentially unsafe file path for new_file.";
  }
  const absoluteFilePath = path.resolve(basePath, relativeFilePath);
  if (!absoluteFilePath.startsWith(path.resolve(basePath))) { // Security check
    return "Error: File path is outside the allowed working directory for new_file.";
  }

  try {
    await fs.writeFile(absoluteFilePath, fileContent || '', 'utf8');
    return `File "${relativeFilePath}" created successfully in ${basePath}.`;
  } catch (error) {
    return `Error creating file "${relativeFilePath}": ${error.message}`;
  }
}

/**
 * Runs a shell command.
 * @param {string} basePath The working directory for the command.
 * @param {string} commandToRun The command to execute.
 * @returns {Promise<string>} The stdout and stderr of the command.
 */
export async function runShellCommand(basePath, commandToRun) {
  if (!commandToRun || typeof commandToRun !== 'string') {
    return "Error: Invalid command for run_command.";
  }
  try {
    // Ensure commands run within the designated basePath if they are relative.
    // However, absolute paths in commands will still execute from where they point.
    // This is a tricky one to sandbox perfectly without more complex measures.
    // User confirmation is the primary safeguard here.
    const options = { cwd: basePath };
    console.log(chalk.dim(`Executing command in ${basePath}: ${commandToRun}`));
    const { success, stdout, stderr, error } = await execPromise(commandToRun, options);

    let result = "";
    if (stdout) result += `Stdout:\n${stdout}\n`;
    if (stderr) result += `Stderr:\n${stderr}\n`;
    if (!success && error) result += `Execution Error: ${error.message}\n`;
    if (!result) result = "Command executed, no output produced.";

    return result.trim();

  } catch (error) { // This catch is for errors in execPromise setup, not exec itself
    return `Error executing command "${commandToRun}": ${error.message}`;
  }
}

/**
 * Renames or moves a file.
 * @param {string} basePath The base working directory.
 *  @param {string} relativeOldPath Path to the existing file, relative to basePath.
 * @param {string} relativeNewPath New path for the file, relative to basePath.
 * @returns {Promise<string>} A message indicating success or failure.
 */
export async function renameFile(basePath, relativeOldPath, relativeNewPath) {
  if (!relativeOldPath || typeof relativeOldPath !== 'string' || relativeOldPath.includes('..') ||
      !relativeNewPath || typeof relativeNewPath !== 'string' || relativeNewPath.includes('..')) {
    return "Error: Invalid or potentially unsafe file paths for modify_file (rename).";
  }

  const absoluteOldPath = path.resolve(basePath, relativeOldPath);
  const absoluteNewPath = path.resolve(basePath, relativeNewPath);

  if (!absoluteOldPath.startsWith(path.resolve(basePath)) || !absoluteNewPath.startsWith(path.resolve(basePath))) { // Security check
    return "Error: File paths are outside the allowed working directory for modify_file (rename).";
  }

  try {
    await fs.rename(absoluteOldPath, absoluteNewPath);
    return `File "${relativeOldPath}" renamed/moved to "${relativeNewPath}" successfully in ${basePath}.`;
  } catch (error) {
    return `Error renaming file "${relativeOldPath}" to "${relativeNewPath}": ${error.message}`;
  }
}
