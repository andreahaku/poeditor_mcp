# POEditor Integration Studio

A comprehensive MCP (Model Context Protocol) server that eliminates the pain of manual POEditor translation management by automating key detection, creation, and synchronization across Vue 3, Nuxt 3, and React Native applications.

## Features

### 🔍 Automatic Key Detection
- **AST-based scanning** of i18next/vue-i18n patterns in code
- **Multi-framework support**: Vue 3, Nuxt 3, React Native, i18next
- **Resource file parsing**: JSON, TypeScript exports, ICU pluralization
- **Dynamic key detection**: Identifies template literals and computed keys

### 🎯 Intelligent Key Naming
- **Consistent hierarchical naming**: `auth.login.button.submit`
- **Framework-aware suggestions**: Based on file structure and usage patterns
- **Confidence scoring**: High/medium/low confidence rename suggestions
- **Conflict detection**: Prevents naming collisions

### 🔄 Bidirectional Synchronization
- **Two-way sync** between POEditor and local translation files
- **Bulk operations**: Rate-limit aware API operations
- **Change detection**: Only sync what has actually changed
- **Safe updates**: Dry-run mode and backup creation

### 🛠️ Safe Code Refactoring
- **Automated codemod** for key renaming across all codebases
- **Pattern matching**: Handles `$t()`, `useTranslation().t()`, `<Trans>` components
- **Resource file updates**: JSON and TypeScript translation files
- **Backup creation**: Automatic backup before changes

### 🚀 Hardcoded String Automation
- **Intelligent string detection**: Finds translatable hardcoded strings in templates, JSX, and literals
- **LLM-powered translation**: Requests language detection and translations from AI models
- **Context-aware replacement**: Generates framework-specific i18n calls
- **End-to-end workflow**: Detects → Translates → Creates POEditor keys → Replaces code

## Quick Start

### 1. Installation

```bash
cd poeditor_mcp
pnpm install
```

### 2. Configuration

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` with your POEditor API token:
```env
POEDITOR_API_TOKEN=your_poeditor_api_token_here
POEDITOR_PROJECT_ID=your_project_id_here
```

### 3. Build and Run

```bash
# Build the server
pnpm build

# Run in development mode
pnpm dev

# Start production server
pnpm start
```

### 4. Add to Claude Code

```bash
# Add the MCP server to Claude Code
claude mcp add poeditor -s user -- node /path/to/poeditor_mcp/dist/index.js
```

## Usage Examples

### Detect i18n Keys in Your Codebase

```bash
claude "Use poeditor_detect_keys to scan src/**/*.vue and src/**/*.tsx for Vue 3 and React Native i18n keys"
```

### Generate Key Naming Suggestions

```bash
claude "Use poeditor_name_suggest to improve the naming of my detected keys using dot notation style"
```

### Create Sync Plan

```bash
claude "Use poeditor_diff with project ID 123456 to compare my local keys with POEditor"
```

### Execute Synchronization

```bash
claude "Use poeditor_sync to execute the sync plan and update POEditor with machine translation enabled for German and Spanish"
```

### Pull Translations to Local Files

```bash
claude "Use poeditor_sync_local to pull translations in i18next format to src/locales directory"
```

### Apply Key Renames Safely

```bash
claude "Use poeditor_apply_renames to apply the suggested key renames across src/**/*.vue files with backup enabled"
```

### Process Hardcoded Strings (New!)

```bash
claude "Use poeditor_process_hardcoded_strings to find hardcoded strings in src/**/*.vue files, get translations, and replace with i18n calls"
```

## MCP Tools

### `poeditor_detect_keys`
Parse code to extract i18n keys with metadata from Vue 3, Nuxt 3, and React Native projects.

**Parameters:**
- `globs`: File patterns to scan (e.g., `["src/**/*.vue", "src/**/*.tsx"]`)
- `frameworks`: Target frameworks (`["vue3", "nuxt3", "react-native", "i18next"]`)
- `sourceLang`: Source language code (default: "en")
- `resourceFormats`: Resource file formats (default: `["json", "typescript"]`)
- `ignore`: Patterns to ignore (default: `["node_modules/**", "dist/**"]`)

### `poeditor_name_suggest`
Generate consistent, hierarchical key naming suggestions.

**Parameters:**
- `keys`: Keys from detect_keys to analyze
- `style`: Naming style (`"dot"` or `"kebab"`, default: `"dot"`)
- `rules`: Naming rules configuration (prefix, maxDepth, stopWords)
- `allowlist`: Keys to preserve as-is
- `denylist`: Key patterns to avoid

### `poeditor_diff`
Compare local keys with POEditor terms to plan changes.

**Parameters:**
- `projectId`: POEditor project ID or slug
- `sourceLang`: Source language code (default: "en")
- `includeLangs`: Languages to include in diff
- `keys`: Keys to compare (optional, will detect if not provided)
- `deleteExtraneous`: Include deletion of POEditor terms not found locally

### `poeditor_sync`
Execute planned changes in POEditor with bulk operations.

**Parameters:**
- `plan`: Sync plan from poeditor_diff
- `batchSize`: Batch size for bulk operations (default: 100)
- `direction`: Sync direction (`"up"` = to POEditor)
- `machineTranslate`: Enable machine translation (boolean or language array)
- `dryRun`: Preview changes without executing
- `rateLimit`: Minimum seconds between requests (default: 20)

### `poeditor_sync_local`
Sync translations between POEditor and local resource files.

**Parameters:**
- `projectId`: POEditor project ID or slug
- `direction`: Sync direction (`"pull"` or `"push"`)
- `langs`: Languages to sync
- `format`: Output format (`"i18next"`, `"vue-i18n-json"`, `"vue-i18n-ts"`)
- `outDir`: Output directory for pull
- `inDir`: Input directory for push
- `bundleSplit`: File organization (`"per-lang"` or `"per-namespace"`)
- `dryRun`: Preview changes without executing

### `poeditor_apply_renames`
Apply key rename map safely across code and resources.

**Parameters:**
- `renames`: Rename map from name_suggest
- `globs`: File patterns to process
- `resourceDirs`: Resource directories to update
- `confirmLowConfidence`: Apply low-confidence renames
- `backup`: Create backup files (default: true)

### `poeditor_process_hardcoded_strings`
Find hardcoded strings, detect language, translate to target languages, create POEditor keys, and replace with i18n calls.

**Parameters:**
- `globs`: File patterns to scan for hardcoded strings
- `frameworks`: Target frameworks (`["vue3", "nuxt3", "react-native", "i18next"]`)
- `projectId`: POEditor project ID or slug
- `targetLanguages`: Languages for translation (default: `["en", "it", "de", "es", "fr"]`)
- `ignore`: Patterns to ignore (default: `["node_modules/**", "dist/**"]`)
- `dryRun`: Preview changes without executing (default: false)
- `minConfidence`: Minimum confidence threshold (default: 0.7)
- `batchSize`: Strings to process per batch (default: 10)
- `replaceInCode`: Replace hardcoded strings with i18n calls (default: true)

## Framework Support

### Vue 3 / Nuxt 3 Patterns
- `$t('key')` - Template usage
- `t('key')` - Composition API
- `useI18n().t('key')` - Composable usage
- `i18n.global.t('key')` - Global instance
- SFC `<i18n>` blocks
- JSON and TypeScript resource files

### React Native Patterns
- `useTranslation().t('key')` - Hook usage
- `<Trans i18nKey="key">` - Component usage
- `i18n.t('key')` - Instance usage
- JSON resource files in `src/locales/`

### Resource File Formats
- **JSON**: Standard i18next format
- **TypeScript**: Typed exports with `as const`
- **ICU**: Pluralization and interpolation support

## Configuration

### Project Configuration (`.smartness-i18n.json`)

```json
{
  "apiToken": "your_api_token",
  "projectId": "your_project_id",
  "sourceLang": "en",
  "targetLangs": ["de", "es", "fr", "it"],
  "frameworks": ["vue3", "nuxt3", "react-native"],
  "keyStyle": "dot",
  "paths": {
    "include": [
      "src/**/*.vue",
      "src/**/*.ts",
      "src/**/*.tsx"
    ],
    "exclude": [
      "node_modules/**",
      "dist/**"
    ]
  },
  "namespaceRules": {
    "prefix": "",
    "maxDepth": 4,
    "stopWords": ["the", "and", "or"]
  },
  "resources": {
    "vue3": {
      "format": "json",
      "outDir": "src/i18n/locales",
      "bundleSplit": "per-lang"
    }
  }
}
```

### Environment Variables

```env
POEDITOR_API_TOKEN=your_poeditor_api_token_here
POEDITOR_PROJECT_ID=your_project_id_here
POEDITOR_SOURCE_LANG=en
POEDITOR_TARGET_LANGS=de,es,fr,it
POEDITOR_RATE_LIMIT_DELAY=20000
POEDITOR_BATCH_SIZE=100
```

## Development

### Build and Test

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run integration tests
pnpm test:integration

# Type checking
pnpm type-check
```

### Code Quality

```bash
# Lint code
pnpm lint

# Fix linting issues
pnpm lint:fix

# Format code
pnpm prettier
```

## Common Workflows

### 1. Initial Setup for New Project
```bash
# Detect all existing keys
claude "Use poeditor_detect_keys to scan the entire codebase"

# Generate naming suggestions
claude "Use poeditor_name_suggest to standardize key naming"

# Apply renames if needed
claude "Use poeditor_apply_renames to apply high-confidence renames"

# Create sync plan
claude "Use poeditor_diff to see what needs to be synced"

# Sync to POEditor
claude "Use poeditor_sync with machine translation enabled"
```

### 2. Regular Maintenance
```bash
# Quick sync without changes
claude "Use poeditor_diff to check for new keys, then poeditor_sync if needed"

# Pull latest translations
claude "Use poeditor_sync_local to pull updated translations"
```

### 3. Cleanup and Standardization
```bash
# Analyze naming issues
claude "Use poeditor_name_suggest to find inconsistent key names"

# Apply standardization
claude "Use poeditor_apply_renames with confirmLowConfidence=true"

# Clean up POEditor
claude "Use poeditor_diff with deleteExtraneous=true to remove unused keys"
```

### 4. Hardcoded String Migration
```bash
# Find hardcoded strings (dry run first)
claude "Use poeditor_process_hardcoded_strings with dryRun=true to preview hardcoded strings"

# Request LLM translation and create POEditor keys
claude "Use poeditor_process_hardcoded_strings to automate the full workflow"

# Pull updated translations to local files
claude "Use poeditor_sync_local to pull all translations with new keys"
```

## Rate Limiting

POEditor has a rate limit of maximum 1 request per 20 seconds for uploads. This MCP server automatically handles rate limiting by:

- **Batching operations**: Groups multiple changes into single API calls
- **Automatic delays**: Waits 20+ seconds between requests
- **Exponential backoff**: Increases delay on rate limit errors
- **Progress tracking**: Shows progress during long operations

## Troubleshooting

### Common Issues

1. **API Token Invalid**
   ```
   Error: Invalid API token
   ```
   - Check your POEditor API token in `.env`
   - Verify the token has the correct permissions

2. **Project Not Found**
   ```
   Error: Project not found
   ```
   - Verify the project ID in your configuration
   - Ensure you have access to the project

3. **Rate Limit Exceeded**
   ```
   Error: Rate limit exceeded
   ```
   - The server automatically handles this, but you can increase the rate limit delay
   - Set `POEDITOR_RATE_LIMIT_DELAY=30000` for slower but safer requests

### Debug Mode

Enable debug logging:
```env
DEBUG=true
```

This provides verbose output about:
- File processing progress
- API request/response details
- Key detection statistics
- Sync operation progress

## Security

- **API tokens**: Never commit your POEditor API token to version control
- **Environment files**: Add `.env` to your `.gitignore`
- **Backup files**: Automatic backups are created with timestamps for safety
- **Dry run**: Always test with `dryRun: true` first for destructive operations

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see LICENSE file for details.