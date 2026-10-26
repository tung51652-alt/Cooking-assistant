export type { Dish, Prediction, RecipeSource, RecipeSummary, RecipeDetail } from '../../packages/cooklens-api/types';
export type View = 'upload' | 'recognition' | 'recipes';
export interface SelectedImage { file: File; url: string }
