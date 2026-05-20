import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const stableGeneratedAt = "2026-05-20T00:00:00-05:00";

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), "utf8"));
}

async function writeJson(relativePath, data) {
  const fullPath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, `${JSON.stringify(data, null, 2)}\n`);
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addIssue(collection, severity, code, message, context = {}) {
  collection.push({ severity, code, message, context });
}

async function main() {
  const sourceRegistry = await readJson("knowledgebase/sources/sources.json");
  const index = await readJson("knowledgebase/index.json");
  const sources = sourceRegistry.sources ?? [];
  const sourceIds = new Set(sources.map((source) => source.id));
  const objects = [];
  for (const entry of index.objects ?? []) {
    objects.push(await readJson(entry.path));
  }

  const issues = [];
  const objectIds = new Set(objects.map((object) => object.id));
  const termBuckets = new Map();

  for (const source of sources) {
    if (sourceIds.size !== sources.length) {
      addIssue(issues, "error", "duplicate_source_id", "Duplicate source IDs detected.");
      break;
    }
    for (const field of ["id", "title", "source_type", "issuing_authority", "jurisdiction", "legal_hierarchy", "url", "accessed_date", "status"]) {
      if (!source[field]) {
        addIssue(issues, "error", "source_required_field_missing", `Source missing ${field}.`, { source_id: source.id ?? null });
      }
    }
    if (source.publication_date !== null && !isIsoDate(source.publication_date)) {
      addIssue(issues, "error", "malformed_publication_date", "Source publication_date must be ISO date or null.", { source_id: source.id, publication_date: source.publication_date });
    }
    if (source.publication_date === null) {
      addIssue(issues, "warning", "publication_date_missing", "Source has no stated publication date; registry must preserve publication_date_note.", { source_id: source.id });
    }
    if (!isIsoDate(source.accessed_date)) {
      addIssue(issues, "error", "malformed_accessed_date", "Source accessed_date must be ISO date.", { source_id: source.id, accessed_date: source.accessed_date });
    }
  }

  const seenObjectIds = new Set();
  for (const object of objects) {
    if (seenObjectIds.has(object.id)) {
      addIssue(issues, "error", "duplicate_object_id", "Duplicate knowledge object ID.", { object_id: object.id });
    }
    seenObjectIds.add(object.id);

    for (const field of ["id", "object_type", "canonical_term", "category", "jurisdiction", "legal_hierarchy", "summary", "semantic_tags", "source_refs", "relationships", "review_status"]) {
      if (object[field] === undefined || object[field] === null || object[field] === "") {
        addIssue(issues, "error", "object_required_field_missing", `Knowledge object missing ${field}.`, { object_id: object.id ?? null });
      }
    }

    const canonicalKey = object.canonical_term?.toLowerCase().trim();
    if (canonicalKey) {
      if (!termBuckets.has(canonicalKey)) termBuckets.set(canonicalKey, []);
      termBuckets.get(canonicalKey).push(object.id);
    }

    if (!Array.isArray(object.source_refs) || object.source_refs.length === 0) {
      addIssue(issues, "error", "object_without_sources", "Knowledge object has no source references.", { object_id: object.id });
    }

    for (const ref of object.source_refs ?? []) {
      if (!sourceIds.has(ref.source_id)) {
        addIssue(issues, "error", "orphan_source_ref", "Knowledge object references missing source ID.", { object_id: object.id, source_id: ref.source_id });
      }
      if (!ref.citation) {
        addIssue(issues, "error", "citation_missing", "Source reference is missing citation text.", { object_id: object.id, source_id: ref.source_id });
      }
    }

    for (const relationship of object.relationships ?? []) {
      if (!objectIds.has(relationship.target_id)) {
        addIssue(issues, "error", "orphan_relationship", "Relationship target does not exist.", { object_id: object.id, target_id: relationship.target_id, relationship_type: relationship.type });
      }
    }

    for (const dateEntry of object.dates ?? []) {
      if (dateEntry.date && !/^(\\d{4}-\\d{2}-\\d{2}|annual|varies|relative)$/.test(dateEntry.date)) {
        addIssue(issues, "warning", "non_iso_object_date", "Date entry is not ISO, annual, varies, or relative.", { object_id: object.id, date: dateEntry.date });
      }
    }
  }

  for (const [term, ids] of termBuckets.entries()) {
    if (ids.length > 1) {
      addIssue(issues, "warning", "duplicate_canonical_term", "Multiple objects share the same canonical term.", { term, object_ids: ids.sort() });
    }
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const report = {
    schema_version: "0.1.0",
    generated_at: stableGeneratedAt,
    status: errors.length === 0 ? "pass" : "fail",
    object_count: objects.length,
    source_count: sources.length,
    error_count: errors.length,
    warning_count: warnings.length,
    issues
  };

  await writeJson("reports/validation_report.json", report);
  await writeJson("logs/validation_log.json", {
    schema_version: "0.1.0",
    generated_at: stableGeneratedAt,
    status: report.status,
    error_count: report.error_count,
    warning_count: report.warning_count
  });

  console.log(`Validation ${report.status}: ${errors.length} errors, ${warnings.length} warnings.`);
  if (errors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
