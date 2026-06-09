# Malzu

A citation-first map of malware lineage.

Malzu models malware families, variants, sources, and relationship claims as curated JSON data.

The graph is a view over validated records.

The graph is not the source of truth.

Every node declares an `identity_basis`.

Every edge declares a `relation_scope`.

This keeps public names, code lineage, operator continuity, brand aliases, campaigns, and reporting claims from collapsing into one flat idea of "related."

## What This Is

- a public, source-available, non-commercial research atlas
- a malware family and relationship graph
- a distinction layer for lineage, shared code, shared behavior, shared operators, loaders, and loose relatedness
- a citable source index for every promoted node and edge
- a generated web app that loads `atlas.json` at runtime

## What This Is Not

- not a malware sample repository
- not a detector-rule repository
- not a victim dataset mirror
- not a commercial threat-intelligence feed
- not an automatic truth engine
- not an OSI open-source project under the current license direction

## Core Rules

- no uncited relationships
- no automatic claim becomes truth
- every node must declare why it exists as its own entity
- every edge must declare the scope of continuity it claims
- strict lineage terms only when evidence supports lineage
- influence, shared code, shared behavior, shared infrastructure, and shared operators stay separate
- weak or ambiguous claims stay as leads
- source summaries are curator-written
- restricted source material stays out of public data
- graph positions are computed from data, never pinned by malware id

## Relationship Distinctions

See [RELATIONSHIPS.md](RELATIONSHIPS.md).

Short version:

- `derived_from`: explicit source-backed successor or built-from claim
- `forked_from`: explicit fork claim
- `variant_of`: named variant inside a family line
- `shares_code_with`: code overlap without clean direction
- `shares_operator_with`: operator continuity, not malware lineage
- `loaded_by` / `distributed_with`: delivery or campaign relationship, not ancestry
- `reported_as_related_to`: public relatedness claim where the mechanism is unclear

Identity basis:

- `code_lineage`: node exists because code lineage or fork/variant evidence makes it distinct
- `operator_continuity`: node exists primarily through continuity of operators or crew identity
- `brand_or_alias`: node exists because a public brand, alias, version, or market name is useful to inspect separately
- `public_name_bucket`: node tracks a stable public name without claiming one deeper identity criterion
- `campaign_or_incident`: node is shaped by a specific event, campaign, or incident name

Relation scope:

- `code`: implementation or source-code continuity
- `operator`: creator, operator, affiliate, seller, or crew continuity
- `brand`: alias, version, rebrand, or naming continuity
- `distribution`: loader, delivery, or initial-access relationship
- `behavior`: shared behavior without code proof
- `reporting`: public relatedness claim where the mechanism is unclear

## Data And Build

Rich source records live under `data/`.

The browser does not import those records directly.

Build scripts project the public runtime payload into `public/atlas.json`.

`public/atlas.json` is generated and gitignored.

Do not hand-edit or commit it.

Commands:

```bash
npm install
npm run dev
npm run build
```

Validation:

```bash
npm run validate
npm run audit:licensing
npm run audit:release
npm run check:baseline
npm run hunt:data
```

## Public Sites

Canonical public app:

```text
https://hub.rinsetsuyua.com/malzu/
```

GitHub Pages mirror:

```text
https://rinsetsuyua.github.io/malzu/
```

Vite is configured with:

```ts
base: "/malzu/"
```

That base path works for both the hub subpath and the GitHub Pages mirror.

The Pages workflow builds `dist/` and deploys the mirror through GitHub Pages.

## Licensing

Malzu is source-available for non-commercial community research.

Current public license split:

- code: PolyForm Noncommercial License 1.0.0
- curated graph data: CC BY-NC 4.0
- documentation: CC BY-NC 4.0
- upstream notices: preserved in [NOTICE.md](NOTICE.md)

Do not describe this project as permissive open source unless the license changes.

Commercial use, vendor enrichment, paid consulting deliverables, SaaS wrapping, private commercial forks, and resale are out of scope.

See:

- [LICENSE](LICENSE)
- [DATA_LICENSE.md](DATA_LICENSE.md)
- [COMMERCIAL_USE.md](COMMERCIAL_USE.md)
- [NOTICE.md](NOTICE.md)

## Public Data Safety

Public data must not contain:

- malware samples
- payload downloads
- sample-upload workflows
- copied vendor prose
- copied diagrams, screenshots, tables, logos, or article images
- copied IOC dumps
- copied YARA or Sigma rules
- ransomware victim datasets
- ransom notes
- leak-site mirrors
- account-gated or private threat-intelligence exports
- Malpedia-derived public records

Restricted local research belongs only in ignored paths such as `internal/` and `data/research/restricted/`.

## Contribution

See [CONTRIBUTING.md](CONTRIBUTING.md).

Contributions must be compatible with the non-commercial license direction and citation policy.

Run `npm run check:baseline` before submitting data or release-prep changes.
