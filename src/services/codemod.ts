import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'fast-glob';
import { KeyRenameSuggestion } from '@/types/index.js';

export interface CodemodOptions {
  renames: KeyRenameSuggestion[];
  globs: string[];
  resourceDirs: string[];
  confirmLowConfidence: boolean;
  backup: boolean;
}

export interface CodemodResult {
  changes: Array<{
    file: string;
    changes?: Array<{
      line: number;
      from: string;
      to: string;
    }>;
  }>;
  conflicts: Array<{
    file: string;
    reason: string;
  }>;
  skipped: Array<{
    file: string;
    reason: string;
  }>;
  summary: {
    filesChanged: number;
    keysRenamed: number;
    backupsCreated: number;
  };
}

export class CodemodManager {
  private readonly CONFIDENCE_THRESHOLD = 0.5;

  async applyRenames(options: CodemodOptions): Promise<CodemodResult> {
    const { renames, globs, resourceDirs, confirmLowConfidence, backup } = options;
    
    const result: CodemodResult = {
      changes: [],
      conflicts: [],
      skipped: [],
      summary: {
        filesChanged: 0,
        keysRenamed: 0,
        backupsCreated: 0,
      },
    };

    // Filter renames by confidence
    const filteredRenames = renames.filter(rename => 
      rename.confidence >= this.CONFIDENCE_THRESHOLD || 
      (confirmLowConfidence && rename.confidence >= 0.3)
    );

    if (filteredRenames.length === 0) {
      result.skipped.push({
        file: 'all',
        reason: 'No renames meet confidence threshold',
      });
      return result;
    }

    console.error(`Applying ${filteredRenames.length} renames across codebase...`);

    try {
      // Find all files to process
      const files = await glob(globs, { absolute: true });
      console.error(`Found ${files.length} files to process`);

      // Process code files
      for (const filePath of files) {
        try {
          const fileResult = await this.processCodeFile(filePath, filteredRenames, backup);
          if (fileResult.changes && fileResult.changes.length > 0) {
            result.changes.push(fileResult);
            result.summary.filesChanged++;
            result.summary.keysRenamed += fileResult.changes.length;
          }
        } catch (error) {
          result.skipped.push({
            file: filePath,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Process resource files
      for (const resourceDir of resourceDirs) {
        try {
          const resourceResult = await this.processResourceDirectory(resourceDir, filteredRenames, backup);
          result.changes.push(...resourceResult.changes);
          result.conflicts.push(...resourceResult.conflicts);
          result.skipped.push(...resourceResult.skipped);
          result.summary.filesChanged += resourceResult.changes.length;
          result.summary.keysRenamed += resourceResult.changes.reduce((sum, c) => sum + (c.changes?.length || 0), 0);
        } catch (error) {
          result.skipped.push({
            file: resourceDir,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (backup) {
        result.summary.backupsCreated = result.changes.length;
      }

    } catch (error) {
      result.skipped.push({
        file: 'all',
        reason: `Codemod failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    console.error(`Codemod completed: ${result.summary.filesChanged} files changed, ${result.summary.keysRenamed} keys renamed`);

    return result;
  }

  private async processCodeFile(
    filePath: string,
    renames: KeyRenameSuggestion[],
    backup: boolean
  ): Promise<{ file: string; changes?: Array<{ line: number; from: string; to: string }> }> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    let modifiedContent = content;
    let hasChanges = false;
    const changes: Array<{ line: number; from: string; to: string }> = [];

    // Create backup if requested
    if (backup) {
      const backupPath = `${filePath}.backup.${Date.now()}`;
      await fs.writeFile(backupPath, content, 'utf-8');
    }

    // Apply renames
    for (const rename of renames) {
      const patterns = this.getPatterns(filePath, rename.from);
      
      for (const pattern of patterns) {
        const regex = new RegExp(pattern.search, 'g');
        let match;
        
        while ((match = regex.exec(content)) !== null) {
          const replacement = pattern.replace.replace('$KEY$', rename.to);
          modifiedContent = modifiedContent.replace(match[0], replacement);
          hasChanges = true;
          
          // Find line number
          const beforeMatch = content.slice(0, match.index);
          const lineNumber = beforeMatch.split('\n').length;
          
          changes.push({
            line: lineNumber,
            from: match[0],
            to: replacement,
          });
        }
      }
    }

    // Write changes
    if (hasChanges) {
      await fs.writeFile(filePath, modifiedContent, 'utf-8');
    }

    return {
      file: filePath,
      changes: changes.length > 0 ? changes : undefined,
    };
  }

  private async processResourceDirectory(
    resourceDir: string,
    renames: KeyRenameSuggestion[],
    backup: boolean
  ): Promise<{
    changes: Array<{ file: string; changes?: any }>;
    conflicts: Array<{ file: string; reason: string }>;
    skipped: Array<{ file: string; reason: string }>;
  }> {
    const result = {
      changes: [] as Array<{ file: string; changes?: any }>,
      conflicts: [] as Array<{ file: string; reason: string }>,
      skipped: [] as Array<{ file: string; reason: string }>,
    };

    try {
      const resourceFiles = await glob([
        path.join(resourceDir, '**/*.json'),
        path.join(resourceDir, '**/*.ts'),
      ]);

      for (const filePath of resourceFiles) {
        try {
          const fileResult = await this.processResourceFile(filePath, renames, backup);
          if (fileResult.changes > 0) {
            result.changes.push({
              file: filePath,
              changes: fileResult.changes,
            });
          }
        } catch (error) {
          result.skipped.push({
            file: filePath,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      result.skipped.push({
        file: resourceDir,
        reason: `Directory scan failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return result;
  }

  private async processResourceFile(
    filePath: string,
    renames: KeyRenameSuggestion[],
    backup: boolean
  ): Promise<{ changes: number }> {
    const ext = path.extname(filePath);
    const content = await fs.readFile(filePath, 'utf-8');
    
    let data: any;
    let hasChanges = false;
    let changeCount = 0;

    // Parse file
    if (ext === '.json') {
      data = JSON.parse(content);
    } else if (ext === '.ts') {
      // Simple TypeScript parsing - in production, use proper AST parsing
      const match = content.match(/export\s+default\s+({[\s\S]*?})\s*as\s+const;?/);
      if (match) {
        data = JSON.parse(match[1]);
      } else {
        throw new Error('Invalid TypeScript resource file format');
      }
    } else {
      throw new Error(`Unsupported resource file format: ${ext}`);
    }

    // Create backup if requested
    if (backup) {
      const backupPath = `${filePath}.backup.${Date.now()}`;
      await fs.writeFile(backupPath, content, 'utf-8');
    }

    // Apply renames to flattened keys
    const flatData = this.flattenObject(data);
    const renamedData: { [key: string]: any } = {};

    for (const [key, value] of Object.entries(flatData)) {
      const rename = renames.find(r => r.from === key);
      if (rename) {
        renamedData[rename.to] = value;
        hasChanges = true;
        changeCount++;
      } else {
        renamedData[key] = value;
      }
    }

    // Rebuild nested structure and save
    if (hasChanges) {
      const nestedData = this.unflattenObject(renamedData);
      
      let newContent: string;
      if (ext === '.json') {
        newContent = JSON.stringify(nestedData, null, 2);
      } else {
        newContent = `export default ${JSON.stringify(nestedData, null, 2)} as const;`;
      }

      await fs.writeFile(filePath, newContent, 'utf-8');
    }

    return { changes: changeCount };
  }

  private getPatterns(filePath: string, key: string): Array<{ search: string; replace: string }> {
    const ext = path.extname(filePath);
    const patterns: Array<{ search: string; replace: string }> = [];

    // Vue patterns
    if (ext === '.vue') {
      patterns.push(
        { search: `\\$t\\(['"\`]${this.escapeRegex(key)}['"\`]\\)`, replace: `$t('$KEY$')` },
        { search: `\\bt\\(['"\`]${this.escapeRegex(key)}['"\`]\\)`, replace: `t('$KEY$')` }
      );
    }

    // TypeScript/JavaScript patterns
    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      patterns.push(
        { search: `\\bt\\(['"\`]${this.escapeRegex(key)}['"\`]\\)`, replace: `t('$KEY$')` },
        { search: `useTranslation\\(\\)\\.t\\(['"\`]${this.escapeRegex(key)}['"\`]\\)`, replace: `useTranslation().t('$KEY$')` },
        { search: `i18n\\.t\\(['"\`]${this.escapeRegex(key)}['"\`]\\)`, replace: `i18n.t('$KEY$')` },
        { search: `i18nKey=['"\`]${this.escapeRegex(key)}['"\`]`, replace: `i18nKey='$KEY$'` }
      );
    }

    return patterns;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private flattenObject(obj: any, prefix = ''): { [key: string]: any } {
    const flattened: { [key: string]: any } = {};
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          Object.assign(flattened, this.flattenObject(obj[key], newKey));
        } else {
          flattened[newKey] = obj[key];
        }
      }
    }
    
    return flattened;
  }

  private unflattenObject(flat: { [key: string]: any }): any {
    const result: any = {};
    
    for (const key in flat) {
      if (flat.hasOwnProperty(key)) {
        const keys = key.split('.');
        let current = result;
        
        for (let i = 0; i < keys.length - 1; i++) {
          const k = keys[i];
          if (!current[k]) {
            current[k] = {};
          }
          current = current[k];
        }
        
        current[keys[keys.length - 1]] = flat[key];
      }
    }
    
    return result;
  }
}