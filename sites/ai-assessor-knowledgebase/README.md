# LexValorum Nebraska Assessor Knowledgebase

This repository is a structured jurisdictional knowledgebase for Nebraska property assessment, equalization, levy, taxation, and assessor-adjacent reasoning.

It is not a document archive. The generated `/knowledgebase` tree is optimized for semantic retrieval, relationship traversal, source traceability, and low-token loading into a ChatGPT Project Knowledge environment.

## Layout

- `/data/seed` canonical seed sources and seed knowledge objects.
- `/scripts` deterministic build and validation scripts.
- `/schemas` JSON schema references for source and knowledge objects.
- `/knowledgebase` generated modular JSON objects and indexes.
- `/reports` generated source coverage, duplicate, gap, relationship, and validation reports.
- `/logs` deterministic build and validation logs.
- `/discovery` source discovery queries and source discovery log.

## Commands

```bash
npm run build
npm run validate
npm run rebuild
```

If `npm` is not available, use Node directly:

```bash
node scripts/build_kb.mjs
node scripts/validate_kb.mjs
```

The build is intentionally idempotent: it rewrites generated JSON from seed inputs, preserves stable IDs, and avoids duplicate canonical objects.

## Source Policy

Every knowledge object must reference source IDs in `/knowledgebase/sources/sources.json`. If a source has no stated publication date, the registry preserves that fact with `publication_date: null` and a `publication_date_note`; validation reports those as warnings instead of inventing dates.

## Current Scope

The first release seeds the canonical ontology, official Nebraska legal/PAD source registry, IAAO standards, TERC appeal workflow, levy/tax mechanics, key ratio-study concepts, public guidance, and research/theory crosswalks. Future ingestion should add parsed PAD R&O JSON, CTL history, assessor calendar data, levy history, property tax credit data, valuation group data, county statistical history, and county-specific workflow materials.
