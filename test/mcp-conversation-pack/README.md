# Conversation payload pack — contract 7.2.4

Scope: C3, then C1+C2+C5, then C4. DEV only. No contract version bump,
matcher/scoring edits, catalogue correction, expanded-search ticket or host-cache work.

Release base: `1c169407ba0f3fed3a19871afa87ce0bdeecf949`.
Evidence: `/root/.codex/visualizations/2026/09/08/conversation-pack`.
The supplied D3 handle was read before implementation. Its full public result is
frozen in `d3-fixture.json`; only the live capability and evidence handle were
removed/replaced. Products, doses, prices, nullable facts and findings are unchanged.
The store helper is a constructed in-memory presentation record, not a historical
matching replay. Historical evidence and fixture prices remain preserved.

| Case | Reproduction | Replacement behaviour |
| --- | --- | --- |
| C3 `test_ready_status_and_conversation_share_primary_next_action` | status requested get_conversation while conversation requested confirm_with_user | Both readers use one operational decision; pending/failure/recovery remains distinct |
| C1 `test_conversation_omits_advice_bodies` | message, contributors, references and label text inline | adviceId, guidanceIds, optionIds, kind and severity only; exact full findings in details |
| C2 `test_conversation_options_are_cards_not_baskets` | basket and coverage expanded for several options | Exactly optionId, roles, reason, stackSummary and coveragePercent; original option order preserved |
| C5 `test_conversation_highlighted_option_has_no_high_product_data_wall` | VISTRA high product_data message with null supply | Null remains; flag remains; full label message is details-only |
| C4 `test_overlap_message_has_no_binary_float_junk` | Raw binary float in real overlap generation and saved messages | IU integers; other units two decimals unless requested target precision is greater |

C3's initial incomplete helper failed before reaching the product assertion; this
is retained as harness evidence only. `c3-valid-red.tap` records the real failure.
The other named RED records directly exercise the reported behaviour. Each RED
slice was committed before implementation.

Maintained advice cases keep their IDs; the requested replacement moves prose,
measured exposures and provenance assertions into details and checks inline IDs,
severity and option attribution. PAY-VIEW retains independent exact basket,
coverage and advice equality in retrieved sections. AG72 client cases use returned
card identities and retrieve exact quantities before relying on them.
PAY-POLL's former relative ten-percent byte ratio assumed large conversations;
it now requires status below 2,000 bytes and smaller than conversation. It still
checks ownership, unchanged versions, failure and cancellation.
Those operation fixtures now control Date at their frozen Sep 7 epoch. The first
scoped run exposed previously admitted fixture work expiring against Sep 8 wall
time; timeout and pending assertions are preserved, not removed.

`impact.json` maps the 58 selected cases to affected behaviour. No full suite or
expanded-search matrix is claimed. Clinical rules, quantities, prices and stored
results are not rewritten. PLAN_PRESENTATION_VERSION changes poll freshness
without changing the public contract version.
