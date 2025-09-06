#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { POEditorDetector } from '@/services/key-detector.js';
import { POEditorClient } from '@/services/poeditor-client.js';
import { ConfigManager } from '@/utils/config.js';
import { KeyNameSuggester } from '@/services/key-suggester.js';
import { SyncManager } from '@/services/sync-manager.js';
import { LocalSyncManager } from '@/services/local-sync.js';
import { CodemodManager } from '@/services/codemod.js';

class POEditorMCPServer {
  private server: Server;
  private detector: POEditorDetector;
  private client: POEditorClient;
  private config: ConfigManager;
  private suggester: KeyNameSuggester;
  private syncManager: SyncManager;
  private localSync: LocalSyncManager;
  private codemod: CodemodManager;

  constructor() {
    this.server = new Server(
      {
        name: 'poeditor-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.config = new ConfigManager();
    this.detector = new POEditorDetector();
    this.client = new POEditorClient();
    this.suggester = new KeyNameSuggester();
    this.syncManager = new SyncManager(this.client);
    this.localSync = new LocalSyncManager(this.client);
    this.codemod = new CodemodManager();

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'poeditor_detect_keys',
          description: 'Parse code to extract i18n keys with metadata from Vue 3, Nuxt 3, and React Native projects',
          inputSchema: {
            type: 'object',
            properties: {
              globs: {
                type: 'array',
                items: { type: 'string' },
                description: 'File glob patterns to scan (e.g., ["src/**/*.vue", "src/**/*.tsx"])',
              },
              frameworks: {
                type: 'array',
                items: { type: 'string', enum: ['vue3', 'nuxt3', 'react-native', 'i18next'] },
                description: 'Target i18n frameworks to detect',
              },
              sourceLang: {
                type: 'string',
                description: 'Source language code (e.g., "en")',
                default: 'en',
              },
              resourceFormats: {
                type: 'array',
                items: { type: 'string' },
                description: 'Resource file formats to include',
                default: ['json', 'typescript'],
              },
              ignore: {
                type: 'array',
                items: { type: 'string' },
                description: 'Patterns to ignore',
                default: ['node_modules/**', 'dist/**'],
              },
            },
            required: ['globs', 'frameworks'],
          },
        },
        {
          name: 'poeditor_name_suggest',
          description: 'Generate consistent, hierarchical key naming suggestions',
          inputSchema: {
            type: 'object',
            properties: {
              keys: {
                type: 'array',
                description: 'Keys from detect_keys to rename',
              },
              style: {
                type: 'string',
                enum: ['dot', 'kebab'],
                description: 'Key naming style',
                default: 'dot',
              },
              rules: {
                type: 'object',
                properties: {
                  prefix: { type: 'string' },
                  maxDepth: { type: 'number', default: 4 },
                  stopWords: { type: 'array', items: { type: 'string' } },
                },
                description: 'Naming rules configuration',
              },
              allowlist: {
                type: 'array',
                items: { type: 'string' },
                description: 'Keys to preserve as-is',
              },
              denylist: {
                type: 'array',
                items: { type: 'string' },
                description: 'Key patterns to avoid',
              },
            },
            required: ['keys'],
          },
        },
        {
          name: 'poeditor_diff',
          description: 'Compare local keys with POEditor terms to plan changes',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'POEditor project ID or slug',
              },
              sourceLang: {
                type: 'string',
                description: 'Source language code',
                default: 'en',
              },
              includeLangs: {
                type: 'array',
                items: { type: 'string' },
                description: 'Languages to include in diff',
              },
              keys: {
                type: 'array',
                description: 'Keys to compare (optional, will detect if not provided)',
              },
              deleteExtraneous: {
                type: 'boolean',
                description: 'Include deletion of POEditor terms not found locally',
                default: false,
              },
            },
            required: ['projectId'],
          },
        },
        {
          name: 'poeditor_sync',
          description: 'Execute planned changes in POEditor with bulk operations',
          inputSchema: {
            type: 'object',
            properties: {
              plan: {
                type: 'object',
                description: 'Sync plan from poeditor_diff',
              },
              batchSize: {
                type: 'number',
                description: 'Batch size for bulk operations',
                default: 100,
              },
              direction: {
                type: 'string',
                enum: ['up'],
                description: 'Sync direction (up = to POEditor)',
                default: 'up',
              },
              machineTranslate: {
                oneOf: [
                  { type: 'boolean' },
                  { type: 'array', items: { type: 'string' } },
                ],
                description: 'Enable machine translation for missing entries',
                default: false,
              },
              dryRun: {
                type: 'boolean',
                description: 'Preview changes without executing',
                default: false,
              },
              rateLimit: {
                type: 'number',
                description: 'Minimum seconds between requests',
                default: 20,
              },
            },
            required: ['plan'],
          },
        },
        {
          name: 'poeditor_sync_local',
          description: 'Sync translations between POEditor and local resource files',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'POEditor project ID or slug',
              },
              direction: {
                type: 'string',
                enum: ['pull', 'push'],
                description: 'Sync direction',
              },
              langs: {
                type: 'array',
                items: { type: 'string' },
                description: 'Languages to sync',
              },
              format: {
                type: 'string',
                enum: ['i18next', 'vue-i18n-json', 'vue-i18n-ts'],
                description: 'Output format',
                default: 'i18next',
              },
              outDir: {
                type: 'string',
                description: 'Output directory for pull',
              },
              inDir: {
                type: 'string',
                description: 'Input directory for push',
              },
              bundleSplit: {
                type: 'string',
                enum: ['per-lang', 'per-namespace'],
                description: 'File organization strategy',
                default: 'per-lang',
              },
              dryRun: {
                type: 'boolean',
                description: 'Preview changes without executing',
                default: false,
              },
            },
            required: ['projectId', 'direction', 'langs'],
          },
        },
        {
          name: 'poeditor_apply_renames',
          description: 'Apply key rename map safely across code and resources',
          inputSchema: {
            type: 'object',
            properties: {
              renames: {
                type: 'array',
                description: 'Rename map from name_suggest',
              },
              globs: {
                type: 'array',
                items: { type: 'string' },
                description: 'File patterns to process',
              },
              resourceDirs: {
                type: 'array',
                items: { type: 'string' },
                description: 'Resource directories to update',
              },
              confirmLowConfidence: {
                type: 'boolean',
                description: 'Apply low-confidence renames',
                default: false,
              },
              backup: {
                type: 'boolean',
                description: 'Create backup files',
                default: true,
              },
            },
            required: ['renames', 'globs'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'poeditor_detect_keys':
            return await this.handleDetectKeys(args);
          case 'poeditor_name_suggest':
            return await this.handleNameSuggest(args);
          case 'poeditor_diff':
            return await this.handleDiff(args);
          case 'poeditor_sync':
            return await this.handleSync(args);
          case 'poeditor_sync_local':
            return await this.handleSyncLocal(args);
          case 'poeditor_apply_renames':
            return await this.handleApplyRenames(args);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  private async handleDetectKeys(args: any) {
    const result = await this.detector.detectKeys({
      globs: args.globs,
      frameworks: args.frameworks,
      sourceLang: args.sourceLang || 'en',
      resourceFormats: args.resourceFormats || ['json', 'typescript'],
      ignore: args.ignore || ['node_modules/**', 'dist/**'],
    });

    return {
      content: [
        {
          type: 'text',
          text: `Found ${result.keys.length} i18n keys across ${result.stats.filesProcessed} files:\n\n` +
                `• Total keys: ${result.stats.keysFound}\n` +
                `• Dynamic keys: ${result.stats.dynamicKeys}\n` +
                `• Frameworks: ${[...new Set(result.keys.map(k => k.framework))].join(', ')}\n\n` +
                `${result.errors.length > 0 ? `Errors: ${result.errors.length}\n` : ''}` +
                JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async handleNameSuggest(args: any) {
    const suggestions = await this.suggester.suggestNames({
      keys: args.keys,
      style: args.style || 'dot',
      rules: args.rules || {},
      allowlist: args.allowlist || [],
      denylist: args.denylist || [],
    });

    return {
      content: [
        {
          type: 'text',
          text: `Generated ${suggestions.renames.length} rename suggestions:\n\n` +
                `• High confidence: ${suggestions.renames.filter(r => r.confidence >= 0.8).length}\n` +
                `• Medium confidence: ${suggestions.renames.filter(r => r.confidence >= 0.5 && r.confidence < 0.8).length}\n` +
                `• Low confidence: ${suggestions.renames.filter(r => r.confidence < 0.5).length}\n\n` +
                `Guidelines:\n${suggestions.guidelines}\n\n` +
                JSON.stringify(suggestions, null, 2),
        },
      ],
    };
  }

  private async handleDiff(args: any) {
    const plan = await this.syncManager.createSyncPlan({
      projectId: args.projectId,
      sourceLang: args.sourceLang || 'en',
      includeLangs: args.includeLangs || [],
      keys: args.keys,
      deleteExtraneous: args.deleteExtraneous || false,
    });

    return {
      content: [
        {
          type: 'text',
          text: `Sync Plan Summary:\n\n` +
                `• Terms to add: ${plan.stats.adds}\n` +
                `• Terms to update: ${plan.stats.updates}\n` +
                `• Terms to delete: ${plan.stats.deletes}\n` +
                `• Missing translations: ${plan.stats.missing}\n\n` +
                JSON.stringify(plan, null, 2),
        },
      ],
    };
  }

  private async handleSync(args: any) {
    const result = await this.syncManager.executeSync({
      plan: args.plan,
      batchSize: args.batchSize || 100,
      direction: args.direction || 'up',
      machineTranslate: args.machineTranslate || false,
      dryRun: args.dryRun || false,
      rateLimit: args.rateLimit || 20,
    });

    return {
      content: [
        {
          type: 'text',
          text: `Sync Results:\n\n` +
                `• Created: ${result.created}\n` +
                `• Updated: ${result.updated}\n` +
                `• Deleted: ${result.deleted}\n` +
                `• Machine translations triggered: ${result.mtTriggered.length}\n` +
                `• Rate limit waits: ${result.rateLimitWaits}\n` +
                `• Errors: ${result.errors.length}\n\n` +
                `Audit Log ID: ${result.auditLogId}\n\n` +
                (result.errors.length > 0 ? `Errors:\n${result.errors.map(e => `- ${e.operation}: ${e.error}`).join('\n')}\n\n` : '') +
                JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async handleSyncLocal(args: any) {
    const result = await this.localSync.syncFiles({
      projectId: args.projectId,
      direction: args.direction,
      langs: args.langs,
      format: args.format || 'i18next',
      outDir: args.outDir,
      inDir: args.inDir,
      bundleSplit: args.bundleSplit || 'per-lang',
      dryRun: args.dryRun || false,
    });

    return {
      content: [
        {
          type: 'text',
          text: `Local Sync Results:\n\n` +
                `• Files processed: ${result.files.length}\n` +
                `• Conflicts: ${result.conflicts.length}\n` +
                `• Skipped: ${result.skipped.length}\n\n` +
                JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async handleApplyRenames(args: any) {
    const result = await this.codemod.applyRenames({
      renames: args.renames,
      globs: args.globs,
      resourceDirs: args.resourceDirs || [],
      confirmLowConfidence: args.confirmLowConfidence || false,
      backup: args.backup !== undefined ? args.backup : true,
    });

    return {
      content: [
        {
          type: 'text',
          text: `Codemod Results:\n\n` +
                `• Files changed: ${result.changes.length}\n` +
                `• Keys renamed: ${result.changes.reduce((sum, c) => sum + c.changes?.length || 0, 0)}\n` +
                `• Conflicts: ${result.conflicts.length}\n` +
                `• Skipped: ${result.skipped.length}\n\n` +
                JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('POEditor MCP server running on stdio');
  }
}

const server = new POEditorMCPServer();
server.run().catch(console.error);