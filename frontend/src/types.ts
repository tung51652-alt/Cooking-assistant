import type { components } from './generated/api';

export type Dish = components['schemas']['Dish'];
export type Prediction = components['schemas']['Prediction'];
export type RecipeSource = components['schemas']['Source'];
export type RecipeSummary = components['schemas']['RecipeSummary'];
export type RecipeDetail = components['schemas']['Recipe'];
export type View = 'upload' | 'recognition' | 'recipes';
export interface SelectedImage { file: File; url: string }
