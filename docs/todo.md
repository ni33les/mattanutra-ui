# MattaNutra TODO

Last updated: 2026-05-10

## Safety Review And Communication

- [x] Ensure the safety review box is removed or marked complete once the review is finished.
- [x] Add email and LINE capture to the safety review box so the client can be contacted when review completes.
- [x] Create a post-review task after a human safety decision is made.
- [x] Add the worker that contacts the client from the post-review task.
- [x] Reword the safety review box so it feels reassuring, clear, and action-oriented.
- [x] Connect a real chat provider delivery bridge, likely LINE first.
- [x] Add the protected channel mapping API and worker retry path for LINE user IDs.
- [ ] Configure the production LINE webhook/OpenClaw mapping flow so captured LINE handles can reliably become LINE user IDs.

## Admin And Operations

- [x] Add protected OpenClaw APIs for admin queries and remote-safe admin operations.
- [ ] Add notification counts to important admin menu items, especially Human Review, Technical Alerts, Goals, Leads, and Campaigns.
- [ ] Improve the Technical Alerts page.
- [ ] Improve the Goals and task detail pages.

## Data And Versioning

- [ ] Ensure all meaningful plan, supplement, and review changes are append-only new versions, with no in-place updates for business-critical records. Human-reviewed formulations are now append-only.

## Sales And Marketing

- [ ] Complete Marketing Campaigns.
- [ ] Complete Leads.
