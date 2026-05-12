# Tailwind Component Index

Local Tailwind examples live under `tailwind-examples/`. Use the React examples first for this Next app, then HTML or Vue only as visual references.

## Inventory

| Library | React | HTML | Vue | Total |
| --- | ---: | ---: | ---: | ---: |
| Application UI v4 | 364 | 364 | 364 | 1,092 |
| Ecommerce v4 | 114 | 114 | 114 | 342 |
| Marketing v4 | 179 | 179 | 179 | 537 |
| Total | 657 | 657 | 657 | 1,971 |

## Product Fit

| Site Area | Primary Reference |
| --- | --- |
| Admin dashboard, forms, cards, tables, modals, stats, navigation | `tailwind-examples/application-ui-v4/react/` |
| Public marketing pages, hero sections, CTA sections, blog presentation | `tailwind-examples/marketing-v4/react/` |
| Checkout, cart, order, product-like commerce flows | `tailwind-examples/ecommerce-v4/react/` |

## Current Canonical Patterns

Use these first when adding or revising shared UI:

| Pattern | Reference |
| --- | --- |
| Modal with gray footer | `tailwind-examples/application-ui-v4/react/overlays/modal-dialogs/05-simple-with-gray-footer.jsx` |
| Dismissible modal | `tailwind-examples/application-ui-v4/react/overlays/modal-dialogs/04-simple-with-dismiss-button.jsx` |
| Side drawer | `tailwind-examples/application-ui-v4/react/overlays/drawers/05-with-sticky-footer.jsx` |
| Basic labeled input | `tailwind-examples/application-ui-v4/react/forms/input-groups/01-input-with-label.jsx` |
| Validation input | `tailwind-examples/application-ui-v4/react/forms/input-groups/03-input-with-validation-error.jsx` |
| Textarea | `tailwind-examples/application-ui-v4/react/forms/textareas/01-simple.jsx` |
| Headless select | `tailwind-examples/application-ui-v4/react/forms/select-menus/02-simple-custom.jsx` |
| Headless combobox | `tailwind-examples/application-ui-v4/react/forms/comboboxes/01-simple.jsx` |
| Stats | `tailwind-examples/application-ui-v4/react/data-display/stats/05-with-shared-borders.jsx` |
| Cards | `tailwind-examples/application-ui-v4/react/layout/cards/05-card-with-header-and-footer.jsx` |
| Grid cards | `tailwind-examples/application-ui-v4/react/lists/grid-lists/03-simple-cards.jsx` |
| Buttons with icons | `tailwind-examples/application-ui-v4/react/elements/buttons/06-buttons-with-leading-icon.jsx` |
| Badges | `tailwind-examples/application-ui-v4/react/elements/badges/05-pill-with-border.jsx` |
| Empty states | `tailwind-examples/application-ui-v4/react/feedback/empty-states/02-with-dashed-border.jsx` |

## Headless UI Rule

Use Headless UI primitives whenever the component has behavior beyond a plain link or button:

- Dialogs and drawers: `Dialog`, `DialogBackdrop`, `DialogPanel`, `DialogTitle`.
- Form groups: `Field`, `Label`, `Input`, `Select`, `Textarea` when they improve accessibility.
- Custom selects and menus: `Listbox`, `Menu`, `Popover`, `Combobox` using the local examples above.
- Keep styling aligned to the Application UI React examples for admin screens: white panels, gray borders, `rounded-lg`, `shadow-sm` or `shadow-xl`, gray footers for modal actions, and brand green only for the primary action.

## Recently Applied

- Content editor modal in `components/admin-dashboard.tsx` now follows the Application UI modal-dialog pattern with Headless UI dialog and form primitives.
