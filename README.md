# AI Dev Assistant for VS Code

A powerful AI coding assistant extension for Visual Studio Code, similar to Claude Code and GitHub Copilot Chat. Get intelligent code suggestions, reviews, and assistance directly in your editor.

## Features

- 🤖 **AI Chat Interface** - Sidebar chat panel for natural conversations about your code
- 📝 **Context-Aware** - Automatically reads your active file for context-aware responses
- 🔍 **Diff View** - Review AI suggestions with side-by-side comparison
- ⚡ **Command Execution** - Run suggested terminal commands (with your permission)
- 🔒 **Workspace Trust** - Respects VS Code's security model
- 🎨 **Beautiful UI** - Modern chat interface with Tailwind CSS
- 🛡️ **Semgrep Integration** - Security & code quality analysis powered by Semgrep static analysis
- 📊 **Vulnerability Detection** - Automatic detection of security issues, code smells, and best practice violations

## Installation & Setup

### Prerequisites

- Visual Studio Code 1.85.0 or higher
- Node.js 16.x or higher
- npm or yarn
- OpenAI API key (get one at https://platform.openai.com/api-keys)
- **[Optional but Recommended]** Semgrep CLI for enhanced security analysis (see [Semgrep Setup Guide](./SETUP_SEMGREP.md))

### Quick Start

1. **Clone or create the extension folder**:

   ```bash
   mkdir ai-dev-assistant
   cd ai-dev-assistant
   ```

2. **Create the required folder structure**:

   ```bash
   mkdir -p src media
   ```

3. **Copy the files**:

   - Place `extension.ts`, `ChatViewProvider.ts`, and `aiService.ts` in the `src/` folder
   - Place `chat.html` in the `media/` folder
   - Place `package.json` and `tsconfig.json` in the root folder

4. **Install dependencies**:

   ```bash
   npm install
   ```

5. **Configure your API key**:

   ```bash
   cp .env.example .env
   # Edit .env and add your OpenAI API key
   ```

   Your `.env` file should look like:

   ```
   OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx
   ```

6. **Compile the TypeScript**:

   ```bash
   npm run compile
   ```

7. **Run the extension**:
   - Open the project in VS Code
   - Press `F5` to launch Extension Development Host
   - The AI Dev Assistant icon will appear in the sidebar

## Usage

### Basic Chat

1. Click the AI Dev Assistant icon in the sidebar (🤖)
2. Type your question or request in the input box
3. Press Enter or click Send
4. Wait for the AI response

### Context-Aware Assistance

1. Open any code file in your editor
2. Ask the AI about your code:
   - "Review this code"
   - "Find bugs in this file"
   - "Explain what this function does"
   - "Suggest improvements"

The AI automatically reads your active file and provides context-aware responses.

### Review AI Suggestions

When the AI suggests code changes:

1. Click **"Show Diff"** to see a side-by-side comparison
2. Click **"Apply to Active File"** to accept the changes
3. Review the diff and manually adjust if needed

### Run Commands

When the AI suggests terminal commands:

1. Click **"Run Command"** button
2. Confirm in the popup dialog
3. The command runs in a new terminal

⚠️ **Security Note**: Always review commands before running them!

## Configuration

### Via Settings UI

1. Open VS Code Settings (`Cmd+,` or `Ctrl+,`)
2. Search for "AI Dev Assistant"
3. Configure:
   - **API Key** (alternative to .env file)
   - **Model** (gpt-4, gpt-4-turbo, gpt-3.5-turbo)
   - **Max Tokens** (response length limit)
   - **Temperature** (creativity level: 0-2)

### Via Environment Variables

Edit your `.env` file:

```bash
OPENAI_API_KEY=your_key_here
LLM_MODEL=gpt-4
LLM_MAX_TOKENS=2000
LLM_TEMPERATURE=0.7
```

## Commands

Access via Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`):

- **AI Dev Assistant: Open Chat** - Opens the chat sidebar
- **AI Dev Assistant: Show Diff View** - Shows comparison view
- **AI Dev Assistant: Run Terminal Command** - Executes a command

## Project Structure

```
ai-dev-assistant/
├── src/
│   ├── extension.ts         # Entry point, registers commands
│   ├── ChatViewProvider.ts  # Manages webview UI
│   └── aiService.ts         # Handles LLM API calls
├── media/
│   ├── chat.html           # Chat interface UI
│   └── robot-icon.svg      # Extension icon (optional)
├── out/                    # Compiled JavaScript (generated)
├── package.json           # Extension manifest
├── tsconfig.json          # TypeScript configuration
├── .env                   # Your API key (create from .env.example)
└── README.md             # This file
```

## Development

### Compile TypeScript

```bash
npm run compile
```

### Watch Mode (auto-compile on save)

```bash
npm run watch
```

### Debug the Extension

1. Open the project in VS Code
2. Press `F5` to launch Extension Development Host
3. Set breakpoints in TypeScript files
4. Interact with the extension to trigger breakpoints

### Package for Distribution

```bash
npm run package
```

This creates a `.vsix` file you can install or publish.

## Troubleshooting

### "API key not configured" error

- Make sure your `.env` file exists in the root folder
- Check that `OPENAI_API_KEY` is set correctly
- Restart VS Code after creating/editing `.env`

### Extension doesn't appear in sidebar

- Check that `package.json` is configured correctly
- Run `npm run compile` to rebuild
- Reload the Extension Development Host (`Cmd+R` or `Ctrl+R`)

### AI responses are slow

- This is normal for GPT-4 (can take 10-30 seconds)
- Try using `gpt-3.5-turbo` for faster responses
- Check your internet connection

### Commands won't run in untrusted workspace

- This is a security feature
- Open the workspace settings and mark it as trusted
- Or open a trusted folder

## Security & Privacy

- ✅ **No background uploads** - Code is only sent when you ask
- ✅ **Explicit permissions** - Commands require confirmation
- ✅ **Workspace trust** - Dangerous features disabled in untrusted workspaces
- ✅ **Local storage** - API key stored in your `.env` file, never transmitted except to OpenAI

## Customization

### Using a Different LLM Provider

Edit `src/aiService.ts` and change the `LLM_CONFIG`:

```typescript
const LLM_CONFIG = {
  apiUrl: "https://your-llm-provider.com/v1/chat/completions",
  apiKey: process.env.YOUR_API_KEY,
  model: "your-model-name",
  // ...
};
```

### Customizing the System Prompt

Edit the `SYSTEM_PROMPT` constant in `src/aiService.ts` to change the AI's behavior.

### Styling the Chat UI

Edit `media/chat.html` to customize colors, fonts, and layout. The UI uses Tailwind CSS for styling.

## 🛡️ Semgrep Security Integration

The extension now includes **Semgrep** static analysis for enhanced security and code quality insights!

### What is Semgrep?

[Semgrep](https://semgrep.dev/) is a powerful static analysis tool that finds bugs, detects security vulnerabilities, and enforces code standards. It helps the AI provide:

- 🔒 **Security vulnerability detection** (SQL injection, XSS, hardcoded secrets)
- 📊 **Code quality issues** (unused variables, magic numbers, empty catches)
- ✅ **Best practice enforcement** (proper async/await, secure crypto)
- 🎯 **OWASP & CWE classifications** for better security understanding

### Quick Setup

1. **Install Semgrep**:
   ```bash
   pip install semgrep
   ```

2. **Verify installation**:
   ```bash
   semgrep --version
   ```

3. **That's it!** The extension will automatically use Semgrep when analyzing code.

### How It Enhances AI Responses

**Without Semgrep:**
```
User: Review this code
AI: The code looks reasonable. You might want to add error handling.
```

**With Semgrep:**
```
User: Review this code
AI: 🔒 Security Analysis Found Critical Issues:

1. ❌ SQL Injection Risk (line 42)
   - Issue: Concatenating user input into SQL query
   - CWE: CWE-89 | OWASP: A03:2021
   - Fix: Use parameterized queries

   ❌ Vulnerable:
   db.query("SELECT * FROM users WHERE id = " + userId)

   ✅ Secure:
   db.query("SELECT * FROM users WHERE id = ?", [userId])
```

### Configuration

Enable/disable and configure in VS Code Settings:

```json
{
  "aiDevAssistant.semgrep.enabled": true,
  "aiDevAssistant.semgrep.rulesets": ["auto", "p/security-audit"],
  "aiDevAssistant.semgrep.timeout": 30
}
```

### Documentation

- 📖 **[Complete Semgrep Integration Guide](./SEMGREP_INTEGRATION.md)**
- 🚀 **[Quick Setup Guide](./SETUP_SEMGREP.md)**
- 🔧 **[Custom Rules](https://semgrep.dev/docs/writing-rules/overview)**

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- 📧 Email: support@example.com
- 🐛 Issues: https://github.com/yourusername/ai-dev-assistant/issues
- 📖 Docs: https://github.com/yourusername/ai-dev-assistant/wiki

## Acknowledgments

- Built with the VS Code Extension API
- Powered by OpenAI GPT models and Google Gemini
- Security analysis by [Semgrep](https://semgrep.dev/)
- Inspired by Claude Code and GitHub Copilot Chat

---

**Happy Coding! 🚀**
# omnigaurd-extension
