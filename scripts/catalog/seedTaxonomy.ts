/**
 * Creates the fixed taxonomy docs (collections, scentFamilies, occasions) if they are missing.
 * Create-only: an existing doc is never modified, so the owner's edits in the admin dashboard
 * survive re-runs. Descriptions and header images start empty for the owner to fill in.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { TAXONOMY_SLUGS, TAXONOMY_SEED_NAMES, type TaxonomyKind } from '../../src/lib/taxonomy';

export interface SeedTaxonomyReport {
  created: string[];
  existing: string[];
}

export async function seedTaxonomy(db: Firestore, opts: { dryRun?: boolean } = {}): Promise<SeedTaxonomyReport> {
  const report: SeedTaxonomyReport = { created: [], existing: [] };
  const now = new Date().toISOString();
  for (const kind of Object.keys(TAXONOMY_SLUGS) as TaxonomyKind[]) {
    for (const [index, slug] of TAXONOMY_SLUGS[kind].entries()) {
      const ref = db.collection(kind).doc(slug);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) {
          report.existing.push(`${kind}/${slug}`);
          return;
        }
        if (!opts.dryRun) {
          tx.create(ref, {
            slug,
            name: TAXONOMY_SEED_NAMES[kind][slug],
            description: '',
            headerImage: '',
            sortOrder: index,
            createdAt: now,
            updatedAt: now
          });
        }
        report.created.push(`${kind}/${slug}`);
      });
    }
  }
  return report;
}
