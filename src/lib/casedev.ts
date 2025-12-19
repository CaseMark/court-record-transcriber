/**
 * Case.dev API Client
 * Handles interactions with Convert, Voice, and Vaults APIs
 */

const CASEDEV_API_KEY = process.env.CASEDEV_API_KEY;
const CASEDEV_BASE_URL = 'https://api.case.dev';

interface ConvertJobResponse {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  source_url: string;
  output_url?: string;
  output_urls?: string[];
  metadata?: {
    recording_date?: string;
    duration_seconds?: number;
    channels?: number;
    court?: string;
    case_number?: string;
    ftr_version?: string;
  };
  error?: string;
}

interface TranscriptionJobResponse {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  audio_url: string;
  audio_duration?: number;
  confidence?: number; // Overall transcription confidence (0-1)
  text?: string;
  utterances?: Array<{
    speaker: string;
    text: string;
    start: number; // milliseconds
    end: number;
    confidence?: number; // Per-utterance confidence when available
  }>;
  chapters?: Array<{
    headline: string;
    summary: string;
    start: number;
    end: number;
  }>;
  summary?: string; // AI-generated summary when summarization is enabled
  error?: string;
}

interface VaultResponse {
  id: string;
  name: string;
  description?: string;
  filesBucket: string;
  vectorBucket: string;
  indexName: string;
  region: string;
  createdAt: string;
}

interface UploadUrlResponse {
  objectId: string;
  uploadUrl: string;
  expiresIn: number;
  instructions: {
    method: string;
    headers: Record<string, string>;
  };
}

interface SearchResult {
  text: string;
  object_id: string;
  chunk_index: number;
  hybridScore: number;
  vectorScore: number;
  bm25Score: number;
}

interface SearchResponse {
  method: string;
  query: string;
  chunks: SearchResult[];
  sources: Array<{
    id: string;
    filename: string;
    pageCount?: number;
  }>;
}

class CaseDevClient {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    if (!CASEDEV_API_KEY) {
      console.warn('CASEDEV_API_KEY not set - Case.dev API calls will fail');
    }
    this.apiKey = CASEDEV_API_KEY || '';
    this.baseUrl = CASEDEV_BASE_URL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.apiKey) {
      throw new Error('CASEDEV_API_KEY is not configured. Please set it in your .env.local file.');
    }

    const url = `${this.baseUrl}${endpoint}`;
    
    // Log the request for debugging
    console.log(`[CaseDevClient] ${options.method || 'GET'} ${endpoint}`);
    if (options.body) {
      console.log(`[CaseDevClient] Request body:`, options.body);
    }
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorBody: Record<string, unknown> = {};
      try {
        errorBody = JSON.parse(errorText);
      } catch {
        errorBody = { raw: errorText };
      }
      
      // Log full error for debugging
      console.error(`[CaseDevClient] API Error ${response.status}:`, errorBody);
      
      // Handle various error response formats from the API
      const errorMessage = 
        (typeof errorBody.error === 'string' ? errorBody.error : null) ||
        (typeof errorBody.message === 'string' ? errorBody.message : null) ||
        (typeof errorBody.detail === 'string' ? errorBody.detail : null) ||
        `API request failed: ${response.status} ${response.statusText}`;
      throw new Error(`${errorMessage} (${response.status})`);
    }

    return response.json();
  }

  // ============ CONVERT API ============

  /**
   * Convert FTR court recording to M4A
   */
  async convertFTR(
    sourceUrl: string,
    webhookUrl?: string,
    options?: { preserve_channels?: boolean; output_format?: string }
  ): Promise<ConvertJobResponse> {
    return this.request<ConvertJobResponse>('/convert/v1/process', {
      method: 'POST',
      body: JSON.stringify({
        source_url: sourceUrl,
        webhook_url: webhookUrl,
        options: options || { output_format: 'm4a' },
      }),
    });
  }

  /**
   * Get conversion job status
   */
  async getConvertJob(jobId: string): Promise<ConvertJobResponse> {
    return this.request<ConvertJobResponse>(`/convert/v1/jobs/${jobId}`);
  }

  // ============ VOICE API ============

  /**
   * Create transcription job
   */
  async createTranscription(params: {
    audio_url: string;
    speaker_labels?: boolean;
    language_code?: string;
    auto_chapters?: boolean;
    webhook_url?: string;
    word_boost?: string[];
    summarization?: boolean;
  }): Promise<TranscriptionJobResponse> {
    return this.request<TranscriptionJobResponse>('/voice/transcription', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Get transcription job status and results
   */
  async getTranscription(jobId: string): Promise<TranscriptionJobResponse> {
    return this.request<TranscriptionJobResponse>(`/voice/transcription/${jobId}`);
  }

  // ============ VAULTS API ============

  /**
   * Create a new vault
   */
  async createVault(params: {
    name: string;
    description?: string;
    enableGraph?: boolean;
  }): Promise<VaultResponse> {
    return this.request<VaultResponse>('/vault', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * List all vaults
   */
  async listVaults(): Promise<{ vaults: VaultResponse[]; total: number }> {
    return this.request('/vault');
  }

  /**
   * Get upload URL for a file
   */
  async getUploadUrl(
    vaultId: string,
    params: {
      filename: string;
      contentType: string;
      metadata?: Record<string, unknown>;
      auto_index?: boolean;
    }
  ): Promise<UploadUrlResponse> {
    return this.request<UploadUrlResponse>(`/vault/${vaultId}/upload`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Trigger ingestion for an uploaded file
   */
  async ingestFile(vaultId: string, objectId: string): Promise<{
    objectId: string;
    workflowId: string;
    status: string;
    message: string;
  }> {
    return this.request(`/vault/${vaultId}/ingest/${objectId}`, {
      method: 'POST',
    });
  }

  /**
   * Search within a vault
   */
  async searchVault(
    vaultId: string,
    params: {
      query: string;
      method?: 'hybrid' | 'fast' | 'global' | 'local';
      topK?: number;
      filters?: Record<string, unknown>;
    }
  ): Promise<SearchResponse> {
    return this.request<SearchResponse>(`/vault/${vaultId}/search`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Get object details including download URL
   */
  async getObject(vaultId: string, objectId: string): Promise<{
    id: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    downloadUrl: string;
    expiresIn: number;
    ingestionStatus: string;
  }> {
    return this.request(`/vault/${vaultId}/objects/${objectId}`);
  }

  /**
   * Get extracted text from an object
   */
  async getObjectText(vaultId: string, objectId: string): Promise<{
    objectId: string;
    filename: string;
    text: string;
    textLength: number;
  }> {
    return this.request(`/vault/${vaultId}/objects/${objectId}/text`);
  }
}

// Export singleton instance
export const casedev = new CaseDevClient();

// Export types
export type {
  ConvertJobResponse,
  TranscriptionJobResponse,
  VaultResponse,
  UploadUrlResponse,
  SearchResult,
  SearchResponse,
};
