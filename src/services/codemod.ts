import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'fast-glob';
import { KeyRenameSuggestion } from '@/types/index.js';
import { HardcodedString } from './key-detector.js';

export interface CodemodOptions {
  renames: KeyRenameSuggestion[];
  globs: string[];
  resourceDirs: string[];
  confirmLowConfidence: boolean;
  backup: boolean;
}

export interface StringReplacementOptions {
  hardcodedStrings: HardcodedString[];
  translationResults: Array<{
    originalText: string;
    detectedLanguage: string;
    suggestedKey: string;
    translations: Record<string, string>;
  }>;
  frameworks: string[];
  globs: string[];
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

  async replaceHardcodedStrings(options: StringReplacementOptions): Promise<CodemodResult> {
    const { hardcodedStrings, translationResults, frameworks, globs, backup } = options;
    
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

    // Create mapping from original text to translation result
    const translationMap = new Map<string, typeof translationResults[0]>();
    for (const translation of translationResults) {
      translationMap.set(translation.originalText, translation);
    }

    console.error(`Processing ${hardcodedStrings.length} hardcoded strings for replacement...`);

    // Group strings by file for efficient processing
    const fileMap = new Map<string, HardcodedString[]>();
    for (const str of hardcodedStrings) {
      for (const fileUsage of str.files) {
        if (!fileMap.has(fileUsage.path)) {
          fileMap.set(fileUsage.path, []);
        }
        fileMap.get(fileUsage.path)!.push(str);
      }
    }

    // Process each file
    for (const [filePath, strings] of fileMap) {
      try {
        const fileResult = await this.processFileForStringReplacement(
          filePath,
          strings,
          translationMap,
          frameworks,
          backup
        );

        if (fileResult.changes.length > 0) {
          result.changes.push(fileResult);
          result.summary.filesChanged++;
          result.summary.keysRenamed += fileResult.changes.length;
        }
      } catch (error) {
        result.conflicts.push({
          file: filePath,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.error(`String replacement complete: ${result.summary.filesChanged} files changed, ${result.summary.keysRenamed} strings replaced`);

    return result;
  }

  private async processFileForStringReplacement(
    filePath: string,
    strings: HardcodedString[],
    translationMap: Map<string, any>,
    frameworks: string[],
    backup: boolean
  ): Promise<{ file: string; changes: Array<{ line: number; from: string; to: string }> }> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const changes: Array<{ line: number; from: string; to: string }> = [];
    
    let modifiedContent = content;
    let hasChanges = false;

    // Create backup if requested
    if (backup) {
      const backupPath = `${filePath}.backup.${Date.now()}`;
      await fs.writeFile(backupPath, content, 'utf-8');
    }

    // Process each hardcoded string
    for (const hardcodedString of strings) {
      const translation = translationMap.get(hardcodedString.text);
      if (!translation) continue;

      // Generate i18n replacement based on file type and framework
      const replacement = this.generateI18nReplacement(filePath, hardcodedString, translation, frameworks);
      
      if (!replacement) continue;

      // Find and replace the hardcoded string
      const escaped = this.escapeRegex(hardcodedString.text);
      const patterns = this.getHardcodedStringPatterns(filePath, escaped);

      for (const pattern of patterns) {
        const regex = new RegExp(pattern, 'g');
        const testRegex = new RegExp(pattern, 'g');
        if (testRegex.test(modifiedContent)) {
          const beforeReplace = modifiedContent;
          modifiedContent = modifiedContent.replace(regex, replacement);
          
          if (modifiedContent !== beforeReplace) {
            // Find the line number for reporting
            const lineNumber = hardcodedString.files.find(f => f.path === filePath)?.line || 0;
            
            changes.push({
              line: lineNumber,
              from: hardcodedString.text,
              to: replacement,
            });
            
            hasChanges = true;
            break; // Only apply the first matching pattern
          }
        }
      }
    }

    // Write the modified file
    if (hasChanges) {
      await fs.writeFile(filePath, modifiedContent, 'utf-8');
    }

    return {
      file: filePath,
      changes,
    };
  }

  private generateI18nReplacement(
    filePath: string,
    hardcodedString: HardcodedString,
    translation: any,
    frameworks: string[]
  ): string | null {
    const ext = path.extname(filePath);
    const suggestedKey = translation.suggestedKey;

    // Vue.js patterns
    if (ext === '.vue' && frameworks.includes('vue3')) {
      if (hardcodedString.context === 'vue-template') {
        return `{{ $t('${suggestedKey}') }}`;
      } else if (hardcodedString.context === 'string-literal') {
        return `$t('${suggestedKey}')`;
      }
    }

    // React/React Native patterns
    if (['.tsx', '.jsx'].includes(ext) && frameworks.includes('react-native')) {
      if (hardcodedString.context === 'jsx-content') {
        return `{t('${suggestedKey}')}`;
      } else if (hardcodedString.context === 'string-literal') {
        return `t('${suggestedKey}')`;
      }
    }

    // TypeScript/JavaScript patterns
    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      // For alert, confirm, prompt
      if (hardcodedString.context === 'alert-message') {
        return `t('${suggestedKey}')`;
      }
      
      // For attributes like placeholder, title
      if (['placeholder', 'title-attribute'].includes(hardcodedString.context)) {
        return `t('${suggestedKey}')`;
      }
      
      // For general string literals
      if (hardcodedString.context === 'string-literal') {
        return `t('${suggestedKey}')`;
      }
    }

    // Default fallback
    return `t('${suggestedKey}')`;
  }

  private getHardcodedStringPatterns(filePath: string, escapedText: string): string[] {
    const ext = path.extname(filePath);
    const patterns: string[] = [];

    // Vue template patterns
    if (ext === '.vue') {
      patterns.push(
        `>${escapedText}<`,           // Template content
        `'${escapedText}'`,           // Single quoted strings
        `"${escapedText}"`,           // Double quoted strings
        `\`${escapedText}\``,         // Template literals
        `placeholder\\s*=\\s*['"\`]${escapedText}['"\`]`,  // Placeholder attributes
        `title\\s*=\\s*['"\`]${escapedText}['"\`]`         // Title attributes
      );
    }

    // React/JSX patterns
    if (['.tsx', '.jsx'].includes(ext)) {
      patterns.push(
        `>${escapedText}<`,           // JSX content
        `'${escapedText}'`,           // Single quoted strings
        `"${escapedText}"`,           // Double quoted strings
        `\`${escapedText}\``,         // Template literals
      );
    }

    // General JavaScript/TypeScript patterns
    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      patterns.push(
        `alert\\s*\\(\\s*['"\`]${escapedText}['"\`]\\s*\\)`,     // Alert calls
        `confirm\\s*\\(\\s*['"\`]${escapedText}['"\`]\\s*\\)`,   // Confirm calls
        `prompt\\s*\\(\\s*['"\`]${escapedText}['"\`]\\s*\\)`,    // Prompt calls
        `'${escapedText}'`,                                        // Single quoted
        `"${escapedText}"`,                                        // Double quoted
        `\`${escapedText}\``,                                      // Template literals
      );
    }

    return patterns;
  }
}