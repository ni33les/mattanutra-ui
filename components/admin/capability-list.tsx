import {
  readableToken
} from "@/components/admin/dashboard-shared";

export function CapabilityList({ values }: Readonly<{ values: string[] }>) {
  if (values.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {values.slice(0, 5).map((value) => (
        <span
          key={value}
          className="rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200"
        >
          {readableToken(value)}
        </span>
      ))}
      {values.length > 5 ? (
        <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500 ring-1 ring-gray-200">
          +{values.length - 5}
        </span>
      ) : null}
    </div>
  );
}
