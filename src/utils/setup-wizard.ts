import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'fast-glob';
import { POEditorClient } from '@/services/poeditor-client.js';
import { ConfigManager } from './config.js';

export interface SetupOptions {
  interactive?: boolean;
  projectPath?: string;
  apiToken?: string;
  projectId?: string;
  frameworks?: string[];
}

export interface ProjectDetectionResult {
  detectedFrameworks: string[];
  suggestedGlobs: string[];
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'unknown';
  hasExistingI18n: boolean;
  existingConfigFiles: string[];
}

export class SetupWizard {
  private configManager: ConfigManager;
  private client: POEditorClient;

  constructor() {
    this.configManager = new ConfigManager();
    this.client = new POEditorClient();
  }

  async detectProject(projectPath = process.cwd()): Promise<ProjectDetectionResult> {
    const result: ProjectDetectionResult = {
      detectedFrameworks: [],
      suggestedGlobs: [],
      packageManager: 'unknown',
      hasExistingI18n: false,
      existingConfigFiles: []
    };

    try {
      // Detect package manager
      const packageFiles = await glob(['package.json', 'pnpm-lock.yaml', 'yarn.lock', 'package-lock.json'], {
        cwd: projectPath,
        absolute: false
      });
      
      if (packageFiles.includes('pnpm-lock.yaml')) {
        result.packageManager = 'pnpm';
      } else if (packageFiles.includes('yarn.lock')) {
        result.packageManager = 'yarn';
      } else if (packageFiles.includes('package-lock.json')) {
        result.packageManager = 'npm';
      }

      // Read package.json to detect frameworks
      const packageJsonPath = path.join(projectPath, 'package.json');
      try {
        const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageContent);
        const allDeps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };

        // Detect frameworks based on dependencies
        if (allDeps.vue || allDeps['@vue/cli-service'] || allDeps.vite) {
          result.detectedFrameworks.push('vue3');
          result.suggestedGlobs.push('src/**/*.vue', 'src/**/*.ts', 'src/**/*.js');
        }
        if (allDeps.nuxt || allDeps['@nuxt/kit']) {
          result.detectedFrameworks.push('nuxt3');
          result.suggestedGlobs.push('pages/**/*.vue', 'components/**/*.vue', 'plugins/**/*.ts');
        }
        if (allDeps['react-native'] || allDeps.react) {
          result.detectedFrameworks.push('react-native');
          result.suggestedGlobs.push('src/**/*.{tsx,jsx}', 'app/**/*.{tsx,jsx}');
        }
        if (allDeps.i18next || allDeps['react-i18next'] || allDeps['vue-i18n']) {
          result.hasExistingI18n = true;
        }
      } catch (error) {
        console.warn('Could not read package.json:', error instanceof Error ? error.message : String(error));
      }

      // Look for existing configuration files
      const configFiles = await glob([
        '.smartness-i18n.json',
        'i18n.config.js',
        'i18n.config.ts',
        'nuxt.config.js',
        'nuxt.config.ts',
        'vue.config.js'
      ], { cwd: projectPath });
      result.existingConfigFiles = configFiles;

      // Look for existing i18n directories
      const i18nDirs = await glob(['src/i18n', 'src/locales', 'locales', 'lang'], {
        cwd: projectPath,
        onlyDirectories: true
      });
      if (i18nDirs.length > 0) {
        result.hasExistingI18n = true;
      }

      // Default globs if none detected
      if (result.suggestedGlobs.length === 0) {
        result.suggestedGlobs = ['src/**/*.{vue,ts,tsx,jsx,js}'];
      }

    } catch (error) {
      console.warn('Project detection failed:', error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  async validateApiToken(apiToken: string): Promise<{ valid: boolean; projects?: any[]; error?: string }> {
    try {
      this.client.setApiToken(apiToken);
      const projects = await this.client.listProjects();
      return { valid: true, projects };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async generateConfig(options: {
    apiToken: string;
    projectId: string;
    frameworks: string[];
    globs: string[];
    sourceLang?: string;
    targetLangs?: string[];
    projectPath?: string;
  }): Promise<string> {
    const {
      apiToken,
      projectId,
      frameworks,
      globs,
      sourceLang = 'en',
      targetLangs = ['de', 'es', 'fr', 'it'],
      projectPath = process.cwd()
    } = options;

    const config = {
      apiToken,
      projectId,
      sourceLang,
      targetLangs,
      frameworks,
      keyStyle: 'dot',
      paths: {
        include: globs,
        exclude: [
          'node_modules/**',
          'dist/**',
          'build/**',
          '.nuxt/**',
          '.next/**'
        ]
      },
      namespaceRules: {
        prefix: '',
        maxDepth: 4,
        stopWords: ['the', 'and', 'or', 'a', 'an']
      },
      resources: this.generateResourceConfig(frameworks)
    };

    // Write .env file
    const envPath = path.join(projectPath, '.env');
    const envContent = `# POEditor MCP Configuration
POEDITOR_API_TOKEN=${apiToken}
POEDITOR_PROJECT_ID=${projectId}
POEDITOR_SOURCE_LANG=${sourceLang}
POEDITOR_TARGET_LANGS=${targetLangs.join(',')}
POEDITOR_RATE_LIMIT_DELAY=20000
POEDITOR_BATCH_SIZE=100
`;

    await fs.writeFile(envPath, envContent, 'utf-8');

    // Write configuration file
    const configPath = path.join(projectPath, '.smartness-i18n.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    return configPath;
  }

  private generateResourceConfig(frameworks: string[]) {
    const resourceConfig: any = {};

    for (const framework of frameworks) {
      switch (framework) {
        case 'vue3':
        case 'nuxt3':
          resourceConfig[framework] = {
            format: 'json',
            outDir: 'src/i18n/locales',
            bundleSplit: 'per-lang'
          };
          break;
        case 'react-native':
          resourceConfig[framework] = {
            format: 'json',
            outDir: 'src/locales',
            bundleSplit: 'per-lang'
          };
          break;
        case 'i18next':
          resourceConfig[framework] = {
            format: 'json',
            outDir: 'public/locales',
            bundleSplit: 'per-lang'
          };
          break;
      }
    }

    return resourceConfig;
  }

  async validateConfiguration(configPath?: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    suggestions: string[];
  }> {
    const result = {
      valid: true,
      errors: [] as string[],
      warnings: [] as string[],
      suggestions: [] as string[]
    };

    try {
      // Try to load configuration
      const config = await this.configManager.loadConfig(configPath);
      
      // Validate API token
      if (!config.apiToken) {
        result.errors.push('Missing POEDITOR_API_TOKEN in environment or config');
        result.valid = false;
      } else {
        const tokenValidation = await this.validateApiToken(config.apiToken);
        if (!tokenValidation.valid) {
          result.errors.push(`Invalid API token: ${tokenValidation.error}`);
          result.valid = false;
        }
      }

      // Validate project ID
      if (!config.projectId) {
        result.errors.push('Missing POEDITOR_PROJECT_ID in environment or config');
        result.valid = false;
      }

      // Validate frameworks
      if (!config.frameworks || config.frameworks.length === 0) {
        result.errors.push('No frameworks specified. Add frameworks like ["vue3", "react-native"]');
        result.valid = false;
      }

      // Validate file patterns
      if (!config.paths?.include || config.paths.include.length === 0) {
        result.errors.push('No include patterns specified. Add file patterns like ["src/**/*.vue"]');
        result.valid = false;
      }

      // Check if include patterns match any files
      const matchedFiles = await glob(config.paths.include, {
        ignore: config.paths.exclude || [],
        absolute: false
      });
      
      if (matchedFiles.length === 0) {
        result.warnings.push(`Include patterns don't match any files: ${config.paths.include.join(', ')}`);
        result.suggestions.push('Review your file patterns or project structure');
      } else if (matchedFiles.length > 1000) {
        result.warnings.push(`Include patterns match many files (${matchedFiles.length}). Consider more specific patterns for better performance.`);
      }

      // Check for common issues
      if (config.keyStyle && !['dot', 'kebab'].includes(config.keyStyle)) {
        result.warnings.push(`Unknown keyStyle "${config.keyStyle}". Use "dot" or "kebab"`);
      }

      // Suggest improvements
      if (!config.namespaceRules?.maxDepth) {
        result.suggestions.push('Consider setting namespaceRules.maxDepth to prevent overly nested keys');
      }

      if (config.targetLangs && config.targetLangs.length === 0) {
        result.suggestions.push('Add target languages for translation');
      }

    } catch (error) {
      result.errors.push(`Configuration validation failed: ${error instanceof Error ? error.message : String(error)}`);
      result.valid = false;
    }

    return result;
  }

  async createSampleFiles(projectPath: string, frameworks: string[]): Promise<void> {
    // Create sample i18n files for each framework
    for (const framework of frameworks) {
      await this.createFrameworkSamples(projectPath, framework);
    }
  }

  private async createFrameworkSamples(projectPath: string, framework: string): Promise<void> {
    switch (framework) {
      case 'vue3':
        await this.createVueSamples(projectPath);
        break;
      case 'nuxt3':
        await this.createNuxtSamples(projectPath);
        break;
      case 'react-native':
        await this.createReactNativeSamples(projectPath);
        break;
    }
  }

  private async createVueSamples(projectPath: string): Promise<void> {
    const i18nDir = path.join(projectPath, 'src/i18n');
    const localesDir = path.join(i18nDir, 'locales');

    // Ensure directories exist
    await fs.mkdir(localesDir, { recursive: true });

    // Create sample translation files
    const sampleEn = {
      common: {
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        edit: 'Edit'
      },
      auth: {
        login: 'Login',
        logout: 'Logout',
        register: 'Register'
      }
    };

    await fs.writeFile(
      path.join(localesDir, 'en.json'),
      JSON.stringify(sampleEn, null, 2),
      'utf-8'
    );

    // Create i18n setup file
    const i18nSetup = `import { createI18n } from 'vue-i18n';
import en from './locales/en.json';

export const i18n = createI18n({
  locale: 'en',
  fallbackLocale: 'en',
  messages: {
    en
  }
});

export default i18n;
`;

    await fs.writeFile(path.join(i18nDir, 'index.ts'), i18nSetup, 'utf-8');
  }

  private async createNuxtSamples(projectPath: string): Promise<void> {
    // Create nuxt.config.ts i18n configuration
    const nuxtConfigPath = path.join(projectPath, 'nuxt.config.ts');
    const i18nConfig = `
// Add to your nuxt.config.ts modules
export default defineNuxtConfig({
  modules: ['@nuxtjs/i18n'],
  i18n: {
    locales: ['en', 'de', 'es', 'fr', 'it'],
    defaultLocale: 'en',
    vueI18n: './i18n.config.ts'
  }
})
`;

    console.log('Nuxt configuration sample created. Add the i18n module to your nuxt.config.ts');
  }

  private async createReactNativeSamples(projectPath: string): Promise<void> {
    const localesDir = path.join(projectPath, 'src/locales');
    await fs.mkdir(localesDir, { recursive: true });

    const sampleEn = {
      'common.save': 'Save',
      'common.cancel': 'Cancel',
      'auth.login': 'Login',
      'auth.logout': 'Logout'
    };

    await fs.writeFile(
      path.join(localesDir, 'en.json'),
      JSON.stringify(sampleEn, null, 2),
      'utf-8'
    );

    // Create i18n setup
    const i18nSetup = `import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en }
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
`;

    await fs.writeFile(path.join(localesDir, 'i18n.ts'), i18nSetup, 'utf-8');
  }
}