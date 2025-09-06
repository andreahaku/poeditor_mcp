import { HardcodedString } from './key-detector.js';

export interface TranslationRequest {
  text: string;
  sourceLanguage: 'en' | 'it';
  targetLanguages: string[];
  context?: string;
}

export interface TranslationResult {
  sourceText: string;
  sourceLanguage: 'en' | 'it';
  translations: Record<string, string>;
  confidence: number;
  detectedLanguage?: string;
}

export class TranslationService {
  private targetLanguages = ['en', 'de', 'es', 'fr', 'it'];

  async translateStrings(
    hardcodedStrings: HardcodedString[],
    targetLanguages: string[] = this.targetLanguages
  ): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];

    console.error(`Translating ${hardcodedStrings.length} strings to ${targetLanguages.join(', ')}...`);

    for (const hardcodedString of hardcodedStrings) {
      try {
        const result = await this.translateSingleString({
          text: hardcodedString.text,
          sourceLanguage: hardcodedString.language,
          targetLanguages,
          context: hardcodedString.context,
        });

        results.push(result);
      } catch (error) {
        console.error(`Failed to translate "${hardcodedString.text}":`, error);
        
        // Create fallback result
        const fallbackTranslations: Record<string, string> = {};
        targetLanguages.forEach(lang => {
          fallbackTranslations[lang] = hardcodedString.text; // Use original text as fallback
        });

        results.push({
          sourceText: hardcodedString.text,
          sourceLanguage: hardcodedString.language,
          translations: fallbackTranslations,
          confidence: 0.1, // Low confidence for fallbacks
          detectedLanguage: hardcodedString.language,
        });
      }
    }

    console.error(`Translation complete: ${results.length} strings translated`);
    return results;
  }

  private async translateSingleString(request: TranslationRequest): Promise<TranslationResult> {
    // Create a comprehensive prompt for the LLM
    const prompt = this.buildTranslationPrompt(request);

    try {
      // This would use an LLM service - for now we'll use a mock implementation
      // In production, this would integrate with OpenAI, Claude, or another LLM service
      const llmResponse = await this.callLLM(prompt);
      
      return this.parseTranslationResponse(request, llmResponse);
    } catch (error) {
      console.error('LLM translation failed:', error);
      throw new Error(`Translation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private buildTranslationPrompt(request: TranslationRequest): string {
    const { text, sourceLanguage, targetLanguages, context } = request;
    
    const sourceLanguageName = sourceLanguage === 'en' ? 'English' : 'Italian';
    const targetLanguageNames = targetLanguages.map(lang => {
      switch (lang) {
        case 'en': return 'English';
        case 'it': return 'Italian';
        case 'de': return 'German';
        case 'es': return 'Spanish';
        case 'fr': return 'French';
        default: return lang.toUpperCase();
      }
    });

    const contextInfo = context ? `\n\nContext: This text appears in a ${context} context in a web application.` : '';

    return `You are a professional translator specializing in software localization. Please translate the following text from ${sourceLanguageName} to ${targetLanguageNames.join(', ')}.

Source text (${sourceLanguageName}): "${text}"${contextInfo}

Please provide translations that are:
1. Contextually appropriate for software/web applications
2. Natural and idiomatic in each target language
3. Consistent with common UI terminology
4. Brief and suitable for user interface elements

Also, please confirm the detected source language of the text.

Respond in the following JSON format:
{
  "detectedLanguage": "en|it",
  "translations": {
    ${targetLanguages.map(lang => `"${lang}": "translated text in ${lang}"`).join(',\n    ')}
  },
  "confidence": 0.95
}

Only return the JSON response, no additional text.`;
  }

  private async callLLM(prompt: string): Promise<string> {
    // Mock implementation - in production, this would call an actual LLM service
    // For now, we'll provide some basic translations for common terms
    
    const mockTranslations = this.getMockTranslations(prompt);
    if (mockTranslations) {
      return mockTranslations;
    }

    // Fallback mock response
    return JSON.stringify({
      detectedLanguage: "en",
      translations: {
        "en": "Save",
        "it": "Salva",
        "de": "Speichern", 
        "es": "Guardar",
        "fr": "Sauvegarder"
      },
      confidence: 0.8
    });
  }

  private getMockTranslations(prompt: string): string | null {
    // Extract the source text from the prompt
    const textMatch = prompt.match(/Source text \([^)]+\): "([^"]+)"/);
    if (!textMatch) return null;
    
    const sourceText = textMatch[1].toLowerCase();
    
    // Common UI terms translations
    const translations: Record<string, Record<string, string>> = {
      'save': {
        en: 'Save',
        it: 'Salva',
        de: 'Speichern',
        es: 'Guardar',
        fr: 'Sauvegarder'
      },
      'delete': {
        en: 'Delete',
        it: 'Elimina',
        de: 'Löschen',
        es: 'Eliminar',
        fr: 'Supprimer'
      },
      'edit': {
        en: 'Edit',
        it: 'Modifica',
        de: 'Bearbeiten',
        es: 'Editar',
        fr: 'Modifier'
      },
      'cancel': {
        en: 'Cancel',
        it: 'Annulla',
        de: 'Abbrechen',
        es: 'Cancelar',
        fr: 'Annuler'
      },
      'confirm': {
        en: 'Confirm',
        it: 'Conferma',
        de: 'Bestätigen',
        es: 'Confirmar',
        fr: 'Confirmer'
      },
      'submit': {
        en: 'Submit',
        it: 'Invia',
        de: 'Senden',
        es: 'Enviar',
        fr: 'Soumettre'
      },
      'create': {
        en: 'Create',
        it: 'Crea',
        de: 'Erstellen',
        es: 'Crear',
        fr: 'Créer'
      },
      'update': {
        en: 'Update',
        it: 'Aggiorna',
        de: 'Aktualisieren',
        es: 'Actualizar',
        fr: 'Mettre à jour'
      },
      'click here': {
        en: 'Click here',
        it: 'Clicca qui',
        de: 'Hier klicken',
        es: 'Haz clic aquí',
        fr: 'Cliquez ici'
      },
      'loading': {
        en: 'Loading',
        it: 'Caricamento',
        de: 'Laden',
        es: 'Cargando',
        fr: 'Chargement'
      },
      'please wait': {
        en: 'Please wait',
        it: 'Attendere prego',
        de: 'Bitte warten',
        es: 'Por favor espere',
        fr: 'Veuillez patienter'
      },
      'error': {
        en: 'Error',
        it: 'Errore',
        de: 'Fehler',
        es: 'Error',
        fr: 'Erreur'
      },
      'success': {
        en: 'Success',
        it: 'Successo',
        de: 'Erfolg',
        es: 'Éxito',
        fr: 'Succès'
      }
    };

    // Check for exact matches first
    if (translations[sourceText]) {
      return JSON.stringify({
        detectedLanguage: "en",
        translations: translations[sourceText],
        confidence: 0.95
      });
    }

    // Check for partial matches
    for (const [key, trans] of Object.entries(translations)) {
      if (sourceText.includes(key) || key.includes(sourceText)) {
        return JSON.stringify({
          detectedLanguage: "en",
          translations: trans,
          confidence: 0.85
        });
      }
    }

    return null;
  }

  private parseTranslationResponse(request: TranslationRequest, response: string): TranslationResult {
    try {
      const parsed = JSON.parse(response);
      
      return {
        sourceText: request.text,
        sourceLanguage: request.sourceLanguage,
        translations: parsed.translations || {},
        confidence: parsed.confidence || 0.5,
        detectedLanguage: parsed.detectedLanguage || request.sourceLanguage,
      };
    } catch (error) {
      console.error('Failed to parse LLM response:', response);
      throw new Error('Invalid translation response format');
    }
  }

  // Method to integrate with actual LLM services in production
  async integrateWithLLMService(serviceConfig: {
    provider: 'openai' | 'claude' | 'custom';
    apiKey?: string;
    endpoint?: string;
    model?: string;
  }): Promise<void> {
    // This would be implemented to integrate with actual LLM services
    console.log('LLM service integration configuration:', serviceConfig);
    
    // TODO: Implement actual LLM service integration
    // - OpenAI GPT integration
    // - Claude API integration  
    // - Custom LLM endpoint integration
  }
}