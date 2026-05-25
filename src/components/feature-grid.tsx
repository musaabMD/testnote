import type { ProductFeature } from "@/lib/product-features";

export function FeatureGridItem({ feature }: { feature: ProductFeature }) {
  const Icon = feature.icon;

  return (
    <article className="flex items-start gap-4">
      <span
        className={`grid size-[52px] shrink-0 place-items-center rounded-[14px] ${feature.color}`}
      >
        <Icon className="size-[22px]" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 pt-0.5">
        <h3 className="text-[15px] font-semibold leading-snug text-slate-950">
          {feature.title}
        </h3>
        <p className="mt-1 text-sm leading-snug text-slate-500">
          {feature.description}
        </p>
      </div>
    </article>
  );
}

export function FeatureGrid({ features }: { features: ProductFeature[] }) {
  return (
    <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-10 lg:gap-y-10">
      {features.map((feature) => (
        <FeatureGridItem key={feature.title} feature={feature} />
      ))}
    </div>
  );
}
