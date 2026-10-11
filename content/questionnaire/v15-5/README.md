# Questionnaire v15.5

These EN/TH definitions, grouped screens, pharmacy landing copy and first-party WebP assets are extracted from the supplied HTML guides. The HTML is a design/content reference, not executable application code. The established Chinese route retains English questions and a Chinese landing notice.

Source files and SHA-256:

- `MattaNutra_v15_5_Pathway1_THB690_2.html`: `bc0cd8faa3484533f9c92b5ec38ff650d05593735a460e1f5e0e9ea60efb69eb`
- `MattaNutra_v15_5_Pathway2_PharmacyQR_2.html`: `0ceaeb457d0a775e22a231bedbb10e3713a5314095592b72d47cf49cf7c2294b`

The application uses native React components, existing typography, locale switching, and idempotent assessment capture. The normal marketing homepage is unchanged; the web guide replaces the welcome at `/[locale]/nutrition/quiz`. Pharmacy entry, landing, quiz and legacy QR aliases retain their current URLs, source/session parameters, and server-resolved pharmacy identity.

The new state version is `v15.5-screens`, independent of the prototype's internal `v15.4` config label. The old conversational definition remains versioned for existing channels and saved drafts. Completed capture receipts retain their recovery route; unfinished drafts migrate with supplied answers preserved. Progress means completion, not medical confidence. The explicit final disclosure is separate from consent to answer safety questions.

Height and weight start at the existing configured defaults (175 cm / 72 kg) when their screen opens. Saved edits, cleared fields and explicit unknown choices are preserved. Unknown height/weight remain empty normalized values with explicit `answerStatus`. Food avoidance, supplement reaction detail, lab availability, date and units are retained in the assessment. Food safety consumes the same allergy/avoidance keys. No database migration or pricing change is required; the web offer agrees with the existing THB 690 payment configuration. The pharmacy flow continues to use its established pay-at-checkout journey.
