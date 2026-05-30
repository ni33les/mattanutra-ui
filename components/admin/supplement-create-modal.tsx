"use client";

import type { AdminContent } from "@/components/admin/dashboard-content";
import { AdminModal } from "@/components/admin/ui";

export function CreateSupplementModal({
  categories,
  category,
  error,
  labels,
  name,
  onCategoryChange,
  onClose,
  onCreate,
  onNameChange,
  saving,
}: Readonly<{
  categories: string[];
  category: string;
  error: boolean;
  labels: AdminContent;
  name: string;
  onCategoryChange: (value: string) => void;
  onClose: () => void;
  onCreate: () => void;
  onNameChange: (value: string) => void;
  saving: boolean;
}>) {
  const canCreate = name.trim().length > 0 && !saving;
  const categoryListId = "supplement-category-options";
  const inputClass =
    "rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]";

  return (
    <AdminModal
      closeDisabled={saving}
      onClose={onClose}
      panelClassName="max-w-lg"
    >
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5 pr-14">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {labels.supplements.newSupplement}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {labels.supplements.newSupplementHint}
          </p>
        </div>
      </div>

      <form
        className="space-y-5 px-6 py-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (canCreate) {
            onCreate();
          }
        }}
      >
        <label className="grid gap-2 text-sm font-medium text-gray-700">
          {labels.supplements.name}
          <input
            autoFocus={true}
            className={inputClass}
            disabled={saving}
            onChange={(event) => onNameChange(event.target.value)}
            value={name}
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-gray-700">
          {labels.supplements.category}
          <input
            className={inputClass}
            disabled={saving}
            list={categoryListId}
            onChange={(event) => onCategoryChange(event.target.value)}
            placeholder={labels.supplements.categoryPlaceholder}
            value={category}
          />
          <datalist id={categoryListId}>
            {categories.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </label>

        {error ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
            {labels.supplements.createError}
          </p>
        ) : null}

        <div className="flex justify-end gap-3">
          <button
            className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving}
            onClick={onClose}
            type="button"
          >
            {labels.supplements.close}
          </button>
          <button
            className="rounded-md bg-[#1FA77A] px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#188865] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canCreate}
            type="submit"
          >
            {saving ? "..." : labels.supplements.create}
          </button>
        </div>
      </form>
    </AdminModal>
  );
}
