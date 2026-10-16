# Contributing to Dragontrip

Bug reports, usability feedback, documentation fixes and focused improvements are welcome.

## Report a bug or suggest a feature

Use [the issue templates](https://github.com/coldvisixn/dragontrip/issues/new/choose). Include the Dragontrip version, distribution, installation method, reproduction steps and expected/actual behavior. For graph/performance issues, include approximate object count and VM resources.

Use a minimal lab project or redacted screenshot. Do not publish credentials, API tokens, real assessment evidence or confidential target data. For implementation vulnerabilities, follow [SECURITY.md](SECURITY.md).

## Make a change

1. Open a focused issue for a substantial behavior change so its scope can be discussed.
2. Fork/branch and follow [development setup](docs/DEVELOPMENT.md).
3. Keep the change small enough to review; explain the user-visible behavior and relevant limits.
4. Run the checks appropriate to your change. Backend/UI changes normally use `pytest`, `npm test` and `npm run build`; documentation changes should have valid links and accurate commands.
5. Include meaningful tests for changed behavior and update the user guide/changelog when needed.

Preserve existing projects, scan evidence, manual object positions and archive compatibility. Durable schema changes need an Alembic migration. Recon adapters must use the bounded queue and validated argv, with tests against owned loopback targets. Keep automatically observed evidence distinct from manually authored hypotheses. [Extension contracts](docs/EXTENSIONS.md) explain the boundaries.

Never commit user databases, vault contents, tokens, generated evidence or private assessment data. Screenshots used in documentation should contain explicit test fixtures. Distributed recon tools retain their own licenses.

## Pull requests

Describe the problem, resulting behavior and verification. State relevant compatibility changes and outstanding native checks. Source changes do not require publishing a release; maintainers handle versioning and tagged releases via [the release guide](docs/RELEASING.md).

Contributions are provided under the project's [MIT license](LICENSE).
