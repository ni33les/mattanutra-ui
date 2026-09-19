# Readiness-driven pharmacy flight

The user replaces the fixed-duration disappearing sprite with continuous flight until products and their order quote are ready, followed by a smooth landing. Results must appear without waiting for landing.

- PHARM-MOTION pending: the old invisible-leaf assertion is replaced by continued movement after 18 and 38 seconds while work remains pending.
- PHARM-COMBINE completion before: completed results still appear immediately. The offscreen-transform assertion is replaced by stationary landing; completed visits do not replay.
- Preserve original curve/tip geometry, advice, prices, fixtures and order behaviour. A visible ingredient list alone is not completed matching.
- New PHARM-FLIGHT cases verify continuous joins, exact landing, hidden-tab pausing and reduced-motion/navigation cleanup.

Historical execution evidence is retained outside the repository. This package changes no matching, database, questionnaire, normal web or checkout behaviour.
