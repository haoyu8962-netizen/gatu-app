import { Select } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { cn } from "@/lib/cn";

interface Props {
	presentation?: "default" | "funding";
	className?: string;
	triggerClassName?: string;
}

export function AssetSelect({ presentation = "default", className, triggerClassName }: Props) {
	const { t } = useLingui();
	const fundingPresentation = presentation === "funding";

	return (
		<Select
			label={fundingPresentation ? undefined : t`Asset`}
			triggerAriaLabel={fundingPresentation ? t`Asset` : undefined}
			value="USDC"
			onValueChange={() => {}}
			disabled
			size={fundingPresentation ? "lg" : undefined}
			className={cn(fundingPresentation && "min-w-0", className)}
			triggerClassName={cn(
				fundingPresentation &&
					"min-h-10 rounded-[10px] border-market-close-stroke-input bg-modal !px-3 !py-2 text-market-close-fg data-disabled:!cursor-default data-disabled:!border-market-close-stroke-input data-disabled:!text-market-close-fg [&_svg]:size-3",
				triggerClassName,
			)}
			options={[{ value: "USDC", label: "USDC" }]}
		/>
	);
}
