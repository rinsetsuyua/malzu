# Relationship Model

Malzu separates evidence types so the graph does not inflate relatedness into lineage.

Every edge must cite at least one public source.

Accepted edges require explicit, reviewable evidence.

Tentative edges remain visible when useful, but their uncertainty is part of the data.

## Strict Lineage

Use these only when the source supports ancestry or variant direction.

`derived_from`

- child or successor is built from, evolved from, rebranded from, or based on parent code/resources
- direction: descendant -> ancestor
- example evidence: reverse engineering, official advisory, or strong vendor report

`forked_from`

- child is explicitly described as a fork of parent code
- direction: fork -> parent
- use when fork language is cleaner than broad derivation

`variant_of`

- child is a named variant inside a family line
- direction: variant -> family
- use for variant-level records that should stay inspectable

## Shared Traits

Use these when evidence proves overlap but not clean ancestry.

`shares_code_with`

- source identifies code overlap, reused functions, shared builder code, or shared implementation traits
- direction: undirected
- do not use when the only evidence is AV naming, technique overlap, or campaign timing

`shares_behavior_with`

- source identifies behavioral overlap without code proof
- direction: undirected

`shares_infrastructure_with`

- source identifies infrastructure overlap
- direction: undirected
- never upgrade infrastructure overlap into code lineage by itself

## Human Or Ecosystem Continuity

These are not malware-family ancestry.

`shares_creator_with`

- source ties families to the same creator or development group
- direction: undirected

`shares_operator_with`

- source ties families to the same operator, affiliate, or intrusion group
- direction: undirected
- does not imply shared code

`distributed_with`

- families or tools appear in the same delivery/campaign chain
- direction depends on the modeled relationship

`loaded_by`

- one family is delivered by another family or loader
- direction: payload -> loader
- delivery is not lineage

## Loose Or Qualified Claims

`reported_as_related_to`

- source says related, connected, linked, or associated, but the mechanism is unclear
- use this instead of forcing lineage

`disputed_relationship`

- public sources disagree or a common claim has meaningful counterevidence

## Leads

Weak claims stay in `data/research/relationship-leads.json`.

Use leads when:

- evidence is single-source and vague
- source uses ambiguous wording
- relationship direction is unclear
- counterevidence exists
- relationship would overclaim code lineage

Examples currently kept as leads:

- `ESXiArgs -> Babuk`, because public reverse-engineering cautions against that attribution
- `AsyncRAT -> QuasarRAT`, because the relationship is foundation-like but not clean enough for a promoted edge

## Graph Layout Rule

Graph layout must be derived from data.

Never pin coordinates for named malware ids.

Stable layout comes from deterministic seeding and graph algorithms, not authored `{x, y}` maps.
