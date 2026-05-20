# External Dataset Imports

Place provided or acquired datasets here before writing a deterministic transformer.

Expected high-priority datasets:

- `pad_reports_opinions/` multi-year Nebraska PAD R&O JSON or extracted tables.
- `ctl_history/` certified taxable valuation or CTL history JSON.
- `assessment_calendar/` structured PAD assessor calendar data.
- `levy_history/` levy/taxing subdivision history.
- `property_tax_credits/` property tax credit program data.
- `glossary/` IAAO/PAD/Nebraska glossary terms.
- `valuation_groups/` PAD/county valuation group data.
- `county_statistics/` county statistical history.

Transformer requirements:

- Preserve source IDs and file provenance.
- Preserve stable canonical IDs on rebuild.
- Emit object-level `source_refs`.
- Link imported facts to existing canonical concepts wherever possible.
- Write validation and duplicate reports after every transform.
