# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the POEditor MCP server.

## Project Overview

The **POEditor Integration Studio** is a comprehensive MCP (Model Context Protocol) server that eliminates the pain of manual POEditor translation management. It automates key detection, creation, and synchronization across Vue 3, Nuxt 3, and React Native applications.

## Essential Commands

### Development Setup
- `pnpm install` - Install all dependencies
- `pnpm build` - Build the TypeScript project
- `pnpm dev` - Start development server with auto-reload
- `pnpm start` - Run the built server (exits immediately - normal MCP stdio behavior)
- `./scripts/start-local.sh` - Interactive development setup script

### Testing
- `pnpm test` - Run Jest unit tests
- `pnpm test:watch` - Run tests in watch mode
- `pnpm test:coverage` - Generate test coverage reports
- `pnpm test:integration` - Run integration tests

### Code Quality
- `pnpm lint` - Run ESLint
- `pnpm lint:fix` - Fix linting issues automatically
- `pnpm prettier` - Format code with Prettier

## Architecture Overview

### Core Components
- **`src/index.ts`** - Main MCP server with tool handlers and stdio transport
- **`src/services/key-detector.ts`** - AST-based i18n key detection and hardcoded string detection
- **`src/services/poeditor-client.ts`** - POEditor API client with rate limiting
- **`src/services/key-suggester.ts`** - Intelligent key naming and improvement suggestions  
- **`src/services/sync-manager.ts`** - Sync plan creation and execution
- **`src/services/local-sync.ts`** - Local file synchronization (pull/push)
- **`src/services/codemod.ts`** - Safe key renaming and hardcoded string replacement
- **`src/services/translation-service.ts`** - LLM-powered translation service integration
- **`src/utils/config.ts`** - Configuration and cache management

### Key Features

#### Multi-Framework Support
- **Vue 3**: `$t('key')`, `t('key')`, `useI18n().t('key')`, SFC `<i18n>` blocks
- **Nuxt 3**: `$t('key')`, `t('key')`, server-side rendering patterns
- **React Native**: `useTranslation().t('key')`, `<Trans i18nKey="key">`, i18next resources
- **Generic i18next**: `i18n.t('key')`, resource file parsing

#### Intelligent Detection
- **AST parsing**: Regex-based pattern matching with context extraction
- **Dynamic key detection**: Identifies template literals and computed keys
- **Resource file scanning**: JSON, TypeScript exports, ICU formats
- **Usage tracking**: File locations, line numbers, surrounding context

#### Smart Naming
- **Hierarchical structure**: `feature.component.element.action` patterns
- **Consistency checking**: Detects mixed naming conventions
- **Abbreviation expansion**: `btn` → `button`, `msg` → `message`
- **Namespace suggestions**: Based on file structure and usage patterns

#### Hardcoded String Automation
- **Pattern-based detection**: Vue templates, JSX content, string literals, placeholders, titles
- **Context awareness**: Different handling for alerts, form fields, UI elements
- **Language detection**: English/Italian recognition using word frequency analysis
- **Confidence scoring**: Filters out technical terms, URLs, non-translatable content
- **LLM integration**: Requests translations with structured prompts and context
- **Framework-specific replacement**: Generates appropriate i18n calls for each framework

## MCP Tools Reference

### `poeditor_detect_keys`
**Purpose**: Parse code to extract i18n keys with metadata

**Required Parameters**:
- `globs`: Array of file patterns (e.g., `["src/**/*.vue", "src/**/*.tsx"]`)
- `frameworks`: Array of frameworks (e.g., `["vue3", "react-native"]`)

**Optional Parameters**:
- `sourceLang`: Source language (default: "en")
- `resourceFormats`: Formats to include (default: `["json", "typescript"]`)
- `ignore`: Patterns to exclude (default: `["node_modules/**", "dist/**"]`)

### `poeditor_name_suggest`
**Purpose**: Generate consistent key naming suggestions

**Required Parameters**:
- `keys`: Array of detected keys from `poeditor_detect_keys`

**Optional Parameters**:
- `style`: "dot" or "kebab" (default: "dot")
- `rules`: Object with `prefix`, `maxDepth`, `stopWords`
- `allowlist`: Keys to preserve unchanged
- `denylist`: Patterns to avoid

### `poeditor_diff`
**Purpose**: Compare local keys with POEditor to plan changes

**Required Parameters**:
- `projectId`: POEditor project ID or slug

**Optional Parameters**:
- `sourceLang`: Source language (default: "en")
- `includeLangs`: Languages to include in comparison
- `keys`: Keys to compare (auto-detects if not provided)
- `deleteExtraneous`: Include POEditor term deletion (default: false)

### `poeditor_sync`
**Purpose**: Execute sync plan changes in POEditor

**Required Parameters**:
- `plan`: Sync plan object from `poeditor_diff`

**Optional Parameters**:
- `batchSize`: Batch size for API calls (default: 100)
- `direction`: "up" (to POEditor)
- `machineTranslate`: Boolean or array of language codes
- `dryRun`: Preview without executing (default: false)
- `rateLimit`: Seconds between requests (default: 20)

### `poeditor_sync_local`
**Purpose**: Sync translations between POEditor and local files

**Required Parameters**:
- `projectId`: POEditor project ID
- `direction`: "pull" or "push"
- `langs`: Array of language codes

**Optional Parameters**:
- `format`: "i18next", "vue-i18n-json", or "vue-i18n-ts"
- `outDir`: Output directory for pull
- `inDir`: Input directory for push
- `bundleSplit`: "per-lang" or "per-namespace"
- `dryRun`: Preview without executing

### `poeditor_apply_renames`
**Purpose**: Apply key renames across code and resources

**Required Parameters**:
- `renames`: Rename suggestions from `poeditor_name_suggest`
- `globs`: File patterns to process

**Optional Parameters**:
- `resourceDirs`: Resource directories to update
- `confirmLowConfidence`: Apply low-confidence renames (default: false)
- `backup`: Create backup files (default: true)

### `poeditor_process_hardcoded_strings`
**Purpose**: Comprehensive hardcoded string detection, translation, and replacement workflow

**Required Parameters**:
- `globs`: Array of file patterns to scan for hardcoded strings
- `frameworks`: Array of target frameworks
- `projectId`: POEditor project ID or slug

**Optional Parameters**:
- `targetLanguages`: Languages for translation (default: `["en", "it", "de", "es", "fr"]`)
- `ignore`: Patterns to exclude (default: `["node_modules/**", "dist/**"]`)
- `dryRun`: Preview without executing (default: false)
- `minConfidence`: Confidence threshold for processing (default: 0.7)
- `batchSize`: Strings per batch for processing (default: 10)
- `replaceInCode`: Replace strings with i18n calls (default: true)

## Configuration

### Environment Variables (.env)
```env
POEDITOR_API_TOKEN=your_api_token_here
POEDITOR_PROJECT_ID=your_project_id
POEDITOR_SOURCE_LANG=en
POEDITOR_TARGET_LANGS=de,es,fr,it
POEDITOR_RATE_LIMIT_DELAY=20000
POEDITOR_BATCH_SIZE=100
```

### Project Configuration (.smartness-i18n.json)
The configuration file defines project-specific settings:
- API credentials and project details
- Framework and file path configurations
- Key naming rules and style preferences
- Resource file formats and output directories
- Integration settings (Slack, GitHub)

Use `.smartness-i18n.example.json` as a template.

## Development Workflow

### Initial Setup
1. **Copy configuration**: `cp .env.example .env` and add your POEditor API token
2. **Install dependencies**: `pnpm install`
3. **Build project**: `pnpm build`
4. **Test setup**: `pnpm test:integration`

### Adding the MCP Server to Claude Code

#### Option 1: Local Development
```bash
claude mcp add poeditor -s user -- node /path/to/poeditor_mcp/dist/index.js
```

#### Option 2: Docker Development (Recommended)
```bash
# Start container first
./scripts/start-local.sh  # Choose option 1

# Add to Claude Code
claude mcp add poeditor -s user -- docker exec -i poeditor-mcp-dev node /app/dist/index.js
```

### Common Development Tasks

#### Test Key Detection
```bash
claude "Use poeditor_detect_keys with globs ['src/**/*.vue'] and frameworks ['vue3'] to scan for Vue.js translation keys"
```

#### Test POEditor Integration
```bash
# Check diff first
claude "Use poeditor_diff with project ID 12345 to see what needs syncing"

# Execute with dry run
claude "Use poeditor_sync with the plan from diff, enable dryRun to preview changes"
```

#### Test Local File Sync
```bash
claude "Use poeditor_sync_local to pull translations in i18next format to src/locales"
```

#### Test Hardcoded String Processing
```bash
# Preview hardcoded strings (dry run)
claude "Use poeditor_process_hardcoded_strings with globs ['src/**/*.vue'], frameworks ['vue3'], projectId 12345, and dryRun true"

# Process with LLM translation request
claude "Use poeditor_process_hardcoded_strings with the same parameters but dryRun false to request translations"
```

### Debugging and Troubleshooting

#### Enable Debug Logging
Set `DEBUG=true` in `.env` for verbose output including:
- File processing progress and statistics
- API request/response details  
- Key detection results and conflicts
- Sync operation progress and timing

#### Common Issues

1. **API Authentication**
   - Verify `POEDITOR_API_TOKEN` is set correctly
   - Check project ID matches your POEditor project

2. **Rate Limiting**
   - Increase `POEDITOR_RATE_LIMIT_DELAY` if requests fail
   - Reduce `POEDITOR_BATCH_SIZE` for slower but safer operation

3. **Key Detection Issues**
   - Check file glob patterns match your project structure
   - Verify framework selection matches your i18n setup
   - Review exclude patterns to avoid scanning unwanted files

#### Testing Individual Components
```bash
# Test key detector only
pnpm test -- --testNamePattern="key-detector"

# Test POEditor client
pnpm test -- --testNamePattern="poeditor-client"

# Run integration test
pnpm test:integration
```

## Rate Limiting and POEditor API

POEditor enforces a rate limit of **1 request per 20 seconds** for uploads. The MCP server handles this automatically:

- **Batch operations**: Groups multiple changes into single API calls
- **Automatic delays**: Waits 20+ seconds between requests  
- **Exponential backoff**: Increases delay on rate limit errors
- **Progress feedback**: Shows completion status during long operations

For large operations, expect significant time investment (e.g., 100 key updates = ~35 minutes minimum).

## Security Considerations

- **Never commit** `.env` or `.smartness-i18n.json` with real API tokens
- **Backup enabled by default**: All code modifications create timestamped backups
- **Dry run first**: Always test destructive operations with `dryRun: true`
- **Confidence thresholds**: Low-confidence renames require explicit confirmation

## Integration with Smartness Ecosystem

### Smartness-Specific Configurations

The config manager includes templates for common Smartness projects:

#### SmartChat Configuration
```typescript
ConfigManager.createSmartchatConfig()
// - Vue 3 framework
// - src/**/*.vue patterns
// - 'chat' prefix for keys
// - JSON format output
```

#### Smartness UI Configuration  
```typescript
ConfigManager.createSmartnessUIConfig()
// - Vue 3 with Storybook
// - 'ui' prefix for keys
// - TypeScript format output
// - Per-namespace bundling
```

#### React Native Configuration
```typescript
ConfigManager.createReactNativeConfig()  
// - React Native patterns
// - 'mobile' prefix for keys
// - JSON format output
// - Per-language bundling
```

### Multi-Repository Support

Configure multiple repositories in `.smartness-i18n.json`:

```json
{
  "repositories": [
    {
      "name": "smartchat-webapp",
      "path": "../smartchat-webapp", 
      "framework": "vue3"
    },
    {
      "name": "sp-product-frontend",
      "path": "../sp-product-frontend",
      "framework": "nuxt3" 
    }
  ]
}
```

This enables cross-repository key detection and synchronization workflows.

## Best Practices

### Key Naming Conventions
- **Use dot notation**: `auth.login.form.submit`
- **Be hierarchical**: `feature.component.element.action`
- **Avoid abbreviations**: Use `button` not `btn`, `message` not `msg`
- **Be consistent**: Follow the same pattern across all features
- **Group related keys**: All authentication keys under `auth.*`

### Development Workflow
1. **Detect keys regularly**: Run detection after adding new translatable content
2. **Review suggestions**: Always review key naming suggestions before applying
3. **Use dry runs**: Test sync and rename operations before executing
4. **Maintain backups**: Keep the default backup behavior enabled
5. **Monitor rate limits**: Be patient with large sync operations

### POEditor Project Organization
- **Use consistent project structure** in POEditor matching your key hierarchy
- **Enable context and comments** to help translators understand usage
- **Tag keys appropriately** (component, page, error, etc.)
- **Use machine translation carefully** - review generated translations
- **Keep projects focused** - don't mix unrelated applications in one project