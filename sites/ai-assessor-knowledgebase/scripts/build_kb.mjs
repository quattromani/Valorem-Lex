import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const stableGeneratedAt = "2026-05-20T00:00:00-05:00";
const accessedDate = "2026-05-20";

const outputDirs = {
  concept: "concepts",
  statute: "statutes",
  constitution: "constitution",
  procedure: "procedures",
  timeline: "timelines",
  standard: "standards",
  glossary: "glossary",
  case: "cases",
  workflow: "workflows",
  source: "sources",
  crosswalk: "crosswalks",
  metric: "metrics",
  valuation: "valuation",
  equalization: "equalization",
  levy: "levies",
  tax: "taxes",
  form: "forms",
  deadline: "deadlines",
  county_data: "county_data",
  pad: "pad",
  iaao: "iaao",
  research: "research",
  cama: "cama",
  public_guidance: "public_guidance"
};

async function readJson(relativePath) {
  const fullPath = path.join(root, relativePath);
  return JSON.parse(await fs.readFile(fullPath, "utf8"));
}

async function readOptionalJson(relativePath, fallback) {
  try {
    return await readJson(relativePath);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(relativePath, data) {
  const fullPath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, `${JSON.stringify(data, null, 2)}\n`);
}

function countBy(items, selector) {
  return items.reduce((acc, item) => {
    const key = selector(item) ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function flattenTopicCounts(sources) {
  const counts = {};
  for (const source of sources) {
    for (const topic of source.topics ?? []) {
      counts[topic] = (counts[topic] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function duplicateTermReport(objects) {
  const bucket = new Map();
  for (const object of objects) {
    const terms = [object.canonical_term, ...(object.aliases ?? [])]
      .filter(Boolean)
      .map((term) => term.toLowerCase().trim());
    for (const term of terms) {
      if (!bucket.has(term)) bucket.set(term, []);
      bucket.get(term).push(object.id);
    }
  }
  return [...bucket.entries()]
    .filter(([, ids]) => new Set(ids).size > 1)
    .map(([term, ids]) => ({ term, object_ids: [...new Set(ids)].sort() }))
    .sort((a, b) => a.term.localeCompare(b.term));
}

function sourceUsage(objects) {
  const usage = {};
  for (const object of objects) {
    for (const ref of object.source_refs ?? []) {
      usage[ref.source_id] = usage[ref.source_id] ?? { object_count: 0, object_ids: [] };
      usage[ref.source_id].object_count += 1;
      usage[ref.source_id].object_ids.push(object.id);
    }
  }
  return Object.fromEntries(
    Object.entries(usage)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sourceId, value]) => [
        sourceId,
        { object_count: value.object_count, object_ids: value.object_ids.sort() }
      ])
  );
}

function relationshipEdges(objects) {
  return objects
    .flatMap((object) =>
      (object.relationships ?? []).map((relationship) => ({
        from_id: object.id,
        relationship_type: relationship.type,
        to_id: relationship.target_id,
        note: relationship.note ?? null
      }))
    )
    .sort((a, b) =>
      `${a.from_id}:${a.relationship_type}:${a.to_id}`.localeCompare(
        `${b.from_id}:${b.relationship_type}:${b.to_id}`
      )
    );
}

async function resetGeneratedTree() {
  for (const relativePath of ["knowledgebase", "reports", "logs", "discovery"]) {
    await fs.rm(path.join(root, relativePath), { recursive: true, force: true });
    await fs.mkdir(path.join(root, relativePath), { recursive: true });
  }
  for (const dir of Object.values(outputDirs)) {
    await fs.mkdir(path.join(root, "knowledgebase", dir), { recursive: true });
  }
}

async function main() {
  const sourceSeed = await readJson("data/seed/sources.seed.json");
  const knowledgeSeed = await readJson("data/seed/knowledge.seed.json");
  const optionalSeedFiles = [
    "data/seed/authority_catalog.seed.json",
    "data/seed/operational_readiness.seed.json",
    "data/seed/tif_microtif.seed.json"
  ];
  const optionalSeeds = await Promise.all(
    optionalSeedFiles.map((seedPath) =>
      readOptionalJson(seedPath, {
        sources: [],
        objects: [],
        gap_analysis_additions: [],
        future_ingestion_targets_additions: []
      })
    )
  );
  const sources = [
    ...sourceSeed.sources,
    ...optionalSeeds.flatMap((seed) => seed.sources ?? [])
  ].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
  const objects = [
    ...knowledgeSeed.objects,
    ...optionalSeeds.flatMap((seed) => seed.objects ?? [])
  ].sort((a, b) =>
    a.id.localeCompare(b.id)
  );

  await resetGeneratedTree();

  const sourceRegistry = {
    schema_version: sourceSeed.schema_version,
    generated_at: stableGeneratedAt,
    accessed_date: accessedDate,
    source_count: sources.length,
    sources
  };
  await writeJson("knowledgebase/sources/sources.json", sourceRegistry);

  const manifestObjects = [];
  for (const object of objects) {
    const dir = outputDirs[object.object_type];
    if (!dir) {
      throw new Error(`No output directory mapping for object_type=${object.object_type} id=${object.id}`);
    }
    const withDefaults = {
      schema_version: knowledgeSeed.schema_version,
      updated_at: object.updated_at ?? accessedDate,
      ...object
    };
    const objectPath = `knowledgebase/${dir}/${object.id}.json`;
    await writeJson(objectPath, withDefaults);
    manifestObjects.push({
      id: object.id,
      object_type: object.object_type,
      canonical_term: object.canonical_term,
      category: object.category,
      legal_hierarchy: object.legal_hierarchy,
      semantic_tags: object.semantic_tags ?? [],
      path: objectPath
    });
  }

  const edges = relationshipEdges(objects);
  await writeJson("knowledgebase/crosswalks/relationship_edges.json", {
    schema_version: knowledgeSeed.schema_version,
    generated_at: stableGeneratedAt,
    edge_count: edges.length,
    edges
  });

  await writeJson("knowledgebase/index.json", {
    schema_version: knowledgeSeed.schema_version,
    generated_at: stableGeneratedAt,
    object_count: manifestObjects.length,
    source_count: sources.length,
    objects: manifestObjects
  });

  await writeJson("knowledgebase/_generated_manifest.json", {
    schema_version: knowledgeSeed.schema_version,
    generated_at: stableGeneratedAt,
    root: "knowledgebase",
    generated_files: [
      "knowledgebase/sources/sources.json",
      "knowledgebase/crosswalks/relationship_edges.json",
      "knowledgebase/index.json",
      ...manifestObjects.map((object) => object.path)
    ].sort()
  });

  await writeJson("reports/source_coverage.json", {
    schema_version: knowledgeSeed.schema_version,
    generated_at: stableGeneratedAt,
    source_count: sources.length,
    object_count: objects.length,
    sources_by_type: countBy(sources, (source) => source.source_type),
    sources_by_legal_hierarchy: countBy(sources, (source) => source.legal_hierarchy),
    sources_by_authority: countBy(sources, (source) => source.issuing_authority),
    topics: flattenTopicCounts(sources),
    source_usage: sourceUsage(objects),
    sources_missing_publication_date: sources
      .filter((source) => source.publication_date === null)
      .map((source) => ({
        source_id: source.id,
        title: source.title,
        publication_date_note: source.publication_date_note
      }))
  });

  await writeJson("reports/duplicate_detection.json", {
    schema_version: knowledgeSeed.schema_version,
    generated_at: stableGeneratedAt,
    duplicate_term_count: duplicateTermReport(objects).length,
    duplicate_terms: duplicateTermReport(objects)
  });

  await writeJson("reports/ontology_relationships.json", {
    schema_version: knowledgeSeed.schema_version,
    generated_at: stableGeneratedAt,
    edge_count: edges.length,
    relationship_type_counts: countBy(edges, (edge) => edge.relationship_type),
    high_degree_objects: Object.entries(countBy(edges, (edge) => edge.from_id))
      .map(([id, outbound_count]) => ({ id, outbound_count }))
      .sort((a, b) => b.outbound_count - a.outbound_count || a.id.localeCompare(b.id))
      .slice(0, 25)
  });

  await writeJson("reports/gap_analysis.json", {
    schema_version: knowledgeSeed.schema_version,
    generated_at: stableGeneratedAt,
    gaps: [
      ...knowledgeSeed.gap_analysis,
      ...optionalSeeds.flatMap((seed) => seed.gap_analysis_additions ?? [])
    ],
    future_ingestion_targets: [
      ...knowledgeSeed.future_ingestion_targets,
      ...optionalSeeds.flatMap((seed) => seed.future_ingestion_targets_additions ?? [])
    ]
  });

  const authorityCatalogSeed = optionalSeeds.find((seed) => seed.authority_coverage);
  if (authorityCatalogSeed?.authority_coverage) {
    await writeJson("reports/authority_coverage.json", {
      schema_version: knowledgeSeed.schema_version,
      generated_at: stableGeneratedAt,
      ...authorityCatalogSeed.authority_coverage
    });
  }

  const operationalReadinessSeed = optionalSeeds.find((seed) => seed.operational_readiness_coverage);
  if (operationalReadinessSeed?.operational_readiness_coverage) {
    await writeJson("reports/operational_readiness_coverage.json", {
      schema_version: knowledgeSeed.schema_version,
      generated_at: stableGeneratedAt,
      ...operationalReadinessSeed.operational_readiness_coverage
    });
  }

  const tifMicrotifSeed = optionalSeeds.find((seed) => seed.tif_microtif_coverage);
  if (tifMicrotifSeed?.tif_microtif_coverage) {
    await writeJson("reports/tif_microtif_coverage.json", {
      schema_version: knowledgeSeed.schema_version,
      generated_at: stableGeneratedAt,
      ...tifMicrotifSeed.tif_microtif_coverage
    });
  }

  await writeJson("discovery/search_queries.json", {
    schema_version: sourceSeed.schema_version,
    generated_at: stableGeneratedAt,
    stop_conditions: sourceSeed.stop_conditions,
    queries: sourceSeed.discovery_queries
  });

  await writeJson("discovery/source_discovery_log.json", {
    schema_version: sourceSeed.schema_version,
    generated_at: stableGeneratedAt,
    discovered_source_count: sources.length,
    saturation_notes: sourceSeed.saturation_notes,
    discovered_sources: sources.map((source) => ({
      source_id: source.id,
      title: source.title,
      url: source.url,
      source_type: source.source_type,
      legal_hierarchy: source.legal_hierarchy,
      topics: source.topics
    }))
  });

  await writeJson("logs/build_log.json", {
    schema_version: knowledgeSeed.schema_version,
    generated_at: stableGeneratedAt,
    deterministic_timestamp: true,
    seed_files: [
      "data/seed/sources.seed.json",
      "data/seed/knowledge.seed.json",
      ...optionalSeedFiles
    ],
    generated_object_count: objects.length,
    generated_source_count: sources.length,
    generated_edge_count: edges.length
  });

  console.log(`Built ${objects.length} knowledge objects from ${sources.length} sources.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
