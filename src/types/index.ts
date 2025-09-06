// Core types for POEditor MCP server

export interface POEditorConfig {
  apiToken: string;
  projectId: string;
  projectSlug?: string;
  sourceLang: string;
  targetLangs: string[];
  frameworks: I18nFramework[];
  keyStyle: 'dot' | 'kebab';
  paths: {
    include: string[];
    exclude: string[];
  };
  namespaceRules: {
    prefix?: string;
    maxDepth?: number;
    stopWords?: string[];
  };
  resources: {
    [framework: string]: {
      format: 'json' | 'typescript' | 'vue-i18n';
      outDir: string;
      bundleSplit: 'per-lang' | 'per-namespace';
    };
  };
}

export type I18nFramework = 'vue3' | 'nuxt3' | 'react-native' | 'i18next';

export interface DetectedKey {
  key: string;
  phrase: string;
  files: KeyUsage[];
  framework: I18nFramework;
  usage: string; // e.g., '$t', 'useTranslation', 'Trans'
  dynamic: boolean;
  examples: string[];
  context?: string;
}

export interface KeyUsage {
  path: string;
  line: number;
  column: number;
  context: string; // surrounding code context
}

export interface KeyRenameSuggestion {
  from: string;
  to: string;
  confidence: number;
  reason: string;
  conflicts: string[];
}

export interface POEditorTerm {
  term: string;
  context?: string;
  reference?: string;
  plural?: string;
  tags?: string[];
  comment?: string;
}

export interface POEditorTranslation {
  term: string;
  language: string;
  content: string;
  fuzzy: boolean;
  proofread: boolean;
  updated: string;
}

export interface SyncPlan {
  addTerms: POEditorTerm[];
  updateTerms: Array<{
    term: string;
    updates: Partial<POEditorTerm>;
  }>;
  deleteTerms: string[];
  missingTranslations: {
    [lang: string]: string[];
  };
  obsoleteTranslations: {
    [lang: string]: string[];
  };
  renameHints: KeyRenameSuggestion[];
  stats: {
    adds: number;
    updates: number;
    deletes: number;
    missing: number;
  };
}

export interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  mtTriggered: string[];
  errors: Array<{
    operation: string;
    term?: string;
    error: string;
  }>;
  rateLimitWaits: number;
  auditLogId: string;
}

export interface ProjectCache {
  fileChecksums: { [path: string]: string };
  lastRemoteETags: { [endpoint: string]: string };
  lastSyncAuditId?: string;
  lastUpdated: string;
}

// AST parsing types
export interface ASTPattern {
  type: 'CallExpression' | 'JSXElement' | 'TemplateElement';
  pattern: string | RegExp;
  keyExtractor: (node: any) => string | null;
  contextExtractor?: (node: any) => string | null;
}

export interface ParseResult {
  keys: DetectedKey[];
  errors: Array<{
    file: string;
    line: number;
    message: string;
  }>;
  stats: {
    filesProcessed: number;
    keysFound: number;
    dynamicKeys: number;
  };
}