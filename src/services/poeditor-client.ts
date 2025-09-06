import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { POEditorTerm, POEditorTranslation } from '@/types/index.js';

export interface POEditorProject {
  id: number;
  name: string;
  public: boolean;
  open: boolean;
  created: string;
}

export interface POEditorLanguage {
  name: string;
  code: string;
  translations: number;
  percentage: number;
  updated: string;
}

export interface POEditorTermResponse {
  term: string;
  context: string;
  reference: string;
  plural: string;
  tags: string[];
  comment: string;
  created: string;
  updated: string;
}

export interface POEditorTranslationResponse {
  term: string;
  definition: {
    form: string;
    content: string;
  };
  tags: string[];
  reference: string;
  fuzzy: number;
  proofread: number;
  updated: string;
}

export class POEditorClient {
  private client: AxiosInstance;
  private apiToken: string | null = null;
  private baseURL = 'https://api.poeditor.com/v2';

  constructor(apiToken?: string) {
    this.apiToken = apiToken || process.env.POEDITOR_API_TOKEN || null;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 429) {
          throw new Error('Rate limit exceeded. Please wait before making another request.');
        }
        if (error.response?.status === 401) {
          throw new Error('Invalid API token. Please check your POEditor API token.');
        }
        throw error;
      }
    );
  }

  setApiToken(token: string) {
    this.apiToken = token;
  }

  private async makeRequest<T = any>(
    endpoint: string,
    data: Record<string, any> = {}
  ): Promise<T> {
    if (!this.apiToken) {
      throw new Error('POEditor API token is required. Set POEDITOR_API_TOKEN environment variable or call setApiToken()');
    }

    const formData = new URLSearchParams();
    formData.append('api_token', this.apiToken);
    
    // Append all data fields
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, String(value));
        }
      }
    }

    try {
      const response: AxiosResponse = await this.client.post(endpoint, formData);
      
      if (response.data.response?.status !== 'success') {
        throw new Error(`POEditor API error: ${response.data.response?.message || 'Unknown error'}`);
      }

      return response.data.result;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`POEditor API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  // Project management
  async listProjects(): Promise<POEditorProject[]> {
    return this.makeRequest<POEditorProject[]>('/projects/list');
  }

  async getProject(projectId: string): Promise<POEditorProject> {
    return this.makeRequest<POEditorProject>('/projects/view', { id: projectId });
  }

  // Language management
  async listLanguages(projectId: string): Promise<POEditorLanguage[]> {
    return this.makeRequest<POEditorLanguage[]>('/languages/list', { id: projectId });
  }

  async addLanguage(projectId: string, language: string): Promise<void> {
    await this.makeRequest('/languages/add', { id: projectId, language });
  }

  // Terms management
  async listTerms(projectId: string, language?: string): Promise<POEditorTermResponse[]> {
    const params: any = { id: projectId };
    if (language) {
      params.language = language;
    }
    return this.makeRequest<POEditorTermResponse[]>('/terms/list', params);
  }

  async addTerms(projectId: string, terms: POEditorTerm[]): Promise<{ parsed: number; added: number }> {
    const termsData = terms.map(term => ({
      term: term.term,
      context: term.context || '',
      reference: term.reference || '',
      plural: term.plural || '',
      tags: term.tags || [],
      comment: term.comment || '',
    }));

    return this.makeRequest<{ parsed: number; added: number }>('/terms/add', {
      id: projectId,
      data: JSON.stringify(termsData),
    });
  }

  async updateTerms(projectId: string, terms: Array<{
    term: string;
    updates: Partial<POEditorTerm>;
  }>): Promise<{ parsed: number; updated: number }> {
    const termsData = terms.map(({ term, updates }) => ({
      term,
      context: updates.context,
      reference: updates.reference,
      plural: updates.plural,
      tags: updates.tags,
      comment: updates.comment,
    }));

    return this.makeRequest<{ parsed: number; updated: number }>('/terms/update', {
      id: projectId,
      data: JSON.stringify(termsData),
    });
  }

  async deleteTerms(projectId: string, terms: string[]): Promise<{ parsed: number; deleted: number }> {
    const termsData = terms.map(term => ({ term }));

    return this.makeRequest<{ parsed: number; deleted: number }>('/terms/delete', {
      id: projectId,
      data: JSON.stringify(termsData),
    });
  }

  // Translations management
  async listTranslations(
    projectId: string,
    language: string
  ): Promise<POEditorTranslationResponse[]> {
    return this.makeRequest<POEditorTranslationResponse[]>('/translations/list', {
      id: projectId,
      language,
    });
  }

  async addTranslations(
    projectId: string,
    language: string,
    translations: Array<{ term: string; content: string; fuzzy?: boolean }>
  ): Promise<{ parsed: number; added: number; updated: number }> {
    const translationsData = translations.map(t => ({
      term: t.term,
      content: t.content,
      fuzzy: t.fuzzy ? 1 : 0,
    }));

    return this.makeRequest<{ parsed: number; added: number; updated: number }>(
      '/translations/add',
      {
        id: projectId,
        language,
        data: JSON.stringify(translationsData),
      }
    );
  }

  async updateTranslations(
    projectId: string,
    language: string,
    translations: Array<{ term: string; content: string; fuzzy?: boolean }>
  ): Promise<{ parsed: number; updated: number }> {
    const translationsData = translations.map(t => ({
      term: t.term,
      content: t.content,
      fuzzy: t.fuzzy ? 1 : 0,
    }));

    return this.makeRequest<{ parsed: number; updated: number }>(
      '/translations/update',
      {
        id: projectId,
        language,
        data: JSON.stringify(translationsData),
      }
    );
  }

  async deleteTranslations(
    projectId: string,
    language: string,
    terms: string[]
  ): Promise<{ parsed: number; deleted: number }> {
    const translationsData = terms.map(term => ({ term }));

    return this.makeRequest<{ parsed: number; deleted: number }>(
      '/translations/delete',
      {
        id: projectId,
        language,
        data: JSON.stringify(translationsData),
      }
    );
  }

  // Export translations
  async exportTranslations(
    projectId: string,
    language: string,
    type: 'po' | 'pot' | 'mo' | 'xls' | 'csv' | 'resw' | 'resx' | 'android_strings' | 'apple_strings' | 'xliff' | 'properties' | 'key_value_json' | 'json' | 'yml' | 'xmb' | 'xtb' = 'json',
    options: {
      filters?: string[];
      tags?: string[];
      order?: string;
    } = {}
  ): Promise<{ url: string }> {
    return this.makeRequest<{ url: string }>('/projects/export', {
      id: projectId,
      language,
      type,
      ...options,
    });
  }

  // Sync/Upload operations
  async syncTerms(
    projectId: string,
    data: string,
    options: {
      updating?: 'terms' | 'terms_translations' | 'translations';
      language?: string;
      overwrite?: boolean;
      sync_terms?: boolean;
      fuzzy_trigger?: boolean;
      tags?: string;
    } = {}
  ): Promise<{ 
    terms: { parsed: number; added: number; updated: number; deleted: number };
    translations?: { parsed: number; added: number; updated: number; deleted: number };
  }> {
    return this.makeRequest('/projects/sync', {
      id: projectId,
      data,
      ...options,
    });
  }

  // Rate limiting helper
  async withRateLimit<T>(operation: () => Promise<T>, minDelay = 20000): Promise<T> {
    const result = await operation();
    
    // Wait for minimum delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, minDelay));
    
    return result;
  }

  // Batch operations helper
  async batchOperation<T, R>(
    items: T[],
    operation: (batch: T[]) => Promise<R>,
    batchSize = 100,
    rateLimitDelay = 20000
  ): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      console.error(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)}`);
      
      const result = await this.withRateLimit(() => operation(batch), rateLimitDelay);
      results.push(result);
    }
    
    return results;
  }
}