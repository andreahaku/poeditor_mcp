import * as fs from 'fs/promises';
import * as path from 'path';
import { POEditorConfig, ProjectCache } from '@/types/index.js';

export interface SmartnessPOEditorConfig extends POEditorConfig {
  // Additional Smartness-specific configuration
  projectName?: string;
  repositories?: {
    name: string;
    path: string;
    framework: 'vue3' | 'nuxt3' | 'react-native';
  }[];
  integrations?: {
    slack?: {
      webhook?: string;
      channel?: string;
    };
    github?: {
      createPRs?: boolean;
      reviewers?: string[];
    };
  };
}

export class ConfigManager {
  private configPath: string;
  private cachePath: string;
  private config: SmartnessPOEditorConfig | null = null;
  private cache: ProjectCache | null = null;

  constructor(configPath?: string, cachePath?: string) {
    this.configPath = configPath || process.env.CONFIG_FILE || '.smartness-i18n.json';
    this.cachePath = cachePath || process.env.CACHE_DIR || './.smartness-i18n-cache';
  }

  async loadConfig(workingDir = process.cwd()): Promise<SmartnessPOEditorConfig> {
    if (this.config) {
      return this.config;
    }

    const fullConfigPath = path.resolve(workingDir, this.configPath);
    
    try {
      const configContent = await fs.readFile(fullConfigPath, 'utf-8');
      this.config = JSON.parse(configContent);
      
      // Validate required fields
      this.validateConfig(this.config!);
      
      console.error(`Loaded configuration from: ${fullConfigPath}`);
      return this.config!;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        console.error(`Configuration file not found: ${fullConfigPath}`);
        console.error('Creating default configuration...');
        
        // Create default config
        this.config = this.createDefaultConfig();
        await this.saveConfig(this.config, workingDir);
        return this.config;
      }
      
      throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private validateConfig(config: SmartnessPOEditorConfig): void {
    const required = ['apiToken', 'projectId', 'sourceLang', 'targetLangs', 'frameworks'];
    
    for (const field of required) {
      if (!config[field as keyof SmartnessPOEditorConfig]) {
        throw new Error(`Missing required configuration field: ${field}`);
      }
    }

    // Validate frameworks
    const validFrameworks = ['vue3', 'nuxt3', 'react-native', 'i18next'];
    for (const framework of config.frameworks) {
      if (!validFrameworks.includes(framework)) {
        throw new Error(`Invalid framework: ${framework}. Valid options: ${validFrameworks.join(', ')}`);
      }
    }

    // Validate keyStyle
    if (config.keyStyle && !['dot', 'kebab'].includes(config.keyStyle)) {
      throw new Error(`Invalid keyStyle: ${config.keyStyle}. Valid options: dot, kebab`);
    }
  }

  private createDefaultConfig(): SmartnessPOEditorConfig {
    return {
      apiToken: process.env.POEDITOR_API_TOKEN || '',
      projectId: process.env.POEDITOR_PROJECT_ID || '',
      projectSlug: '',
      sourceLang: process.env.POEDITOR_SOURCE_LANG || 'en',
      targetLangs: process.env.POEDITOR_TARGET_LANGS?.split(',') || ['de', 'es', 'fr', 'it'],
      frameworks: ['vue3', 'nuxt3', 'react-native'],
      keyStyle: 'dot',
      paths: {
        include: [
          'src/**/*.vue',
          'src/**/*.ts',
          'src/**/*.tsx',
          'src/**/*.js',
          'src/**/*.jsx',
          'pages/**/*.vue',
          'components/**/*.vue',
          'layouts/**/*.vue',
        ],
        exclude: [
          'node_modules/**',
          'dist/**',
          'build/**',
          '.next/**',
          '.nuxt/**',
          'coverage/**',
        ],
      },
      namespaceRules: {
        prefix: '',
        maxDepth: 4,
        stopWords: ['the', 'and', 'or', 'but', 'is', 'are', 'was', 'were'],
      },
      resources: {
        vue3: {
          format: 'json',
          outDir: 'src/i18n/locales',
          bundleSplit: 'per-lang',
        },
        nuxt3: {
          format: 'json',
          outDir: 'locales',
          bundleSplit: 'per-lang',
        },
        'react-native': {
          format: 'json',
          outDir: 'src/locales',
          bundleSplit: 'per-lang',
        },
      },
    };
  }

  async saveConfig(config: SmartnessPOEditorConfig, workingDir = process.cwd()): Promise<void> {
    const fullConfigPath = path.resolve(workingDir, this.configPath);
    
    try {
      await fs.writeFile(
        fullConfigPath,
        JSON.stringify(config, null, 2),
        'utf-8'
      );
      
      this.config = config;
      console.error(`Configuration saved to: ${fullConfigPath}`);
    } catch (error) {
      throw new Error(`Failed to save configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async loadCache(projectId: string): Promise<ProjectCache> {
    if (this.cache) {
      return this.cache;
    }

    const cacheFile = path.join(this.cachePath, `${projectId}.cache.json`);
    
    try {
      const cacheContent = await fs.readFile(cacheFile, 'utf-8');
      this.cache = JSON.parse(cacheContent);
      return this.cache!;
    } catch (error) {
      // Create empty cache if file doesn't exist
      this.cache = {
        fileChecksums: {},
        lastRemoteETags: {},
        lastUpdated: new Date().toISOString(),
      };
      return this.cache;
    }
  }

  async saveCache(cache: ProjectCache, projectId: string): Promise<void> {
    const cacheFile = path.join(this.cachePath, `${projectId}.cache.json`);
    
    try {
      // Ensure cache directory exists
      await fs.mkdir(this.cachePath, { recursive: true });
      
      await fs.writeFile(
        cacheFile,
        JSON.stringify(cache, null, 2),
        'utf-8'
      );
      
      this.cache = cache;
    } catch (error) {
      throw new Error(`Failed to save cache: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async clearCache(projectId?: string): Promise<void> {
    if (projectId) {
      const cacheFile = path.join(this.cachePath, `${projectId}.cache.json`);
      try {
        await fs.unlink(cacheFile);
        console.error(`Cache cleared for project: ${projectId}`);
      } catch (error) {
        // Ignore if file doesn't exist
      }
    } else {
      try {
        await fs.rm(this.cachePath, { recursive: true, force: true });
        console.error('All caches cleared');
      } catch (error) {
        // Ignore if directory doesn't exist
      }
    }
    
    this.cache = null;
  }

  // Helper method to get merged configuration with environment variables
  async getEffectiveConfig(workingDir?: string): Promise<SmartnessPOEditorConfig> {
    const config = await this.loadConfig(workingDir);
    
    // Override with environment variables if present
    return {
      ...config,
      apiToken: process.env.POEDITOR_API_TOKEN || config.apiToken,
      projectId: process.env.POEDITOR_PROJECT_ID || config.projectId,
      sourceLang: process.env.POEDITOR_SOURCE_LANG || config.sourceLang,
      targetLangs: process.env.POEDITOR_TARGET_LANGS?.split(',') || config.targetLangs,
    };
  }

  // Utility methods for common configuration tasks
  getFrameworkConfig(framework: string): any {
    return this.config?.resources?.[framework] || {};
  }

  getIncludePatterns(): string[] {
    return this.config?.paths?.include || [];
  }

  getExcludePatterns(): string[] {
    return this.config?.paths?.exclude || [];
  }

  getKeyStyle(): 'dot' | 'kebab' {
    return this.config?.keyStyle || 'dot';
  }

  getNamespaceRules(): any {
    return this.config?.namespaceRules || {};
  }

  // Configuration templates for different project types
  static createSmartchatConfig(): Partial<SmartnessPOEditorConfig> {
    return {
      projectName: 'SmartChat',
      frameworks: ['vue3'],
      paths: {
        include: [
          'src/**/*.vue',
          'src/**/*.ts',
          'src/**/*.js',
        ],
        exclude: [
          'node_modules/**',
          'dist/**',
          'coverage/**',
        ],
      },
      namespaceRules: {
        prefix: 'chat',
        maxDepth: 3,
      },
      resources: {
        vue3: {
          format: 'json',
          outDir: 'src/i18n',
          bundleSplit: 'per-lang',
        },
      },
    };
  }

  static createSmartnessUIConfig(): Partial<SmartnessPOEditorConfig> {
    return {
      projectName: 'Smartness UI',
      frameworks: ['vue3'],
      paths: {
        include: [
          'src/**/*.vue',
          'src/**/*.ts',
          'stories/**/*.ts',
        ],
        exclude: [
          'node_modules/**',
          'dist/**',
          'storybook-static/**',
        ],
      },
      namespaceRules: {
        prefix: 'ui',
        maxDepth: 2,
      },
      resources: {
        vue3: {
          format: 'typescript',
          outDir: 'src/i18n',
          bundleSplit: 'per-namespace',
        },
      },
    };
  }

  static createReactNativeConfig(): Partial<SmartnessPOEditorConfig> {
    return {
      projectName: 'Smartness Chat Mobile',
      frameworks: ['react-native'],
      paths: {
        include: [
          'src/**/*.tsx',
          'src/**/*.ts',
          'src/**/*.jsx',
          'src/**/*.js',
        ],
        exclude: [
          'node_modules/**',
          'android/**',
          'ios/**',
          '.expo/**',
        ],
      },
      namespaceRules: {
        prefix: 'mobile',
        maxDepth: 3,
      },
      resources: {
        'react-native': {
          format: 'json',
          outDir: 'src/locales',
          bundleSplit: 'per-lang',
        },
      },
    };
  }
}