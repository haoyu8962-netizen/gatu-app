import { Select } from "@gatu/ui";
import { t } from "@lingui/core/macro";

export function AssetSelect() {
	return (
		<Select
			label={t`Asset`}
			value="USDC"
			onValueChange={() => {}}
			disabled
			options={[{ value: "USDC", label: "USDC" }]}
		/>
	);
}
