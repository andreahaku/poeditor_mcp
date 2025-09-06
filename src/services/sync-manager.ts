import { POEditorClient, POEditorTermResponse } from './poeditor-client.js';
import { SyncPlan, SyncResult, DetectedKey, POEditorTerm } from '@/types/index.js';
import { POEditorDetector } from './key-detector.js';
import { v4 as uuidv4 } from 'uuid';

export interface SyncPlanOptions {
  projectId: string;
  sourceLang: string;
  includeLangs: string[];
  keys?: DetectedKey[];
  deleteExtraneous: boolean;
}

export interface SyncExecutionOptions {
  plan: SyncPlan;
  batchSize: number;
  direction: 'up';
  machineTranslate: boolean | string[];
  dryRun: boolean;
  rateLimit: number;
}

export class SyncManager {
  private detector: POEditorDetector;

  constructor(private client: POEditorClient) {
    this.detector = new POEditorDetector();
  }

  async createSyncPlan(options: SyncPlanOptions): Promise<SyncPlan> {
    const { projectId, sourceLang, includeLangs, deleteExtraneous } = options;
    let { keys } = options;

    console.error(`Creating sync plan for project ${projectId}...`);

    try {
      // Get local keys if not provided
      if (!keys) {
        console.error('No keys provided, detecting keys from codebase...');
        const result = await this.detector.detectKeys({
          globs: ['src/**/*.{vue,ts,tsx,js,jsx}', 'pages/**/*.vue', 'components/**/*.vue'],
          frameworks: ['vue3', 'nuxt3', 'react-native'],
          sourceLang,
          resourceFormats: ['json', 'typescript'],
          ignore: ['node_modules/**', 'dist/**'],
        });
        keys = result.keys;
        console.error(`Detected ${keys.length} keys from codebase`);
      }

      // Get remote terms
      console.error('Fetching remote terms from POEditor...');
      const remoteTerms = await this.client.listTerms(projectId);
      console.error(`Found ${remoteTerms.length} remote terms`);

      // Get remote translations for included languages
      const remoteTranslations: { [lang: string]: { [term: string]: string } } = {};
      for (const lang of includeLangs) {
        console.error(`Fetching ${lang} translations...`);
        const translations = await this.client.listTranslations(projectId, lang);
        remoteTranslations[lang] = {};
        
        for (const t of translations) {
          if (t.definition?.content) {
            remoteTranslations[lang][t.term] = t.definition.content;
          }
        }
      }

      // Create sync plan
      const plan = this.calculateSyncPlan(keys, remoteTerms, remoteTranslations, {
        deleteExtraneous,
        includeLangs,
      });

      console.error(`Sync plan created:`, {
        adds: plan.stats.adds,
        updates: plan.stats.updates,
        deletes: plan.stats.deletes,
        missing: plan.stats.missing,
      });

      return plan;
    } catch (error) {
      throw new Error(`Failed to create sync plan: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private calculateSyncPlan(
    localKeys: DetectedKey[],
    remoteTerms: POEditorTermResponse[],
    remoteTranslations: { [lang: string]: { [term: string]: string } },
    options: {
      deleteExtraneous: boolean;
      includeLangs: string[];
    }
  ): SyncPlan {
    const localKeyMap = new Map(localKeys.map(k => [k.key, k]));
    const remoteKeyMap = new Map(remoteTerms.map(t => [t.term, t]));

    const addTerms: POEditorTerm[] = [];
    const updateTerms: Array<{ term: string; updates: Partial<POEditorTerm> }> = [];
    const deleteTerms: string[] = [];
    const missingTranslations: { [lang: string]: string[] } = {};
    const obsoleteTranslations: { [lang: string]: string[] } = {};

    // Initialize missing translations
    for (const lang of options.includeLangs) {
      missingTranslations[lang] = [];
      obsoleteTranslations[lang] = [];
    }

    // Find terms to add or update
    for (const [key, localKey] of localKeyMap) {
      const remoteKey = remoteKeyMap.get(key);
      
      if (!remoteKey) {
        // Term doesn't exist remotely - add it
        addTerms.push({
          term: key,
          context: this.extractContext(localKey),
          reference: this.extractReference(localKey),
          tags: this.extractTags(localKey),
          comment: this.generateComment(localKey),
        });

        // Mark as needing translation in all languages
        for (const lang of options.includeLangs) {
          missingTranslations[lang].push(key);
        }
      } else {
        // Term exists - check if update is needed
        const updates = this.calculateTermUpdates(localKey, remoteKey);
        if (Object.keys(updates).length > 0) {
          updateTerms.push({ term: key, updates });
        }

        // Check translation status
        for (const lang of options.includeLangs) {
          if (!remoteTranslations[lang]?.[key]) {
            missingTranslations[lang].push(key);
          }
        }
      }
    }

    // Find terms to delete (if deleteExtraneous is true)
    if (options.deleteExtraneous) {
      for (const [key] of remoteKeyMap) {
        if (!localKeyMap.has(key)) {
          deleteTerms.push(key);

          // Mark translations as obsolete
          for (const lang of options.includeLangs) {
            if (remoteTranslations[lang]?.[key]) {
              obsoleteTranslations[lang].push(key);
            }
          }
        }
      }
    }

    return {
      addTerms,
      updateTerms,
      deleteTerms,
      missingTranslations,
      obsoleteTranslations,
      renameHints: [], // Could be populated by key suggester
      stats: {
        adds: addTerms.length,
        updates: updateTerms.length,
        deletes: deleteTerms.length,
        missing: Object.values(missingTranslations).reduce((sum, arr) => sum + arr.length, 0),
      },
    };
  }

  private extractContext(key: DetectedKey): string | undefined {
    // Extract context from usage examples
    const contexts = key.files
      .map(f => f.context)
      .filter(Boolean)
      .slice(0, 2); // Limit to avoid too much data

    return contexts.length > 0 ? contexts.join('\n---\n') : undefined;
  }

  private extractReference(key: DetectedKey): string | undefined {
    // Create reference from file paths
    const uniquePaths = [...new Set(key.files.map(f => f.path))];
    return uniquePaths.slice(0, 3).join(', '); // Limit to avoid too much data
  }

  private extractTags(key: DetectedKey): string[] | undefined {
    const tags: string[] = [];
    
    // Add framework tags
    tags.push(key.framework);
    
    // Add dynamic tag if key is dynamic
    if (key.dynamic) {
      tags.push('dynamic');
    }

    // Add usage pattern tag
    if (key.usage) {
      tags.push(`usage:${key.usage}`);
    }

    // Extract component/page tags from file paths
    const pathTags = key.files
      .map(f => {
        const parts = f.path.split('/');
        const relevantParts = parts.filter(part => 
          ['components', 'pages', 'views', 'layouts', 'features'].includes(part.toLowerCase())
        );
        return relevantParts.length > 0 ? relevantParts[0] : null;
      })
      .filter(Boolean)
      .slice(0, 2);

    tags.push(...pathTags as string[]);

    return tags.length > 0 ? [...new Set(tags)] : undefined;
  }

  private generateComment(key: DetectedKey): string | undefined {
    const comments: string[] = [];
    
    // Add phrase if different from key
    if (key.phrase && key.phrase !== key.key) {
      comments.push(`Phrase: "${key.phrase}"`);
    }

    // Add usage information
    if (key.files.length > 1) {
      comments.push(`Used in ${key.files.length} files`);
    }

    // Add examples
    if (key.examples.length > 0) {
      const exampleText = key.examples.slice(0, 2).join(', ');
      comments.push(`Examples: ${exampleText}`);
    }

    return comments.length > 0 ? comments.join('; ') : undefined;
  }

  private calculateTermUpdates(localKey: DetectedKey, remoteKey: POEditorTermResponse): Partial<POEditorTerm> {
    const updates: Partial<POEditorTerm> = {};

    // Update context if changed
    const newContext = this.extractContext(localKey);
    if (newContext && newContext !== remoteKey.context) {
      updates.context = newContext;
    }

    // Update reference if changed
    const newReference = this.extractReference(localKey);
    if (newReference && newReference !== remoteKey.reference) {
      updates.reference = newReference;
    }

    // Update tags if changed
    const newTags = this.extractTags(localKey);
    if (newTags && JSON.stringify(newTags.sort()) !== JSON.stringify(remoteKey.tags?.sort())) {
      updates.tags = newTags;
    }

    // Update comment if changed
    const newComment = this.generateComment(localKey);
    if (newComment && newComment !== remoteKey.comment) {
      updates.comment = newComment;
    }

    return updates;
  }

  async executeSync(options: SyncExecutionOptions): Promise<SyncResult> {
    const { plan, batchSize, dryRun, rateLimit, machineTranslate } = options;
    const auditLogId = uuidv4();

    console.error(`${dryRun ? 'DRY RUN: ' : ''}Executing sync plan...`);

    if (dryRun) {
      return {
        created: plan.addTerms.length,
        updated: plan.updateTerms.length,
        deleted: plan.deleteTerms.length,
        mtTriggered: typeof machineTranslate === 'object' ? machineTranslate : [],
        errors: [],
        rateLimitWaits: 0,
        auditLogId,
      };
    }

    const result: SyncResult = {
      created: 0,
      updated: 0,
      deleted: 0,
      mtTriggered: [],
      errors: [],
      rateLimitWaits: 0,
      auditLogId,
    };

    try {
      // Execute term additions in batches
      if (plan.addTerms.length > 0) {
        console.error(`Adding ${plan.addTerms.length} terms in batches of ${batchSize}...`);
        const addResults = await this.client.batchOperation(
          plan.addTerms,
          async (batch) => await this.client.addTerms('project_id', batch),
          batchSize,
          rateLimit * 1000
        );

        result.created = addResults.reduce((sum, r) => sum + r.added, 0);
        result.rateLimitWaits += addResults.length;
      }

      // Execute term updates in batches
      if (plan.updateTerms.length > 0) {
        console.error(`Updating ${plan.updateTerms.length} terms in batches of ${batchSize}...`);
        const updateResults = await this.client.batchOperation(
          plan.updateTerms,
          async (batch) => await this.client.updateTerms('project_id', batch),
          batchSize,
          rateLimit * 1000
        );

        result.updated = updateResults.reduce((sum, r) => sum + r.updated, 0);
        result.rateLimitWaits += updateResults.length;
      }

      // Execute term deletions
      if (plan.deleteTerms.length > 0) {
        console.error(`Deleting ${plan.deleteTerms.length} terms...`);
        const deleteResults = await this.client.batchOperation(
          plan.deleteTerms,
          async (batch) => await this.client.deleteTerms('project_id', batch),
          batchSize,
          rateLimit * 1000
        );

        result.deleted = deleteResults.reduce((sum, r) => sum + r.deleted, 0);
        result.rateLimitWaits += deleteResults.length;
      }

      // Trigger machine translation if requested
      if (machineTranslate && plan.stats.missing > 0) {
        const langsToTranslate = typeof machineTranslate === 'object' ? machineTranslate : 
          Object.keys(plan.missingTranslations).filter(lang => plan.missingTranslations[lang].length > 0);

        console.error(`Triggering machine translation for languages: ${langsToTranslate.join(', ')}`);
        result.mtTriggered = langsToTranslate;
        
        // Note: POEditor's machine translation is typically triggered through the UI
        // or through specific API endpoints that might not be available in all plans
      }

    } catch (error) {
      result.errors.push({
        operation: 'sync',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    console.error(`Sync completed:`, {
      created: result.created,
      updated: result.updated,
      deleted: result.deleted,
      errors: result.errors.length,
    });

    return result;
  }
}