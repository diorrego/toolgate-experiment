# Development instructions

This is the English experimental Toolgate monorepo.
Keep all repository prose and examples in English. Do not use U+2014 characters.
Read the applicable project instructions and shared contract before editing.

Go and Rust are alternative remote cores implementing the same contract. The
TypeScript SDK runs in the provider backend. Business handlers stay in that
backend. Do not embed selection in the SDK, call business handlers from a core,
remove remote decisions, weaken authorization or replay checks, or retry uncertain
business effects. Actor identity and permissions come from provider authentication.

Use the same corpus, production builds, resources, validation and retry policies
for comparisons. Include failed cases, every network attempt, host preparation,
and final answer generation in the relevant metrics. Never manufacture outcomes,
replace missing consumption with zero, or present API-equivalent costs as invoices.

Use npm and its lockfile for the SDK. Run Go formatting/vet/race checks, Rust
formatting/Clippy/tests, SDK types/tests and external tarball consumption as relevant.
Use local disposable databases for conformance. Paid model calls require explicit
operator authorization; ordinary tests use a synthetic HTTP selector. Publication,
production data access and deployments are separate actions.

Do not include provider source, customer data, credentials, OAuth tokens, private
captures or machine-specific paths in public artifacts. Preserve unrelated work.
Record nontrivial changes, commands, failures and limits in a plan and handoff.
Do not edit contract locks to hide drift. Documentation-only export changes require
recorded provenance; behavioral changes require synchronized consumers and tests.
