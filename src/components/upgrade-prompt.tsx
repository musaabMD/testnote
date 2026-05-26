import Link from "next/link";

type UpgradePromptProps = {
  title?: string;
  message?: string;
  className?: string;
};

export function UpgradePrompt({
  title = "Paid feature",
  message = "Upgrade your plan to unlock this feature.",
  className = "",
}: UpgradePromptProps) {
  return (
    <div
      className={`rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 text-blue-950 ${className}`}
      role="status"
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-blue-900/90">{message}</p>
      <Link
        href="/pricing"
        className="mt-3 inline-flex items-center rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800"
      >
        View plans
      </Link>
    </div>
  );
}
