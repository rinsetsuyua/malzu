# Contributing

Status: public contribution policy.

Malzu is intended as public source-available infrastructure for non-commercial community research.

It is not intended for commercial reuse.

## Contribution Terms

By submitting a contribution, you agree that accepted work may be distributed under the project's non-commercial license terms.

Target license split:

- code: PolyForm Noncommercial 1.0.0
- curated graph data: CC BY-NC 4.0
- documentation: CC BY-NC 4.0

Do not submit work you cannot license under those terms.

## Review

All contributions are reviewed before inclusion.

Maintainer review checks:

- evidence quality
- relationship type accuracy
- source licensing posture
- non-commercial project compatibility
- no restricted source leakage
- no malware samples or payload workflows

Relationship review also checks that:

- lineage terms are used only when the source supports direction
- operator continuity is not modeled as code lineage
- delivery relationships are not modeled as ancestry
- weak or disputed claims stay in `data/research/relationship-leads.json`

## Allowed Contributions

- clean source metadata
- source-backed malware family records
- source-backed relationship records
- short curator-written summaries
- validation or audit improvements
- UI and graph improvements
- documentation improvements

## Blocked Contributions

Do not submit:

- malware samples
- payload downloads
- sample-upload workflows
- copied vendor prose
- copied screenshots, diagrams, tables, logos, or article images
- copied IOC dumps
- copied YARA or Sigma rules unless the license is explicitly compatible
- ransomware victim datasets
- ransom notes
- leak-site mirrors
- account-gated threat-intelligence exports
- Malpedia-derived public records
- private keys, API keys, credentials, or secrets

## Source Requirements

Every promoted source record must include:

- `license_posture`
- `redistribution_policy`
- `allowed_uses`
- `blocked_uses`
- `notice_required`

Run before submitting:

```bash
npm run check:baseline
npm run hunt:data
```
