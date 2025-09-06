import * as fs from 'fs/promises';
import * as path from 'path';
import { POEditorClient } from './poeditor-client.js';

export interface LocalSyncOptions {
  projectId: string;
  direction: 'pull' | 'push';
  langs: string[];
  format: 'i18next' | 'vue-i18n-json' | 'vue-i18n-ts';
  outDir?: string;
  inDir?: string;
  bundleSplit: 'per-lang' | 'per-namespace';
  dryRun: boolean;
}

export interface LocalSyncResult {
  files: Array<{
    path: string;
    action: 'created' | 'updated' | 'skipped';
    changes: number;
  }>;
  conflicts: Array<{
    path: string;
    reason: string;
  }>;
  skipped: Array<{
    path: string;
    reason: string;
  }>;
}

export class LocalSyncManager {
  constructor(private client: POEditorClient) {}

  async syncFiles(options: LocalSyncOptions): Promise<LocalSyncResult> {
    if (options.direction === 'pull') {
      return this.pullFromPOEditor(options);
    } else {
      return this.pushToPOEditor(options);
    }
  }

  private async pullFromPOEditor(options: LocalSyncOptions): Promise<LocalSyncResult> {
    const result: LocalSyncResult = {
      files: [],
      conflicts: [],
      skipped: [],
    };

    console.error(`Pulling translations for ${options.langs.length} languages...`);

    try {
      for (const lang of options.langs) {
        console.error(`Pulling ${lang} translations...`);
        
        // Export translations from POEditor
        const exportResult = await this.client.exportTranslations(
          options.projectId,
          lang,
          'json'
        );

        // Download the exported file
        const response = await fetch(exportResult.url);
        const translations = await response.json();

        // Format according to target format
        const formattedContent = this.formatTranslations(translations, options.format, lang);

        // Determine output path
        const outputPath = this.getOutputPath(options, lang);

        if (!options.dryRun) {
          // Ensure directory exists
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          
          // Write file
          await fs.writeFile(outputPath, formattedContent, 'utf-8');
        }

        result.files.push({
          path: outputPath,
          action: 'created', // TODO: Check if file exists to determine if created/updated
          changes: Object.keys(translations).length,
        });
      }
    } catch (error) {
      result.skipped.push({
        path: 'all',
        reason: `Pull failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return result;
  }

  private async pushToPOEditor(options: LocalSyncOptions): Promise<LocalSyncResult> {
    const result: LocalSyncResult = {
      files: [],
      conflicts: [],
      skipped: [],
    };

    console.error(`Pushing translations from ${options.inDir}...`);

    try {
      for (const lang of options.langs) {
        const inputPath = this.getInputPath(options, lang);
        
        try {
          const content = await fs.readFile(inputPath, 'utf-8');
          const translations = this.parseTranslations(content, options.format);

          if (!options.dryRun) {
            // Convert to POEditor format and upload
            const translationsArray = Object.entries(translations).map(([term, content]) => ({
              term,
              content: content as string,
            }));

            await this.client.addTranslations(options.projectId, lang, translationsArray);
          }

          result.files.push({
            path: inputPath,
            action: 'updated',
            changes: Object.keys(translations).length,
          });
        } catch (error) {
          result.skipped.push({
            path: inputPath,
            reason: `File read failed: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
    } catch (error) {
      result.skipped.push({
        path: options.inDir || 'unknown',
        reason: `Push failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return result;
  }

  private formatTranslations(translations: any, format: string, lang: string): string {
    switch (format) {
      case 'i18next':
        return JSON.stringify(translations, null, 2);
      
      case 'vue-i18n-json':
        return JSON.stringify(translations, null, 2);
      
      case 'vue-i18n-ts':
        return `export default ${JSON.stringify(translations, null, 2)} as const;`;
      
      default:
        return JSON.stringify(translations, null, 2);
    }
  }

  private parseTranslations(content: string, format: string): { [key: string]: string } {
    switch (format) {
      case 'i18next':
      case 'vue-i18n-json':
        return JSON.parse(content);
      
      case 'vue-i18n-ts':
        // Simple TypeScript parsing - in production, use proper AST parsing
        const match = content.match(/export\s+default\s+({[\s\S]*?})\s*as\s+const;?/);
        if (match) {
          return JSON.parse(match[1]);
        }
        throw new Error('Invalid TypeScript translation file format');
      
      default:
        return JSON.parse(content);
    }
  }

  private getOutputPath(options: LocalSyncOptions, lang: string): string {
    const baseDir = options.outDir || './locales';
    const filename = options.format === 'vue-i18n-ts' ? `${lang}.ts` : `${lang}.json`;
    return path.join(baseDir, filename);
  }

  private getInputPath(options: LocalSyncOptions, lang: string): string {
    const baseDir = options.inDir || './locales';
    const filename = options.format === 'vue-i18n-ts' ? `${lang}.ts` : `${lang}.json`;
    return path.join(baseDir, filename);
  }
}