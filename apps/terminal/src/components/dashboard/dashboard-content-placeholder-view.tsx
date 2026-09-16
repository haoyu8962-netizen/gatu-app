interface Props {
	className: string;
	headingClassName: string;
	gridClassName: string;
	cardClassName: string;
	cardKeys: readonly string[];
	tableClassName: string;
}

export function DashboardContentPlaceholderView({
	className,
	headingClassName,
	gridClassName,
	cardClassName,
	cardKeys,
	tableClassName,
}: Props) {
	return (
		<div className={className}>
			<div className={headingClassName} />
			<div className={gridClassName}>
				{cardKeys.map((key) => (
					<div key={key} className={cardClassName} />
				))}
			</div>
			<div className={tableClassName} />
		</div>
	);
}
