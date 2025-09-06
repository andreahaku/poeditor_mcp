import { DetectedKey, KeyRenameSuggestion } from '@/types/index.js';

export interface NameSuggestionOptions {
  keys: DetectedKey[];
  style: 'dot' | 'kebab';
  rules: {
    prefix?: string;
    maxDepth?: number;
    stopWords?: string[];
  };
  allowlist: string[];
  denylist: string[];
}

export interface NameSuggestionResult {
  renames: KeyRenameSuggestion[];
  guidelines: string;
}

export class KeyNameSuggester {
  private readonly DEFAULT_STOP_WORDS = [
    'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
    'a', 'an', 'this', 'that', 'these', 'those', 'for', 'to'
  ];

  async suggestNames(options: NameSuggestionOptions): Promise<NameSuggestionResult> {
    const { keys, style, rules, allowlist, denylist } = options;
    const renames: KeyRenameSuggestion[] = [];
    const maxDepth = rules.maxDepth || 4;
    const stopWords = [...this.DEFAULT_STOP_WORDS, ...(rules.stopWords || [])];
    
    console.error(`Analyzing ${keys.length} keys for naming improvements...`);

    for (const key of keys) {
      // Skip keys in allowlist
      if (allowlist.includes(key.key)) {
        continue;
      }

      // Check if key violates denylist patterns
      const violatesDenylist = denylist.some(pattern => {
        const regex = new RegExp(pattern, 'i');
        return regex.test(key.key);
      });

      if (violatesDenylist) {
        renames.push({
          from: key.key,
          to: this.generateSuggestedName(key, style, rules, stopWords, maxDepth),
          confidence: 0.9,
          reason: 'Violates denylist pattern',
          conflicts: [],
        });
        continue;
      }

      // Analyze current key structure
      const analysis = this.analyzeKey(key);
      
      // Generate suggestion based on analysis
      const suggestion = this.generateImprovedName(key, analysis, style, rules, stopWords, maxDepth);
      
      if (suggestion && suggestion !== key.key) {
        const confidence = this.calculateConfidence(key, analysis, suggestion);
        const conflicts = this.checkForConflicts(suggestion, keys);
        
        renames.push({
          from: key.key,
          to: suggestion,
          confidence,
          reason: this.generateReason(analysis, suggestion),
          conflicts,
        });
      }
    }

    // Sort by confidence (highest first)
    renames.sort((a, b) => b.confidence - a.confidence);

    const guidelines = this.generateGuidelines(keys, renames, style, rules);

    console.error(`Generated ${renames.length} rename suggestions`);

    return { renames, guidelines };
  }

  private analyzeKey(key: DetectedKey): {
    hasInconsistentNaming: boolean;
    isFlat: boolean;
    hasPoorStructure: boolean;
    usesAbbreviations: boolean;
    needsNamespace: boolean;
    suggestedNamespace: string | null;
  } {
    const keyParts = key.key.split(/[.-]/);
    
    return {
      hasInconsistentNaming: this.detectInconsistentNaming(key.key),
      isFlat: keyParts.length === 1 && key.files.length > 1,
      hasPoorStructure: this.detectPoorStructure(keyParts),
      usesAbbreviations: this.detectAbbreviations(keyParts),
      needsNamespace: this.needsNamespace(key),
      suggestedNamespace: this.suggestNamespace(key),
    };
  }

  private detectInconsistentNaming(key: string): boolean {
    // Check for mixed naming conventions
    const hasCamelCase = /[a-z][A-Z]/.test(key);
    const hasSnakeCase = /_/.test(key);
    const hasKebabCase = /-/.test(key);
    const hasDotCase = /\./.test(key);
    
    const conventions = [hasCamelCase, hasSnakeCase, hasKebabCase, hasDotCase].filter(Boolean).length;
    return conventions > 1;
  }

  private detectPoorStructure(parts: string[]): boolean {
    // Check for very long single parts or too many short parts
    const hasLongParts = parts.some(part => part.length > 15);
    const hasManyShortParts = parts.length > 6 && parts.every(part => part.length < 4);
    
    return hasLongParts || hasManyShortParts;
  }

  private detectAbbreviations(parts: string[]): boolean {
    const commonAbbreviations = ['btn', 'msg', 'txt', 'img', 'usr', 'cfg', 'err'];
    return parts.some(part => commonAbbreviations.includes(part.toLowerCase()));
  }

  private needsNamespace(key: DetectedKey): boolean {
    // Keys used in multiple files or frameworks might need namespacing
    return key.files.length > 1 || key.dynamic;
  }

  private suggestNamespace(key: DetectedKey): string | null {
    // Extract namespace suggestions from file paths
    const commonPaths = key.files.map(file => {
      const pathParts = file.path.split('/');
      // Look for common directory names that indicate feature areas
      const featureIndicators = ['components', 'pages', 'views', 'modules', 'features'];
      
      for (let i = 0; i < pathParts.length - 1; i++) {
        if (featureIndicators.includes(pathParts[i]) && pathParts[i + 1]) {
          return pathParts[i + 1];
        }
      }
      
      return null;
    }).filter(Boolean);

    // Return most common namespace suggestion
    if (commonPaths.length > 0) {
      const counts = commonPaths.reduce((acc: any, path) => {
        acc[path!] = (acc[path!] || 0) + 1;
        return acc;
      }, {});
      
      const mostCommon = Object.entries(counts)
        .sort(([, a], [, b]) => (b as number) - (a as number))[0];
      
      return mostCommon[0] as string;
    }

    return null;
  }

  private generateImprovedName(
    key: DetectedKey,
    analysis: any,
    style: 'dot' | 'kebab',
    rules: any,
    stopWords: string[],
    maxDepth: number
  ): string | null {
    let suggestion = key.key;
    
    // Apply namespace if needed
    if (analysis.needsNamespace && analysis.suggestedNamespace) {
      const separator = style === 'dot' ? '.' : '-';
      suggestion = `${analysis.suggestedNamespace}${separator}${suggestion}`;
    }

    // Add prefix if specified
    if (rules.prefix) {
      const separator = style === 'dot' ? '.' : '-';
      suggestion = `${rules.prefix}${separator}${suggestion}`;
    }

    // Convert to consistent naming style
    suggestion = this.convertToStyle(suggestion, style);
    
    // Clean up structure
    suggestion = this.cleanupStructure(suggestion, stopWords, maxDepth, style);
    
    // Expand abbreviations
    suggestion = this.expandAbbreviations(suggestion);
    
    return suggestion !== key.key ? suggestion : null;
  }

  private generateSuggestedName(
    key: DetectedKey,
    style: 'dot' | 'kebab',
    rules: any,
    stopWords: string[],
    maxDepth: number
  ): string {
    // Generate a completely new name based on the phrase and context
    let suggestion = '';
    
    // Use the phrase as base if available and meaningful
    const phrase = key.phrase && key.phrase !== key.key ? key.phrase : key.key;
    
    // Extract meaningful words from phrase
    const words = this.extractWords(phrase, stopWords);
    
    // Build hierarchical structure
    const namespace = this.suggestNamespace(key);
    const prefix = rules.prefix;
    const separator = style === 'dot' ? '.' : '-';
    
    const parts = [];
    if (prefix) parts.push(prefix);
    if (namespace) parts.push(namespace);
    parts.push(...words.slice(0, maxDepth - parts.length));
    
    suggestion = parts.join(separator);
    
    return this.convertToStyle(suggestion, style);
  }

  private convertToStyle(key: string, style: 'dot' | 'kebab'): string {
    if (style === 'dot') {
      return key
        .replace(/[-_]/g, '.')
        .replace(/([a-z])([A-Z])/g, '$1.$2')
        .toLowerCase();
    } else {
      return key
        .replace(/[._]/g, '-')
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .toLowerCase();
    }
  }

  private cleanupStructure(key: string, stopWords: string[], maxDepth: number, style: 'dot' | 'kebab'): string {
    const separator = style === 'dot' ? '.' : '-';
    const parts = key.split(separator);
    
    // Remove stop words
    const filteredParts = parts.filter(part => 
      !stopWords.includes(part.toLowerCase()) && part.length > 1
    );
    
    // Limit depth
    const limitedParts = filteredParts.slice(0, maxDepth);
    
    return limitedParts.join(separator);
  }

  private expandAbbreviations(key: string): string {
    const expansions: { [key: string]: string } = {
      'btn': 'button',
      'msg': 'message',
      'txt': 'text',
      'img': 'image',
      'usr': 'user',
      'cfg': 'config',
      'err': 'error',
      'auth': 'authentication',
      'admin': 'administration',
      'nav': 'navigation',
      'desc': 'description',
    };

    let expanded = key;
    for (const [abbr, full] of Object.entries(expansions)) {
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      expanded = expanded.replace(regex, full);
    }

    return expanded;
  }

  private extractWords(text: string, stopWords: string[]): string[] {
    // Extract meaningful words from text
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1 && !stopWords.includes(word))
      .slice(0, 4); // Limit to reasonable number of words

    return words;
  }

  private calculateConfidence(key: DetectedKey, analysis: any, suggestion: string): number {
    let confidence = 0.5; // Base confidence

    // Boost confidence for clear improvements
    if (analysis.hasInconsistentNaming) confidence += 0.2;
    if (analysis.hasPoorStructure) confidence += 0.15;
    if (analysis.usesAbbreviations) confidence += 0.1;
    if (analysis.needsNamespace && analysis.suggestedNamespace) confidence += 0.15;

    // Reduce confidence for uncertain cases
    if (key.dynamic) confidence -= 0.1;
    if (key.files.length === 1) confidence -= 0.05;

    // Boost confidence if suggestion follows clear patterns
    if (this.followsGoodPatterns(suggestion)) confidence += 0.1;

    return Math.min(1.0, Math.max(0.1, confidence));
  }

  private followsGoodPatterns(suggestion: string): boolean {
    // Check if suggestion follows good naming patterns
    const parts = suggestion.split(/[.-]/);
    
    // Good: 2-4 parts, each 3-10 characters
    const goodLength = parts.length >= 2 && parts.length <= 4;
    const goodPartSizes = parts.every(part => part.length >= 3 && part.length <= 10);
    const noAbbreviations = !parts.some(part => 
      ['btn', 'msg', 'txt', 'img'].includes(part.toLowerCase())
    );

    return goodLength && goodPartSizes && noAbbreviations;
  }

  private checkForConflicts(suggestion: string, allKeys: DetectedKey[]): string[] {
    const conflicts = allKeys
      .filter(key => key.key === suggestion)
      .map(key => key.key);
    
    return conflicts;
  }

  private generateReason(analysis: any, suggestion: string): string {
    const reasons = [];
    
    if (analysis.hasInconsistentNaming) {
      reasons.push('Fixes inconsistent naming conventions');
    }
    if (analysis.isFlat) {
      reasons.push('Adds proper hierarchical structure');
    }
    if (analysis.hasPoorStructure) {
      reasons.push('Improves key structure and readability');
    }
    if (analysis.usesAbbreviations) {
      reasons.push('Expands abbreviations for clarity');
    }
    if (analysis.needsNamespace) {
      reasons.push('Adds appropriate namespace for organization');
    }

    return reasons.join('; ') || 'Improves naming consistency';
  }

  private generateGuidelines(
    keys: DetectedKey[],
    renames: KeyRenameSuggestion[],
    style: 'dot' | 'kebab',
    rules: any
  ): string {
    const separator = style === 'dot' ? '.' : '-';
    const totalKeys = keys.length;
    const improvableKeys = renames.length;
    const highConfidence = renames.filter(r => r.confidence >= 0.8).length;

    return `
Smartness i18n Key Naming Guidelines:

Style: ${style === 'dot' ? 'Dot notation (e.g., auth.login.button)' : 'Kebab case (e.g., auth-login-button)'}
Separator: "${separator}"
Max Depth: ${rules.maxDepth || 4}
${rules.prefix ? `Prefix: "${rules.prefix}"` : ''}

Analysis Results:
• Total keys analyzed: ${totalKeys}
• Keys needing improvement: ${improvableKeys} (${Math.round(improvableKeys / totalKeys * 100)}%)
• High confidence suggestions: ${highConfidence}

Recommended Patterns:
• Use hierarchical structure: feature${separator}component${separator}element${separator}action
• Avoid abbreviations: use "button" not "btn", "message" not "msg"
• Use descriptive names: "login${separator}error${separator}invalid${separator}credentials"
• Group related keys: "dashboard${separator}metrics${separator}*" for all dashboard metrics
• Be consistent with pluralization: "user${separator}list${separator}item" vs "users${separator}list${separator}item"

Examples of Good Keys:
• auth${separator}login${separator}form${separator}submit
• dashboard${separator}analytics${separator}chart${separator}title  
• profile${separator}settings${separator}privacy${separator}description
• error${separator}validation${separator}required${separator}field
    `.trim();
  }
}