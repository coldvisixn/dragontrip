# Security policy

Dragontrip handles assessment evidence and credentials. Please keep implementation vulnerability reports separate from findings in your own assessment projects.

## Reporting a vulnerability

Use GitHub's private **Report a vulnerability** flow from [the Security tab](https://github.com/coldvisixn/dragontrip/security) if it is available for this repository. If that option is unavailable, open a minimal issue requesting a private reporting channel without disclosing exploitation details, credentials or confidential data. Do not post an unredacted vault, database, token or real assessment artifact in public issues.

A useful private report includes the affected version, distribution, reproduction steps with non-sensitive fixtures, expected impact and any suggested fix. There is no stated response-time guarantee or bounty program.

## Current support

Dragontrip is an early 0.x preview. Fixes target the current development line/latest preview; long-term support for older binaries is not offered. Back up before upgrading and preserve the matching backup if you may need to roll back.

## Data boundaries

The vault encrypts its credential records; ordinary notes, evidence and project reports are not encrypted. Exported project archives encrypt included credentials only, not the entire archive. A running compromised machine can access unlocked information. [Data and backups](docs/DATA.md) document the storage model and current limits.

Recon tools run against explicitly approved scope. Task cards and investigation paths are authored plans, not an exploitation engine. Use the application only in environments you are authorized to assess.
