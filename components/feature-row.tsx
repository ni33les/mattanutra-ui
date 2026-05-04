import {
  AdjustmentsHorizontalIcon,
  ShoppingBagIcon
} from "@heroicons/react/20/solid";
import { Brain } from "lucide-react";
import type { ComponentType } from "react";

type FeatureIconProps = Readonly<{
  "aria-hidden": boolean;
  className: string;
}>;

type Feature = Readonly<{
  description: string;
  name: string;
}>;

type FeatureRowContent = Readonly<{
  description: string;
  eyebrow: string;
  features: readonly Feature[];
  title: string;
}>;

const featureIcons: ComponentType<FeatureIconProps>[] = [
  AdjustmentsHorizontalIcon,
  Brain,
  ShoppingBagIcon
];

export function FeatureRow({ content }: Readonly<{ content: FeatureRowContent }>) {
  return (
    <section id="features" className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:text-center">
          <h2 className="text-base/7 font-semibold text-[#3A7BD5]">
            {content.eyebrow}
          </h2>
          <p className="mt-2 text-4xl font-semibold tracking-normal text-pretty text-gray-900 sm:text-5xl lg:text-balance">
            {content.title}
          </p>
          <p className="mt-6 text-lg/8 text-gray-600">{content.description}</p>
        </div>
        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
          <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
            {content.features.map((feature, index) => {
              const Icon = featureIcons[index] ?? ShoppingBagIcon;

              return (
                <div key={feature.name} className="flex flex-col">
                  <dt className="flex items-center gap-x-3 text-base/7 font-semibold text-gray-900">
                    <Icon
                      aria-hidden={true}
                      className="size-5 flex-none text-[#3A7BD5]"
                    />
                    {feature.name}
                  </dt>
                  <dd className="mt-4 flex flex-auto flex-col text-base/7 text-gray-600">
                    <p className="flex-auto">{feature.description}</p>
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>
    </section>
  );
}
