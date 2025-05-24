#!/usr/bin/env node

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import readline from "readline/promises";
import fs from "fs/promises";
import path from "path";
import os from "os";
import chalk from "chalk";
import { stdin as input, stdout as output } from 'process';
import https from 'https';

// Import file operation functions
import * as FileOps from './file.js';

// --- Configuration ---
const CONFIG_DIR = path.join(os.homedir(), ".config", "zeno");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json"); // Combined config
const CHAT_HISTORY_FILE = path.join(CONFIG_DIR, "zeno_chat_history.json");

const ACTIVE_MODEL = "gemini-2.5-flash-preview-05-20"; // Or your preferred model

let apiKey;
let genAI;
let chat;
let chatHistory = [];

// File Mode State
let isFilesModeEnabled = false;
let filesWorkingDirectory = null; // Persisted working directory
let tempFilesWorkingDirectory = null; // For 'this_folder', not persisted

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// --- Tool Definitions ---
const webSearchTool = {
  functionDeclarations: [
    {
      name: "web_search",
      description: "Search on the web for a given term to find real-time information or information beyond the model's training data.",
      parameters: {
        type: "object", properties: {
          term_to_search: { type: "string", description: "The keyword or phrase to search on the web." }
        }, required: ["term_to_search"]
      }
    }
  ]
};

const fileSystemToolDeclarations = [
  {
    name: "new_file",
    description: "Create a new file in the configured working directory.",
    parameters: {
      type: "object", properties: {
        file_path: { type: "string", description: "Path for the new file, relative to the working directory." },
        file_content: { type: "string", description: "Content for the new file." }
      }, required: ["file_path"] // content can be empty
    }
  },
  {
    name: "run_command",
    description: "Run a shell command in the configured working directory. Use with extreme caution.",
    parameters: {
      type: "object", properties: {
        command_to_run: { type: "string", description: "The shell command to execute." }
      }, required: ["command_to_run"]
    }
  },
  {
    name: "modify_file", // This is a RENAME/MOVE operation as per your schema
    description: "Rename or move a file within the configured working directory.",
    parameters: {
      type: "object", properties: {
        file_path: { type: "string", description: "Current path of the file, relative to the working directory." },
        new_file_name: { type: "string", description: "New name or path for the file, relative to the working directory." }
      }, required: ["file_path", "new_file_name"]
    }
  }
];

function getActiveTools() {
  let activeToolDeclarations = [...webSearchTool.functionDeclarations];
  if (isFilesModeEnabled && (filesWorkingDirectory || tempFilesWorkingDirectory)) {
    activeToolDeclarations.push(...fileSystemToolDeclarations);
  }
  return [{ functionDeclarations: activeToolDeclarations }];
}


// --- Config and History Management ---
async function ensureConfigDir() {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch (error) { if (error.code !== 'EEXIST') throw error; }
}

async function loadConfig() {
  await ensureConfigDir();
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    const config = JSON.parse(data);
    apiKey = config.apiKey;
    filesWorkingDirectory = config.filesWorkingDirectory || null; // Load persisted directory
    if (filesWorkingDirectory) isFilesModeEnabled = true; // Auto-enable if a dir is saved
    return config;
  } catch (error) {
    return {}; // Return empty object if no config or error
  }
}

async function saveConfig() {
  await ensureConfigDir();
  const configToSave = { apiKey };
  if (filesWorkingDirectory && !tempFilesWorkingDirectory) { // Only save if not 'this_folder'
    configToSave.filesWorkingDirectory = filesWorkingDirectory;
  }
  try {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(configToSave, null, 2));
  } catch (error) {
    console.error(chalk.red("Error saving Zeno configuration:"), error);
  }
}

async function promptForApiKey(rlInstance) {
  console.log(chalk.yellow("Gemini API Key not found in Zeno's configuration."));
  const key = await rlInstance.question(chalk.blue("Please enter your Gemini API Key: "));
  if (!key) {
    console.error(chalk.red("API Key cannot be empty. Exiting."));
    process.exit(1);
  }
  apiKey = key; // Set it globally
  const saveChoice = await rlInstance.question(chalk.blue("Do you want to save this API Key for future use? (yes/no): "));
  if (saveChoice.toLowerCase().startsWith('y')) {
    await saveConfig(); // Will save API key
    console.log(chalk.green("API Key saved."));
  }
  return key;
}

async function loadChatHistory() {
  await ensureConfigDir();
  try {
    const data = await fs.readFile(CHAT_HISTORY_FILE, "utf-8");
    chatHistory = JSON.parse(data);
    console.log(chalk.gray("Chat history loaded."));
  } catch (error) {
    if (error.code === 'ENOENT') chatHistory = [];
    else console.error(chalk.red("Error loading chat history:"), error);
  }
}

async function saveChatHistory() {
  await ensureConfigDir();
  try {
    await fs.writeFile(CHAT_HISTORY_FILE, JSON.stringify(chatHistory, null, 2));
  } catch (error) {
    console.error(chalk.red("Error saving chat history:"), error);
  }
}


// --- Gemini Initialization ---
function initializeGeminiClient() {
  if (!apiKey) {
    console.error(chalk.red("API Key is not set. Cannot initialize Gemini client."));
    process.exit(1);
  }
  genAI = new GoogleGenerativeAI(apiKey);
  startNewChatSession();
}

function startNewChatSession() {
    const modelConfig = {
        model: ACTIVE_MODEL,
        safetySettings,
        tools: getActiveTools(),
        generationConfig: { /* temperature: 0.7 */ }
    };

    const model = genAI.getGenerativeModel(modelConfig);
    chat = model.startChat({ history: chatHistory });
    console.log(chalk.magenta(`Chat session (re)started with ${ACTIVE_MODEL}.`));
    console.log(chalk.cyan(`Web search tool is available.`));
    if (isFilesModeEnabled && (filesWorkingDirectory || tempFilesWorkingDirectory)) {
        console.log(chalk.cyan(`File manipulation tools are ENABLED for directory: ${chalk.bold(filesWorkingDirectory || tempFilesWorkingDirectory)}`));
    } else {
        console.log(chalk.yellow(`File manipulation tools are DISABLED.`));
    }
}


// --- Tool Execution & Confirmation ---
async function executeWebSearch(term_to_search) {
  process.stdout.write(chalk.yellow(`Zeno is performing web search for: "${term_to_search}"...\n`)); // Added newline
  const encodedTerm = encodeURIComponent(term_to_search);
  const url = `https://text.pollinations.ai/prompt/${encodedTerm}?model=searchgpt`;
  // ... (rest of web search logic is the same)
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else {
          console.error(chalk.red(`Web search API error: Status ${res.statusCode}`));
          resolve(`Error: Failed to fetch search results. Status: ${res.statusCode}`);
        }
      });
    }).on('error', (err) => {
      console.error(chalk.red("Web search request error:"), err.message);
      resolve(`Error: Could not connect to the web search service. ${err.message}`);
    });
  });
}

async function handleToolConfirmation(rlInstance, toolCall) {
  const { name, args } = toolCall;
  const currentDir = tempFilesWorkingDirectory || filesWorkingDirectory;

  console.log(chalk.yellowBright("\n--- ACTION CONFIRMATION ---"));
  console.log(chalk.yellow(`Zeno wants to perform the following action:`));
  console.log(chalk.yellow(`Tool: ${name}`));
  console.log(chalk.yellow(`Arguments: ${JSON.stringify(args)}`));
  if (name !== 'web_search') {
    console.log(chalk.yellow(`In directory: ${currentDir}`));
  }
  if (name === 'run_command') {
    console.log(chalk.red.bold("WARNING: Executing shell commands can be dangerous!"));
  }

  while (true) {
    const choice = await rlInstance.question(chalk.blueBright("Confirm? (1: Yes, 2: No, 3: Explain action): "));
    if (choice === '1') return { confirmed: true, explain: false };
    if (choice === '2') return { confirmed: false, explain: false };
    if (choice === '3') return { confirmed: false, explain: true };
    console.log(chalk.red("Invalid choice. Please enter 1, 2, or 3."));
  }
}


// --- Command Handlers ---
async function toggleFilesMode(rlInstance) {
    if (isFilesModeEnabled) {
        isFilesModeEnabled = false;
        // tempFilesWorkingDirectory = null; // Reset temp dir when disabling
        // filesWorkingDirectory will be kept if it was persisted, so re-enabling /files will use it
        console.log(chalk.yellow("File manipulation mode DISABLED."));
        await saveConfig(); // Save the disabled state (by removing filesWorkingDirectory if it was temp)
    } else {
        console.log(chalk.blue("Enable file manipulation mode:"));
        let chosenDir = await rlInstance.question(chalk.blue("Enter full path to the folder Zeno can manage, or type 'this_folder': "));
        chosenDir = chosenDir.trim();

        if (chosenDir.toLowerCase() === 'this_folder') {
            tempFilesWorkingDirectory = process.cwd();
            filesWorkingDirectory = null; // Ensure persisted one is not used if 'this_folder' is chosen
            console.log(chalk.green(`File manipulation enabled for current directory (TEMPORARY): ${tempFilesWorkingDirectory}`));
            isFilesModeEnabled = true;
        } else if (chosenDir) {
            try {
                const stats = await fs.stat(chosenDir);
                if (!stats.isDirectory()) {
                    console.error(chalk.red("Error: Path provided is not a directory. File mode NOT enabled."));
                    return;
                }
                filesWorkingDirectory = path.resolve(chosenDir); // Store absolute path
                tempFilesWorkingDirectory = null;
                isFilesModeEnabled = true;
                console.log(chalk.green(`File manipulation enabled for directory (SAVED): ${filesWorkingDirectory}`));
                await saveConfig(); // Persist the chosen directory
            } catch (error) {
                console.error(chalk.red(`Error accessing path "${chosenDir}": ${error.message}. File mode NOT enabled.`));
                return;
            }
        } else {
            console.log(chalk.yellow("No directory provided. File manipulation mode remains disabled."));
            return;
        }
    }
    startNewChatSession(); // Re-initialize with new toolset
}


function displayHelp() {
  console.log(chalk.cyan("\nZeno Chat Commands:"));
  console.log(chalk.cyan(`  Model: ${ACTIVE_MODEL}`));
  console.log(chalk.cyan("  /files      - Toggle file manipulation mode & set working directory"));
  console.log(chalk.cyan("  /history    - Show current chat history"));
  console.log(chalk.cyan("  /clear      - Clear chat history and start fresh"));
  console.log(chalk.cyan("  /help       - Show this help message"));
  console.log(chalk.cyan("  /exit       - Exit Zeno"));
  console.log(chalk.cyan("  Current file mode: " + (isFilesModeEnabled ? chalk.green(`ENABLED for ${chalk.bold(tempFilesWorkingDirectory || filesWorkingDirectory || 'N/A')}`) : chalk.red("DISABLED"))));
  console.log("");
}

// --- Main Chat Logic ---
async function main() {
  const rl = readline.createInterface({ input, output });

  console.log(chalk.bold.magenta("Welcome to Zeno Chat!"));

  await loadConfig(); // Loads API key and filesWorkingDirectory
  if (!apiKey) {
    await promptForApiKey(rl); // This will set global apiKey and save if user agrees
  }

  await loadChatHistory();
  initializeGeminiClient(); // Initial call, will be called again if /files changes tools
  displayHelp();


  while (true) {
    const userInput = await rl.question(chalk.green("You: "));

    if (userInput.toLowerCase().startsWith('/')) {
        const command = userInput.toLowerCase();
        if (command === "/exit") { console.log(chalk.magenta("Zeno signing off. Goodbye!")); break; }
        if (command === "/help") { displayHelp(); continue; }
        if (command === "/history") { /* ... history display logic ... */
            console.log(chalk.gray("--- Chat History ---"));
            if (chatHistory.length === 0) console.log(chalk.gray("(empty)"));
            else chatHistory.forEach(msg => { /* ... detailed history print ... */
                 const roleDisplay = msg.role === 'user' ? chalk.green(msg.role) : chalk.blueBright(msg.role);
                 let content = "";
                 if (Array.isArray(msg.parts)) {
                     content = msg.parts.map(p => {
                         if (p.text) return p.text;
                         if (p.functionCall) return `[Function Call: ${p.functionCall.name} Args: ${JSON.stringify(p.functionCall.args)}]`;
                         if (p.functionResponse) return `[Function Response for: ${p.functionResponse.name} Content: ${JSON.stringify(p.functionResponse.response.content || p.functionResponse.response)}]`;
                         return JSON.stringify(p);
                     }).join('');
                 }
                 console.log(chalk.gray(`${roleDisplay}: ${content}`));
            });
            console.log(chalk.gray("--------------------"));
            continue;
        }
        if (command === "/clear") {
            chatHistory = []; await saveChatHistory(); startNewChatSession();
            console.log(chalk.yellow("Chat history cleared.")); continue;
        }
        if (command === "/files") { await toggleFilesMode(rl); continue; }
        console.log(chalk.red(`Unknown command: ${userInput}`));
        continue;
    }

    if (!userInput.trim()) continue;
    chatHistory.push({ role: "user", parts: [{ text: userInput }] });

    let continueLoop = true;
    while(continueLoop) {
        continueLoop = false;
        let firstChunk = true;
        process.stdout.write(chalk.blue("Zeno is typing..."));

        try {
            const result = await chat.sendMessageStream(chatHistory[chatHistory.length - 1].parts);
            let fullResponseText = "";
            let aggregatedFunctionCall;

            for await (const chunk of result.stream) {
                if (firstChunk) {
                    process.stdout.clearLine(0); process.stdout.cursorTo(0);
                    process.stdout.write(chalk.blueBright("Zeno: "));
                    firstChunk = false;
                }
                if (chunk.functionCalls && chunk.functionCalls.length > 0) aggregatedFunctionCall = chunk.functionCalls[0];
                const chunkText = chunk.text();
                if (chunkText) { process.stdout.write(chalk.blueBright(chunkText)); fullResponseText += chunkText; }
            }
            if (!firstChunk) process.stdout.write("\n");

            const finalResponse = await result.response;
            if (finalResponse.candidates && finalResponse.candidates[0].content && finalResponse.candidates[0].content.parts) {
                const functionCallPart = finalResponse.candidates[0].content.parts.find(part => part.functionCall);
                if (functionCallPart) aggregatedFunctionCall = functionCallPart.functionCall;
            }

            if (aggregatedFunctionCall) {
                const toolCall = aggregatedFunctionCall;
                let toolExecutionResult;
                let userConfirmation = { confirmed: true, explain: false }; // Default for web_search

                if (toolCall.name !== 'web_search') { // Needs confirmation
                    userConfirmation = await handleToolConfirmation(rl, toolCall);
                }

                if (userConfirmation.explain) {
                    const explanationRequest = `User is asking for an explanation. Please explain why you (Zeno) want to execute the tool '${toolCall.name}' with arguments ${JSON.stringify(toolCall.args)} in the context of our current conversation, and what the expected outcome or purpose is. Be concise.`;
                    chatHistory.push({ role: "model", parts: [{ functionCall: toolCall }] }); // Log AI's intention
                    chatHistory.push({ role: "user", parts: [{ text: `(System: User requested explanation for your proposed action: ${toolCall.name})` }]});

                    process.stdout.write(chalk.blue("Zeno is typing (explanation)..."));
                    const explanationResult = await chat.sendMessageStream(explanationRequest);
                    let explanationText = "";
                    firstChunk = true; // Reset for explanation
                    for await (const chunk of explanationResult.stream) {
                        if (firstChunk) {
                            process.stdout.clearLine(0); process.stdout.cursorTo(0);
                            process.stdout.write(chalk.cyanBright("Zeno (Explanation): "));
                            firstChunk = false;
                        }
                        const text = chunk.text();
                        if (text) { process.stdout.write(chalk.cyanBright(text)); explanationText += text; }
                    }
                    if(!firstChunk) process.stdout.write("\n");
                    chatHistory.push({ role: "model", parts: [{text: explanationText}]});

                    // Re-prompt for confirmation (Yes/No only this time)
                    console.log(chalk.yellowBright("\n--- ACTION CONFIRMATION (after explanation) ---"));
                    while(true){
                        const choice = await rl.question(chalk.blueBright("Confirm action? (1: Yes, 2: No): "));
                        if (choice === '1') { userConfirmation.confirmed = true; break; }
                        if (choice === '2') { userConfirmation.confirmed = false; break; }
                        console.log(chalk.red("Invalid choice."));
                    }
                }

                if (userConfirmation.confirmed) {
                    chatHistory.push({ role: "model", parts: [{ functionCall: toolCall }] }); // Log AI's intention if confirmed
                    const currentActiveDir = tempFilesWorkingDirectory || filesWorkingDirectory;

                    switch (toolCall.name) {
                        case "web_search":
                            toolExecutionResult = await executeWebSearch(toolCall.args.term_to_search);
                            break;
                        case "new_file":
                            toolExecutionResult = await FileOps.createNewFile(currentActiveDir, toolCall.args.file_path, toolCall.args.file_content);
                            break;
                        case "run_command":
                            toolExecutionResult = await FileOps.runShellCommand(currentActiveDir, toolCall.args.command_to_run);
                            break;
                        case "modify_file": // Rename
                            toolExecutionResult = await FileOps.renameFile(currentActiveDir, toolCall.args.file_path, toolCall.args.new_file_name);
                            break;
                        default:
                            toolExecutionResult = `Error: Unknown tool '${toolCall.name}' requested.`;
                            console.error(chalk.red(toolExecutionResult));
                    }
                    chatHistory.push({ role: "function", parts: [{ functionResponse: { name: toolCall.name, response: { content: toolExecutionResult } } }] });
                    continueLoop = true; // Let AI process the tool's output
                } else {
                    // User denied the action
                    chatHistory.push({ role: "model", parts: [{ functionCall: toolCall }] }); // Log AI's intention
                    chatHistory.push({ role: "function", parts: [{ functionResponse: { name: toolCall.name, response: { content: "User denied execution of this action." } } }] });
                    console.log(chalk.yellow("Action denied by user."));
                    continueLoop = true; // Let AI know it was denied
                }

            } else if (fullResponseText.trim()) {
                chatHistory.push({ role: "model", parts: [{ text: fullResponseText }] });
            } else {
                // Handle cases like safety blocks or empty responses if needed
                const finishReason = finalResponse.candidates && finalResponse.candidates[0].finishReason;
                if (finishReason && finishReason !== "STOP") {
                     console.log(chalk.yellow(`Zeno: (Responded without text. Finish Reason: ${finishReason})`));
                     if (finalResponse.candidates[0].safetyRatings) {
                        console.log(chalk.yellow(`Safety Ratings: ${JSON.stringify(finalResponse.candidates[0].safetyRatings)}`));
                     }
                } else if (!fullResponseText.trim()){
                    // console.log(chalk.gray("Zeno: (Empty response)"));
                }
            }

        } catch (error) {
            if (!firstChunk) process.stdout.write("\n"); else { process.stdout.clearLine(0); process.stdout.cursorTo(0); }
            console.error(chalk.red("Error communicating with Gemini:"), error.message || error);
            if (error.message && error.message.includes("SAFETY")) console.error(chalk.yellow("This might be due to safety settings."));
        }
    }
    await saveChatHistory();
  }
  rl.close();
}

main().catch(err => {
  console.error(chalk.red("Unhandled error in Zeno:"), err);
  process.exit(1);
});
