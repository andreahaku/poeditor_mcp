import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'fast-glob';
import { DetectedKey, I18nFramework, ParseResult, ASTPattern, KeyUsage } from '@/types/index.js';

export class POEditorDetector {
  private astPatterns: { [framework: string]: ASTPattern[] } = {
    vue3: [
      {
        type: 'CallExpression',
        pattern: /\$t\s*\(\s*['"`]([^'"`]+)['"`]/g,
        keyExtractor: (match: RegExpMatchArray) => match[1],
      },
      {
        type: 'CallExpression', 
        pattern: /\bt\s*\(\s*['"`]([^'"`]+)['"`]/g,
        keyExtractor: (match: RegExpMatchArray) => match[1],
      },
      {
        type: 'CallExpression',
        pattern: /useI18n\(\)\.t\s*\(\s*['"`]([^'"`]+)['"`]/g,
        keyExtractor: (match: RegExpMatchArray) => match[1],
      },
      {
        type: 'CallExpression',
        pattern: /i18n\.global\.t\s*\(\s*['"`]([^'"`]+)['"`]/g,
        keyExtractor: (match: RegExpMatchArray) => match[1],
      },
    ],
    nuxt3: [
      {
        type: 'CallExpression',
        pattern: /\$t\s*\(\s*['"`]([^'"`]+)['"`]/g,
        keyExtractor: (match: RegExpMatchArray) => match[1],
      },
      {
        type: 'CallExpression',
        pattern: /\bt\s*\(\s*['"`]([^'"`]+)['"`]/g,
        keyExtractor: (match: RegExpMatchArray) => match[1],
      },
    ],
    'react-native': [
      {
        type: 'CallExpression',
        pattern: /useTranslation\(\)\.t\s*\(\s*['"`]([^'"`]+)['"`]/g,
        keyExtractor: (match: RegExpMatchArray) => match[1],
      },
      {
        type: 'CallExpression',
        pattern: /\bt\s*\(\s*['"`]([^'"`]+)['"`]/g,
        keyExtractor: (match: RegExpMatchArray) => match[1],
      },
      {
        type: 'JSXElement',
        pattern: /<Trans\s+i18nKey\s*=\s*['"`]([^'"`]+)['"`]/g,
        keyExtractor: (match: RegExpMatchArray) => match[1],
      },
      {
        type: 'CallExpression',
        pattern: /i18n\.t\s*\(\s*['"`]([^'"`]+)['"`]/g,
        keyExtractor: (match: RegExpMatchArray) => match[1],
      },
    ],
    i18next: [
      {
        type: 'CallExpression',
        pattern: /i18next\.t\s*\(\s*['"`]([^'"`]+)['"`]/g,
        keyExtractor: (match: RegExpMatchArray) => match[1],
      },
      {
        type: 'CallExpression',
        pattern: /\bt\s*\(\s*['"`]([^'"`]+)['"`]/g,
        keyExtractor: (match: RegExpMatchArray) => match[1],
      },
    ],
  };

  async detectKeys(options: {
    globs: string[];
    frameworks: I18nFramework[];
    sourceLang: string;
    resourceFormats: string[];
    ignore: string[];
  }): Promise<ParseResult> {
    const { globs, frameworks, ignore } = options;
    const allKeys: DetectedKey[] = [];
    const errors: Array<{ file: string; line: number; message: string }> = [];
    let filesProcessed = 0;

    try {
      // Find all matching files
      const files = await glob(globs, {
        ignore,
        absolute: true,
      });

      console.error(`Found ${files.length} files to process`);

      // Process each file
      for (const filePath of files) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const fileKeys = await this.parseFile(filePath, content, frameworks);
          allKeys.push(...fileKeys);
          filesProcessed++;
          
          if (filesProcessed % 50 === 0) {
            console.error(`Processed ${filesProcessed}/${files.length} files...`);
          }
        } catch (error) {
          errors.push({
            file: filePath,
            line: 0,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Also scan for resource files
      const resourceKeys = await this.scanResourceFiles(options);
      allKeys.push(...resourceKeys);

      // Deduplicate keys
      const deduplicatedKeys = this.deduplicateKeys(allKeys);

      console.error(`Detection complete: ${deduplicatedKeys.length} unique keys found`);

      return {
        keys: deduplicatedKeys,
        errors,
        stats: {
          filesProcessed,
          keysFound: deduplicatedKeys.length,
          dynamicKeys: deduplicatedKeys.filter(k => k.dynamic).length,
        },
      };
    } catch (error) {
      throw new Error(`Key detection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async parseFile(
    filePath: string,
    content: string,
    frameworks: I18nFramework[]
  ): Promise<DetectedKey[]> {
    const keys: DetectedKey[] = [];
    const ext = path.extname(filePath);
    const lines = content.split('\n');

    for (const framework of frameworks) {
      const patterns = this.astPatterns[framework] || [];
      
      for (const pattern of patterns) {
        const matches = content.matchAll(pattern.pattern);
        
        for (const match of matches) {
          const key = pattern.keyExtractor(match);
          if (!key) continue;

          // Find line and column
          const matchIndex = match.index || 0;
          const beforeMatch = content.slice(0, matchIndex);
          const lineNumber = beforeMatch.split('\n').length;
          const columnNumber = beforeMatch.split('\n').pop()?.length || 0;

          // Extract context (surrounding lines)
          const contextStart = Math.max(0, lineNumber - 2);
          const contextEnd = Math.min(lines.length, lineNumber + 1);
          const context = lines.slice(contextStart, contextEnd).join('\n');

          // Detect if key is dynamic (contains variables)
          const isDynamic = this.isDynamicKey(match[0]);

          // Extract phrase from context if possible
          const phrase = this.extractPhrase(match[0], context) || key;

          const usage: KeyUsage = {
            path: filePath,
            line: lineNumber,
            column: columnNumber,
            context,
          };

          // Determine usage pattern
          const usagePattern = this.detectUsagePattern(match[0]);

          keys.push({
            key,
            phrase,
            files: [usage],
            framework,
            usage: usagePattern,
            dynamic: isDynamic,
            examples: [match[0]],
          });
        }
      }
    }

    return keys;
  }

  private async scanResourceFiles(options: {
    resourceFormats: string[];
    globs: string[];
    ignore: string[];
  }): Promise<DetectedKey[]> {
    const keys: DetectedKey[] = [];
    
    // Look for common resource file patterns
    const resourcePatterns = [
      '**/locales/**/*.json',
      '**/i18n/**/*.json',
      '**/lang/**/*.json',
      '**/messages/**/*.json',
      '**/public/locales/**/*.json',
      '**/*messages*.ts',
      '**/*i18n*.ts',
    ];

    try {
      const resourceFiles = await glob(resourcePatterns, {
        ignore: options.ignore,
        absolute: true,
      });

      for (const filePath of resourceFiles) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const ext = path.extname(filePath);
          
          if (ext === '.json') {
            const resourceKeys = this.parseJsonResource(filePath, content);
            keys.push(...resourceKeys);
          } else if (ext === '.ts' || ext === '.js') {
            const resourceKeys = this.parseTypeScriptResource(filePath, content);
            keys.push(...resourceKeys);
          }
        } catch (error) {
          console.error(`Failed to parse resource file ${filePath}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to scan resource files:', error);
    }

    return keys;
  }

  private parseJsonResource(filePath: string, content: string): DetectedKey[] {
    const keys: DetectedKey[] = [];
    
    try {
      const data = JSON.parse(content);
      const flatKeys = this.flattenObject(data);
      
      for (const [key, value] of Object.entries(flatKeys)) {
        if (typeof value === 'string') {
          keys.push({
            key,
            phrase: value,
            files: [{
              path: filePath,
              line: 0,
              column: 0,
              context: `Resource file: ${path.basename(filePath)}`,
            }],
            framework: 'i18next', // Default for JSON resources
            usage: 'resource',
            dynamic: false,
            examples: [value],
          });
        }
      }
    } catch (error) {
      console.error(`Failed to parse JSON resource ${filePath}:`, error);
    }
    
    return keys;
  }

  private parseTypeScriptResource(filePath: string, content: string): DetectedKey[] {
    const keys: DetectedKey[] = [];
    
    // Simple regex-based parsing for TypeScript resource files
    const exportPattern = /export\s+(?:const|default)\s+\w+\s*[:=]\s*({[\s\S]*?});?$/gm;
    const matches = content.matchAll(exportPattern);
    
    for (const match of matches) {
      try {
        // This is a simplified approach - in production, you'd want proper AST parsing
        const objectStr = match[1];
        const evalString = `(${objectStr})`;
        const data = eval(evalString); // Note: Use proper AST parsing in production
        
        const flatKeys = this.flattenObject(data);
        
        for (const [key, value] of Object.entries(flatKeys)) {
          if (typeof value === 'string') {
            keys.push({
              key,
              phrase: value,
              files: [{
                path: filePath,
                line: 0,
                column: 0,
                context: `TypeScript resource: ${path.basename(filePath)}`,
              }],
              framework: 'vue3', // Common for TS resources
              usage: 'resource',
              dynamic: false,
              examples: [value],
            });
          }
        }
      } catch (error) {
        console.error(`Failed to parse TypeScript resource ${filePath}:`, error);
      }
    }
    
    return keys;
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

  private isDynamicKey(matchString: string): boolean {
    // Check for template literals, variable interpolation, or computed keys
    const dynamicPatterns = [
      /\${.*}/, // Template literals
      /\+/, // String concatenation
      /\[.*\]/, // Computed property access
      /`.*`/, // Template strings
    ];
    
    return dynamicPatterns.some(pattern => pattern.test(matchString));
  }

  private extractPhrase(matchString: string, context: string): string | null {
    // Try to extract the actual phrase/text being translated
    // This is a simplified implementation - you might want more sophisticated extraction
    
    // Look for string literals in the match
    const stringMatch = matchString.match(/['"`]([^'"`]+)['"`]/);
    return stringMatch ? stringMatch[1] : null;
  }

  private detectUsagePattern(matchString: string): string {
    if (matchString.includes('$t(')) return '$t';
    if (matchString.includes('useTranslation')) return 'useTranslation';
    if (matchString.includes('<Trans')) return 'Trans';
    if (matchString.includes('i18n.t(')) return 'i18n.t';
    if (matchString.includes('i18n.global.t(')) return 'i18n.global.t';
    return 't';
  }

  private deduplicateKeys(keys: DetectedKey[]): DetectedKey[] {
    const keyMap = new Map<string, DetectedKey>();
    
    for (const key of keys) {
      const existing = keyMap.get(key.key);
      
      if (existing) {
        // Merge usage information
        existing.files.push(...key.files);
        existing.examples.push(...key.examples);
        
        // Keep the most specific framework
        if (key.framework !== 'i18next' && existing.framework === 'i18next') {
          existing.framework = key.framework;
        }
        
        // Update dynamic status if any usage is dynamic
        existing.dynamic = existing.dynamic || key.dynamic;
      } else {
        keyMap.set(key.key, { ...key });
      }
    }
    
    return Array.from(keyMap.values());
  }
}