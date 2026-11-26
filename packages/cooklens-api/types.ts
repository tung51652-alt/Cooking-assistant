import type { components } from '../../frontend/src/generated/api';
export type Dish = components['schemas']['Dish'];
export type Prediction = components['schemas']['Prediction'];
export type RecipeSource = components['schemas']['Source'];
export type RecipeSummary = components['schemas']['RecipeSummary'];
export type RecipeDetail = components['schemas']['Recipe'];
export type RecipeDocument = Pick<components['schemas']['DetailResponse'], 'corpus_version' | 'recipe'>;
export type AssistantSession = components['schemas']['Session'];
export type AssistantAction = components['schemas']['SessionAction']['action'];
export type CreateSession = components['schemas']['CreateSession'];
export type SessionActionRequest = components['schemas']['SessionAction'];
export type SessionMessageRequest = components['schemas']['SessionMessage'];

export type LlmProviderPreset = 'gemini' | 'openai' | 'nvidia' | 'custom';
export interface LlmUserConfig {
  provider: LlmProviderPreset;
  base_url?: string;
  model: string;
  api_key: string;
}
export interface LlmTestResult {
  ok: boolean;
  provider: string;
  model: string;
  reply: string;
  latency_ms: number;
}
