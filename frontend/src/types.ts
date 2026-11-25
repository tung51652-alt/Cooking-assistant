export type { Dish, Prediction, RecipeSource, RecipeSummary, RecipeDetail, RecipeDocument, AssistantSession, AssistantAction, CreateSession, SessionActionRequest, SessionMessageRequest } from '../../packages/cooklens-api/types';
export type View = 'upload' | 'recognition' | 'recipes' | 'assistant';
export interface SelectedImage { file: File; url: string }
