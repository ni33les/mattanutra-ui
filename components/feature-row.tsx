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
  href: string;
  icon: ComponentType<FeatureIconProps>;
  name: string;
}>;

const features: Feature[] = [
  {
    name: "Smart Assessment",
    description:
      "Share your goals for energy, sleep, focus, calm, recovery, or healthy aging in a 2 minute questionaire.",
    href: "#",
    icon: AdjustmentsHorizontalIcon
  },
  {
    name: "AI Powered Plan",
    description:
      "We generate a comprehensive AI powered supplement plan tailored to you.",
    href: "#",
    icon: Brain
  },
  {
    name: "Buy with confidence",
    description:
      "We discover the very best products that match your individual formulation.",
    href: "#",
    icon: ShoppingBagIcon
  }
];

export function FeatureRow() {
  return (
    <section id="features" className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:text-center">
          <h2 className="text-base/7 font-semibold text-[#3A7BD5]">
            Personalized wellness
          </h2>
          <p className="mt-2 text-4xl font-semibold tracking-normal text-pretty text-gray-900 sm:text-5xl lg:text-balance">
            From goals to supplement options
          </p>
          <p className="mt-6 text-lg/8 text-gray-600">
            Healthspan turns a short conversation about your lifestyle, your
            body and preferences into a supplement formulation tailored
            specifically for you — then finds the closest matching products that
            meet your body’s needs.
          </p>
        </div>
        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
          <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.name} className="flex flex-col">
                <dt className="flex items-center gap-x-3 text-base/7 font-semibold text-gray-900">
                  <feature.icon
                    aria-hidden={true}
                    className="size-5 flex-none text-[#3A7BD5]"
                  />
                  {feature.name}
                </dt>
                <dd className="mt-4 flex flex-auto flex-col text-base/7 text-gray-600">
                  <p className="flex-auto">{feature.description}</p>
                  <p className="mt-6">
                    <a
                      href={feature.href}
                      className="text-sm/6 font-semibold text-[#3A7BD5] hover:text-[#326dbf]"
                    >
                      Learn more <span aria-hidden="true">-&gt;</span>
                    </a>
                  </p>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
