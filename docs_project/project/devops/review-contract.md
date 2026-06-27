# Review Contract

Review should focus first on risks that matter for a private assistant:

- secrets or private data committed to git;
- missing Telegram user allowlist checks;
- ambiguous assistant actions;
- side effects without confirmation or audit trail;
- weak error handling around external services;
- missing verification for acceptance criteria.

AI review evidence is advisory until branch protection is configured to require
it. Human ownership remains the final merge gate.
