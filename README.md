# Zeno - Your Gemini-Powered CLI Chatbot 🤖

[NPM version](https://www.npmjs.com/package/@nic-wq/zeno)

Zeno is an intelligent command-line interface (CLI) chatbot powered by Google's Gemini API. It can hold conversations, search the web for real-time information, and (with your explicit permission) interact with your local file system.

## ✨ Features

*   **Conversational AI:** Engage in natural conversations with Gemini.
*   **Web Search:** Ask Zeno to find current information on the web.
*   **File Manipulation (Optional & Confirmed):**
    *   Enable Zeno to work within a specified directory.
    *   Create new files.
    *   Rename/move files.
    *   Run shell commands (with extreme caution and explicit confirmation).
*   **Persistent Chat History:** Zeno remembers your conversation.
*   **Configurable:** API key and file mode settings are saved.
*   **User Confirmation:** Critical actions like file operations require explicit user approval, with an option to ask Zeno for an explanation.

## 📋 Prerequisites

*   [Node.js](https://nodejs.org/) (version 18.0.0 or higher recommended)
*   npm (comes with Node.js)
*   A Google Gemini API Key: Get one from [Google AI Studio](https://aistudio.google.com/app/apikey).

## 🚀 Installation

You can install Zeno in two ways:

### Method 1: From NPM (Recommended for Users)

This is the easiest way to get Zeno up and running:


# Zeno CLI – Instalação e Uso

## 📦 Instalação

### Método 1: Via NPM (Recomendado)

# Zeno CLI – Installation & Usage Guide

## 📦 Installation

### Method 1: Via NPM (Recommended)

```bash
npm install -g zeno-cli
```

Method 2: From GitHub (For Developers or Manual Installation)
Clone the repository:

```bash
git clone https://github.com/your-username/zeno-cli.git
```

Navigate to the project directory:

```bash
cd zeno-cli
```

Install dependencies:

```bash
npm install
```

(Optional) Make Zeno available globally:

```bash
npm link
```

This allows you to run zeno from any directory. To undo this, run npm unlink in the project directory.

🛠️ First-Time Setup
After installation, run Zeno for the first time:

```bash
zeno
```

API Key: Zeno will prompt you for your Google Gemini API Key if it's not already configured.
The key is stored locally at:
Linux/macOS: ~/.config/zeno/config.json
Windows: C:\Users\<YourUserName>\.config\zeno\config.json

💻 Usage
Start a Zeno session by typing:

```bash
zeno
```


Key Commands
```/help``` – Displays the help message with all available commands.

```/files``` – Toggles file manipulation mode.

You can specify a full path (saved for future sessions) or type this_folder to use the current directory (not saved).

```/history``` – Shows the current chat history.

```/clear``` – Clears the current chat history.

```/exit``` – Exits Zeno.

🤖 Interacting with Zeno
Web Search
Ask questions that require up-to-date information (e.g., “What’s the weather like in London?”). Zeno will use the web_search tool.

File Operations (with /files enabled)
Examples of requests you can make:

“Create a file named test.txt with the content 'Hello from Zeno!'”

“Rename old_notes.md to new_notes.md.”

“Run the command ls -la.” (Use with extreme caution!)

Zeno will always ask for confirmation (Yes/No/Explain) before performing any file-related actions.

⚙️ Configuration
Zeno stores configuration and history in your user home directory:

Configuration File: ~/.config/zeno/config.json (contains API key and file working directory)

Chat History: ~/.config/zeno/zeno_chat_history.json

⚠️ Security Warning: File Operations
The file manipulation features—especially run_command—give Zeno (and the underlying AI) the ability to modify your file system and run arbitrary commands in the configured directory.

Always review Zeno’s proposed actions carefully before confirming.

Use the “Explain” option if you’re unsure about an action.

Only enable file mode for directories you trust Zeno to access.

The this_folder option is safer for one-time tasks, as it is not persisted.

The Zeno developers are not responsible for data loss or system issues caused by misuse of these features. Use at your own risk.

🤝 Contributing
Contributions are welcome!

Fork the repository.

Create a feature branch:

```bash
git checkout -b feature/AmazingFeature
```
Commit your changes:

```bash
git commit -m "Add AmazingFeature"
```

Push the branch:

```bash
git push origin feature/AmazingFeature
```

Open a Pull Request.

For major changes, please open an issue first to discuss what you'd like to change.

📜 License
Distributed under the MIT License.