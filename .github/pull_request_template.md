## Result and related issue

Describe the concrete behavior and link the issue.

## Validation and local testing

List executed checks, the `npm run gate` summary for the exact head (hosted CI is disabled) and concrete local steps/expected observations. State limitations honestly.

## Documentation and compatibility

List affected catalogue entries/type templates, technical documentation, generation commands and save/data compatibility changes. If no semantic impact, identify changed files and explain why authorable behavior/resources are unchanged. During catalogue bootstrap follow docs/AUTHORING_CONTRACT.md; do not claim full coverage or future gates already exist.

## Integration checklist

- [ ] Branch created from latest origin/main; latest integration changes incorporated without losing either side.
- [ ] PR targets integration; no production deployment or main promotion.
- [ ] `npm run gate:check` passes for the final head (evidence committed); no conflicts or unresolved reviews.
- [ ] Related documentation, regression tests and migration/configuration instructions are complete.
