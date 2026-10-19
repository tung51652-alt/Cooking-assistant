export interface Dish {
  class_id: number;
  normalized_dish: string;
  display_name: string;
}

export interface Prediction extends Dish {
  rank: number;
  confidence: number;
}

export interface RecipeSource {
  name: string;
  url: string;
  license: string;
  attribution: string;
}

export interface RecipeSummary {
  id: string;
  title: string;
  normalized_dish: string;
  servings: number | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  preview: string;
  source: RecipeSource;
}

export interface RecipeDetail extends Omit<RecipeSummary, 'preview'> {
  ingredients: { name: string; quantity: number | null; unit: string | null; note: string | null }[];
  instructions: { step: number; text: string; duration_minutes: number | null }[];
}

export type View = 'upload' | 'recognition' | 'recipes';

export interface SelectedImage { file: File; url: string }
