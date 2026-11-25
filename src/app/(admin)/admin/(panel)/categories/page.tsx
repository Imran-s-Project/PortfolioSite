'use client';
import { TaxonomyManager } from '@/features/admin/TaxonomyManager';

export default function CategoriesPage() {
  return <TaxonomyManager collectionName="blogCategories" withDescription />;
}
