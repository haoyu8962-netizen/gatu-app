import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "./utils";

const tableVariants = cva(["w-full caption-bottom border-collapse"], {
	variants: {
		variant: {
			default: "",
			striped: "[&_tbody>tr:nth-child(odd)]:bg-fill-weaker",
		},
	},
	defaultVariants: {
		variant: "default",
	},
});

const tableHeadVariants = cva(["text-left align-middle font-semibold text-fg-muted whitespace-nowrap"], {
	variants: {
		size: {
			default: "h-12 px-6 text-xs",
			dense: "h-8 px-2.5 py-2 text-2xs",
		},
	},
	defaultVariants: {
		size: "default",
	},
});

const tableCellVariants = cva(["align-middle text-fg-muted"], {
	variants: {
		size: {
			default: "h-20 px-6 text-sm",
			dense: "h-auto px-2.5 py-2 text-2xs leading-normal",
		},
	},
	defaultVariants: {
		size: "default",
	},
});

interface TableProps extends React.HTMLAttributes<HTMLTableElement>, VariantProps<typeof tableVariants> {
	containerClassName?: string;
	scrollableRegionLabel?: string;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
	({ className, containerClassName, scrollableRegionLabel, variant, ...props }, ref) => {
		const containerRef = React.useRef<HTMLDivElement>(null);
		const tableRef = React.useRef<HTMLTableElement>(null);
		const [isHorizontallyScrollable, setIsHorizontallyScrollable] = React.useState(false);
		const setTableRef = React.useCallback(
			(node: HTMLTableElement | null) => {
				tableRef.current = node;
				if (typeof ref === "function") ref(node);
				else if (ref) ref.current = node;
			},
			[ref],
		);

		React.useEffect(() => {
			const container = containerRef.current;
			if (!container || !scrollableRegionLabel) return;

			const updateScrollableState = () => {
				const next = container.scrollWidth > container.clientWidth;
				setIsHorizontallyScrollable((current) => (current === next ? current : next));
			};

			updateScrollableState();
			if (typeof ResizeObserver === "undefined") return;

			const observer = new ResizeObserver(updateScrollableState);
			observer.observe(container);
			if (tableRef.current) observer.observe(tableRef.current);
			return () => observer.disconnect();
		}, [scrollableRegionLabel]);

		const exposesScrollableRegion = Boolean(scrollableRegionLabel && isHorizontallyScrollable);
		const scrollRegionProps: React.HTMLAttributes<HTMLDivElement> = exposesScrollableRegion
			? { "aria-label": scrollableRegionLabel, role: "region", tabIndex: 0 }
			: {};

		return (
			<div
				ref={containerRef}
				data-slot="table-scroll-container"
				{...scrollRegionProps}
				className={cn(
					"w-full overflow-x-auto",
					scrollableRegionLabel &&
						"focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stroke-focus",
					containerClassName,
				)}
			>
				<table className={cn(tableVariants({ variant, className }))} ref={setTableRef} {...props} />
			</div>
		);
	},
);
Table.displayName = "Table";

interface TableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {}

const TableHeader = React.forwardRef<HTMLTableSectionElement, TableHeaderProps>(({ className, ...props }, ref) => (
	<thead className={cn("[&_tr]:border-y [&_tr]:border-stroke-weak", className)} ref={ref} {...props} />
));
TableHeader.displayName = "TableHeader";

interface TableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {}

const TableBody = React.forwardRef<HTMLTableSectionElement, TableBodyProps>(({ className, ...props }, ref) => (
	<tbody className={cn("[&_tr]:border-b [&_tr]:border-stroke-weak", className)} ref={ref} {...props} />
));
TableBody.displayName = "TableBody";

interface TableFooterProps extends React.HTMLAttributes<HTMLTableSectionElement> {}

const TableFooter = React.forwardRef<HTMLTableSectionElement, TableFooterProps>(({ className, ...props }, ref) => (
	<tfoot className={cn("border-t border-stroke-weak font-semibold text-fg", className)} ref={ref} {...props} />
));
TableFooter.displayName = "TableFooter";

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {}

const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(({ className, ...props }, ref) => (
	<tr className={cn(className)} ref={ref} {...props} />
));
TableRow.displayName = "TableRow";

interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement>, VariantProps<typeof tableHeadVariants> {}

const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(({ className, size, ...props }, ref) => (
	<th className={cn(tableHeadVariants({ size, className }))} ref={ref} {...props} />
));
TableHead.displayName = "TableHead";

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement>, VariantProps<typeof tableCellVariants> {}

const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(({ className, size, ...props }, ref) => (
	<td className={cn(tableCellVariants({ size, className }))} ref={ref} {...props} />
));
TableCell.displayName = "TableCell";

interface TableCaptionProps extends React.HTMLAttributes<HTMLTableCaptionElement> {}

const TableCaption = React.forwardRef<HTMLTableCaptionElement, TableCaptionProps>(({ className, ...props }, ref) => (
	<caption className={cn("mt-4 text-xs text-fg-muted", className)} ref={ref} {...props} />
));
TableCaption.displayName = "TableCaption";

export {
	Table,
	TableHeader,
	TableBody,
	TableFooter,
	TableRow,
	TableHead,
	TableCell,
	TableCaption,
	tableVariants,
	tableHeadVariants,
	tableCellVariants,
};
export type {
	TableProps,
	TableHeaderProps,
	TableBodyProps,
	TableFooterProps,
	TableRowProps,
	TableHeadProps,
	TableCellProps,
	TableCaptionProps,
};
