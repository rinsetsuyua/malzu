# Security

Malzu is a non-commercial research atlas.

It must not handle live malware.

## Scope

Security issues include:

- secrets committed to the repository
- paths that fetch, upload, execute, or unpack malware samples
- private or account-gated threat-intelligence exports committed to public files
- copied detection rules or source material with incompatible licenses
- bypasses of `npm run audit:licensing`

## Out Of Scope

Do not submit:

- malware samples
- exploit payloads
- live command-and-control infrastructure access
- credential dumps
- private victim data
- ransomware leak-site mirrors

## Reporting

Use GitHub private vulnerability reporting if enabled.

If private reporting is unavailable, contact the repository owner before posting sensitive details publicly.

## Required Checks

Run these before publishing or accepting data changes:

```bash
npm run validate
npm run audit:licensing
npm run audit:release
npm run build
```

The release audit intentionally ignores `internal/`, `dist/`, and generated local artifacts.

Do not remove those boundaries without a separate security review.
