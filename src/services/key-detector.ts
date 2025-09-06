import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'fast-glob';
import { DetectedKey, I18nFramework, ParseResult, ASTPattern, KeyUsage } from '@/types/index.js';

export interface HardcodedString {
  text: string;
  suggestedKey: string;
  confidence: number;
  isTranslatable: boolean;
  language: 'en' | 'it';
  files: KeyUsage[];
  context: string;
}

export class POEditorDetector {
  // Patterns for detecting hardcoded strings that should be translated
  private hardcodedStringPatterns = [
    // Vue template strings
    {
      pattern: />([^<>{}\n]{3,}[a-zA-Z][^<>{}]*)</g,
      context: 'vue-template',
      exclude: /^[\s\d\-_.,;:!@#$%^&*()+=\[\]{}|\\\/"`~<>?]*$/,
    },
    // HTML content
    {
      pattern: />([\w\s.,!?:;'"()-]+)</g,
      context: 'html-content',
      exclude: /^[\s\d\-_.,;:!@#$%^&*()+=\[\]{}|\\\/"`~<>?]*$/,
    },
    // Button/link text in JSX/TSX
    {
      pattern: />([A-Z][a-zA-Z\s.,!?:;'"()-]{2,})</g,
      context: 'jsx-content',
      exclude: /^[\s\d\-_.,;:!@#$%^&*()+=\[\]{}|\\\/"`~<>?]*$/,
    },
    // String literals that look like user-facing text
    {
      pattern: /['"`]([A-Z][a-zA-Z\s.,!?:;'"()-]{4,})['"`]/g,
      context: 'string-literal',
      exclude: /^(console|log|error|warn|info|debug|className|class|id|type|name|key|value|href|src|alt|title|data-|aria-|test|spec)$/i,
    },
    // Alert, confirm, prompt messages
    {
      pattern: /(?:alert|confirm|prompt)\s*\(\s*['"`]([^'"`]{5,})['"`]/g,
      context: 'alert-message',
      exclude: /^[\s\d\-_.,;:!@#$%^&*()+=\[\]{}|\\\/"`~<>?]*$/,
    },
    // Placeholder attributes
    {
      pattern: /placeholder\s*=\s*['"`]([^'"`]{3,})['"`]/g,
      context: 'placeholder',
      exclude: /^[\s\d\-_.,;:!@#$%^&*()+=\[\]{}|\\\/"`~<>?]*$/,
    },
    // Title attributes
    {
      pattern: /title\s*=\s*['"`]([^'"`]{3,})['"`]/g,
      context: 'title-attribute',
      exclude: /^[\s\d\-_.,;:!@#$%^&*()+=\[\]{}|\\\/"`~<>?]*$/,
    },
  ];

  // Common English and Italian words to help identify language
  private englishWords = new Set([
    'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'from', 'about', 'into', 'through', 'during', 'before', 'after', 'above',
    'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further',
    'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all',
    'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'can', 'will', 'just', 'should', 'now', 'click', 'save', 'delete', 'edit',
    'cancel', 'confirm', 'submit', 'send', 'create', 'update', 'remove', 'add'
  ]);

  private italianWords = new Set([
    'il', 'la', 'lo', 'le', 'gli', 'un', 'una', 'uno', 'di', 'a', 'da', 'in',
    'con', 'su', 'per', 'tra', 'fra', 'come', 'quando', 'dove', 'perché',
    'che', 'chi', 'cui', 'quale', 'quanto', 'ogni', 'tutto', 'alcuni', 'molti',
    'più', 'meno', 'molto', 'poco', 'tanto', 'troppo', 'abbastanza', 'ancora',
    'già', 'mai', 'sempre', 'spesso', 'presto', 'tardi', 'qui', 'qua', 'là',
    'lì', 'sopra', 'sotto', 'dentro', 'fuori', 'prima', 'dopo', 'durante',
    'contro', 'verso', 'senza', 'salva', 'elimina', 'modifica', 'annulla',
    'conferma', 'invia', 'crea', 'aggiorna', 'rimuovi', 'aggiungi', 'clicca'
  ]);

  // Non-translatable patterns (technical terms, code, etc.)
  private nonTranslatablePatterns = [
    /^[A-Z_]+$/, // ALL_CAPS constants
    /^[a-z-]+$/, // kebab-case
    /^[a-zA-Z]+\d+$/, // alphanumeric identifiers
    /^\d+(\.\d+)*$/, // version numbers
    /^https?:\/\//, // URLs
    /^\/[\/\w-]*$/, // paths
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, // emails
    /^#[a-fA-F0-9]{3,8}$/, // hex colors
    /^rgb\(/, // RGB colors
    /console|log|error|warn|info|debug/i, // console methods
    /^(true|false|null|undefined)$/i, // literals
    /^[{}\[\]()]+$/, // brackets only
    /^\s*$/, // whitespace only
  ];

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
        const regex = typeof pattern.pattern === 'string' ? new RegExp(pattern.pattern, 'g') : pattern.pattern;
        const matches = content.matchAll(regex);
        
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

  async detectHardcodedStrings(options: {
    globs: string[];
    frameworks: I18nFramework[];
    ignore: string[];
  }): Promise<{ hardcodedStrings: HardcodedString[]; errors: Array<{ file: string; line: number; message: string }> }> {
    const { globs, ignore } = options;
    const hardcodedStrings: HardcodedString[] = [];
    const errors: Array<{ file: string; line: number; message: string }> = [];
    let filesProcessed = 0;

    try {
      const files = await glob(globs, {
        ignore,
        absolute: true,
      });

      console.error(`Scanning ${files.length} files for hardcoded strings...`);

      for (const filePath of files) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const fileStrings = await this.parseFileForHardcodedStrings(filePath, content);
          hardcodedStrings.push(...fileStrings);
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

      console.error(`Hardcoded string detection complete: ${hardcodedStrings.length} strings found`);

      return {
        hardcodedStrings: this.deduplicateHardcodedStrings(hardcodedStrings),
        errors,
      };
    } catch (error) {
      throw new Error(`Hardcoded string detection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async parseFileForHardcodedStrings(filePath: string, content: string): Promise<HardcodedString[]> {
    const strings: HardcodedString[] = [];
    const lines = content.split('\n');

    for (const patternConfig of this.hardcodedStringPatterns) {
      const matches = content.matchAll(patternConfig.pattern);
      
      for (const match of matches) {
        const text = match[1]?.trim();
        if (!text || text.length < 3) continue;

        // Skip if matches exclude pattern
        if (patternConfig.exclude && patternConfig.exclude.test(text)) continue;

        // Skip if matches non-translatable patterns
        if (this.nonTranslatablePatterns.some(pattern => pattern.test(text))) continue;

        // Determine if this looks translatable
        const isTranslatable = this.isTranslatable(text);
        if (!isTranslatable) continue;

        // Detect language
        const language = this.detectLanguage(text);

        // Calculate confidence based on various factors
        const confidence = this.calculateConfidence(text, patternConfig.context);

        // Find line and column
        const matchIndex = match.index || 0;
        const beforeMatch = content.slice(0, matchIndex);
        const lineNumber = beforeMatch.split('\n').length;
        const columnNumber = beforeMatch.split('\n').pop()?.length || 0;

        // Extract context
        const contextStart = Math.max(0, lineNumber - 2);
        const contextEnd = Math.min(lines.length, lineNumber + 1);
        const context = lines.slice(contextStart, contextEnd).join('\n');

        // Generate suggested key
        const suggestedKey = this.generateKeyFromText(text, filePath, patternConfig.context);

        const usage: KeyUsage = {
          path: filePath,
          line: lineNumber,
          column: columnNumber,
          context,
        };

        strings.push({
          text,
          suggestedKey,
          confidence,
          isTranslatable,
          language,
          files: [usage],
          context: patternConfig.context,
        });
      }
    }

    return strings;
  }

  private isTranslatable(text: string): boolean {
    // Must contain at least one letter
    if (!/[a-zA-Z]/.test(text)) return false;

    // Must be longer than 2 characters
    if (text.length < 3) return false;

    // Should contain common sentence patterns
    const hasWords = /\b\w{2,}\b/.test(text);
    const hasSpaces = /\s/.test(text);
    const startsWithCapital = /^[A-Z]/.test(text);
    
    // Likely user-facing text if it has words and either spaces or starts with capital
    return hasWords && (hasSpaces || startsWithCapital);
  }

  private detectLanguage(text: string): 'en' | 'it' {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    let englishScore = 0;
    let italianScore = 0;

    for (const word of words) {
      if (this.englishWords.has(word)) englishScore++;
      if (this.italianWords.has(word)) italianScore++;
    }

    // Default to English if no clear indication
    return italianScore > englishScore ? 'it' : 'en';
  }

  private calculateConfidence(text: string, context: string): number {
    let confidence = 0.5; // Base confidence

    // Higher confidence for certain contexts
    if (['alert-message', 'placeholder', 'title-attribute'].includes(context)) {
      confidence += 0.3;
    }

    // Higher confidence for longer text
    if (text.length > 10) confidence += 0.1;
    if (text.length > 20) confidence += 0.1;

    // Higher confidence for sentence-like text
    if (/[.!?]$/.test(text)) confidence += 0.2;
    if (/^[A-Z]/.test(text)) confidence += 0.1;
    
    // Higher confidence if contains common UI words
    const uiWords = ['click', 'save', 'delete', 'edit', 'cancel', 'confirm', 'submit', 'create', 'update'];
    if (uiWords.some(word => text.toLowerCase().includes(word))) {
      confidence += 0.2;
    }

    return Math.min(1, confidence);
  }

  private generateKeyFromText(text: string, filePath: string, context: string): string {
    // Get base filename without extension
    const filename = path.basename(filePath, path.extname(filePath));
    
    // Clean and normalize text for key generation
    let keyPart = text
      .toLowerCase()
      .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special chars
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .substring(0, 30); // Limit length

    // Remove common words that don't add meaning
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    keyPart = keyPart
      .split('_')
      .filter(word => !stopWords.includes(word) && word.length > 1)
      .join('_');

    // Generate hierarchical key
    const contextPrefix = context === 'placeholder' ? 'placeholder' :
                         context === 'title-attribute' ? 'title' :
                         context === 'alert-message' ? 'alert' : 'text';

    return `${filename}.${contextPrefix}.${keyPart}`;
  }

  private deduplicateHardcodedStrings(strings: HardcodedString[]): HardcodedString[] {
    const stringMap = new Map<string, HardcodedString>();
    
    for (const str of strings) {
      const key = `${str.text}:${str.context}`;
      const existing = stringMap.get(key);
      
      if (existing) {
        existing.files.push(...str.files);
        existing.confidence = Math.max(existing.confidence, str.confidence);
      } else {
        stringMap.set(key, { ...str });
      }
    }
    
    return Array.from(stringMap.values())
      .filter(str => str.confidence > 0.5) // Only include high-confidence strings
      .sort((a, b) => b.confidence - a.confidence);
  }
}