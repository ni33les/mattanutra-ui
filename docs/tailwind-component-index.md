# Tailwind Component Index

> **Note**: The vendored `tailwind-examples/` copy (19 MB) was removed in Sprint 1 to keep the repository lean. Use the official Tailwind UI examples, shadcn/ui, or the project's own component patterns as references instead.

Local Tailwind examples previously lived under `tailwind-examples/`. Do not reference those paths in new work; use external Tailwind UI docs, shadcn/ui, or existing project components as the source pattern.

## Product Fit

| Site Area | Primary Reference |
| --- | --- |
| Admin dashboard, forms, cards, tables, modals, stats, navigation | Existing admin components plus external Application UI React examples |
| Public marketing pages, hero sections, CTA sections, blog presentation | Existing public pages plus external Marketing React examples |
| Checkout, cart, order, product-like commerce flows | Existing payment/product flows plus external Ecommerce React examples |

## Current Canonical Patterns

Use these first when adding or revising shared UI:

| Pattern | Reference |
| --- | --- |
| Modal with gray footer | `components/admin/*` modal implementations using Headless UI |
| Dismissible modal | Existing admin review/product modals |
| Side drawer | Existing dashboard overlays or external Tailwind UI drawer examples |
| Basic labeled input | Existing nutrition/admin form controls |
| Validation input | Existing admin validation forms |
| Textarea | Existing content/editor forms |
| Headless select | Existing Headless UI combobox/select components |
| Headless combobox | Existing supplement/product pickers |
| Stats | Existing `BusinessStatsGrid` usage |
| Cards | Existing admin and nutrition-flow card styles |
| Grid cards | Existing admin product/review grids |
| Buttons with icons | Existing Heroicons button patterns |
| Badges | Existing status badges in admin views |
| Empty states | Existing preparing/error panels |

## Headless UI Rule

Use Headless UI primitives whenever the component has behavior beyond a plain link or button:

- Dialogs and drawers: `Dialog`, `DialogBackdrop`, `DialogPanel`, `DialogTitle`.
- Form groups: `Field`, `Label`, `Input`, `Select`, `Textarea` when they improve accessibility.
- Custom selects and menus: `Listbox`, `Menu`, `Popover`, `Combobox` using existing project components as references.
- Keep styling aligned to the Application UI React examples for admin screens: white panels, gray borders, `rounded-lg`, `shadow-sm` or `shadow-xl`, gray footers for modal actions, and brand green only for the primary action.

## Recently Applied

- Content editor modal in `components/admin-dashboard.tsx` now follows the Application UI modal-dialog pattern with Headless UI dialog and form primitives.
