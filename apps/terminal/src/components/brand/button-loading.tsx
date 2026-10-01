import { BRAND_MOTION_BUTTON_LOADING } from "@/lib/brand/status-motion.gen";
import { BrandMotion } from "./brand-motion";

interface Props {
	className?: string;
}

export function ButtonLoading({ className }: Props) {
	return <BrandMotion motion={BRAND_MOTION_BUTTON_LOADING} size={16} className={className} />;
}
