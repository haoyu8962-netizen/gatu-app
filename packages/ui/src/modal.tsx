import { Dialog } from "@base-ui/react/dialog";
import { XIcon } from "@phosphor-icons/react";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { Drawer, DrawerClose, DrawerContent } from "./drawer";
import { cn } from "./utils";

// ─── Mobile detection ────────────────────────────────────────────────────────

const MOBILE_BREAKPOINT = 768;

function subscribeToMobileQuery(callback: () => void): () => void {
	if (typeof window === "undefined") return () => {};
	const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
	mql.addEventListener("change", callback);
	return () => mql.removeEventListener("change", callback);
}

function getIsMobile(): boolean {
	if (typeof window === "undefined") return false;
	return window.innerWidth < MOBILE_BREAKPOINT;
}

function useMobile(): boolean {
	return React.useSyncExternalStore(subscribeToMobileQuery, getIsMobile, () => false);
}

// ─── Modal (centered overlay) ─────────────────────────────────────────────────

const modalPopupVariants = cva(["relative w-full bg-modal shadow-overlay rounded-12", "flex flex-col outline-none"], {
	variants: {
		size: {
			sm: "max-w-sm",
			md: "max-w-md",
			lg: "max-w-lg",
		},
	},
	defaultVariants: {
		size: "md",
	},
});

const Modal = Dialog.Root;

const ModalTrigger = Dialog.Trigger;

const ModalClose = Dialog.Close;

interface ModalPopupProps
	extends React.ComponentPropsWithoutRef<typeof Dialog.Popup>,
		VariantProps<typeof modalPopupVariants> {
	closeLabel?: string;
	showClose?: boolean;
	layer?: "default" | "blocking";
	overlayClassName?: string;
}

const ModalPopup = React.forwardRef<HTMLDivElement, ModalPopupProps>(
	(
		{
			className,
			size,
			closeLabel = "Close",
			showClose = true,
			layer = "default",
			overlayClassName,
			children,
			...props
		},
		ref,
	) => (
		<Dialog.Portal>
			<Dialog.Backdrop
				className={cn(
					"fixed inset-0 bg-scrim transition-opacity duration-200 ease-out motion-reduce:transition-none data-starting-style:opacity-0 data-ending-style:opacity-0",
					layer === "blocking" ? "z-[var(--z-blocking-overlay)]" : "z-40",
					overlayClassName,
				)}
			/>
			<div
				className={cn(
					"fixed inset-0 overflow-y-auto py-6 pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))]",
					layer === "blocking" ? "z-[var(--z-blocking-overlay)]" : "z-50",
				)}
			>
				<div className="flex min-h-full items-center justify-center">
					<Dialog.Popup
						className={cn(
							modalPopupVariants({ size, className }),
							"max-h-[calc(100dvh-3rem)] overflow-y-auto",
							"transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none data-starting-style:opacity-0 data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:scale-95",
						)}
						ref={ref}
						{...props}
					>
						{children}
						{showClose && (
							<Dialog.Close
								className={cn(
									"absolute top-4 right-4 z-10",
									"flex items-center justify-center size-8 rounded-8",
									"text-icon cursor-pointer",
									"hover:bg-fill-hover active:bg-fill-press",
									"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
									"after:content-[''] after:absolute after:top-1/2 after:left-1/2 after:-translate-1/2 after:size-11",
								)}
								aria-label={closeLabel}
							>
								<XIcon size={16} weight="bold" />
							</Dialog.Close>
						)}
					</Dialog.Popup>
				</div>
			</div>
		</Dialog.Portal>
	),
);
ModalPopup.displayName = "ModalPopup";

interface ModalHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
	divider?: boolean;
}

const ModalHeader = React.forwardRef<HTMLDivElement, ModalHeaderProps>(
	({ className, divider = true, ...props }, ref) => (
		<div
			className={cn("flex flex-col gap-1 p-4 pr-14", divider && "border-b border-stroke-weak", className)}
			ref={ref}
			{...props}
		/>
	),
);
ModalHeader.displayName = "ModalHeader";

interface ModalTitleProps extends React.ComponentPropsWithoutRef<typeof Dialog.Title> {}

const ModalTitle = React.forwardRef<HTMLHeadingElement, ModalTitleProps>(({ className, ...props }, ref) => (
	<Dialog.Title className={cn("text-base font-semibold text-fg text-balance", className)} ref={ref} {...props} />
));
ModalTitle.displayName = "ModalTitle";

interface ModalDescriptionProps extends React.ComponentPropsWithoutRef<typeof Dialog.Description> {}

const ModalDescription = React.forwardRef<HTMLParagraphElement, ModalDescriptionProps>(
	({ className, ...props }, ref) => (
		<Dialog.Description className={cn("text-xs text-fg-muted text-pretty", className)} ref={ref} {...props} />
	),
);
ModalDescription.displayName = "ModalDescription";

interface ModalContentProps extends React.HTMLAttributes<HTMLDivElement> {}

const ModalContent = React.forwardRef<HTMLDivElement, ModalContentProps>(({ className, ...props }, ref) => (
	<div className={cn("p-4", className)} ref={ref} {...props} />
));
ModalContent.displayName = "ModalContent";

interface ModalFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

const ModalFooter = React.forwardRef<HTMLDivElement, ModalFooterProps>(({ className, ...props }, ref) => (
	<div className={cn("flex items-center justify-end gap-3 p-4", className)} ref={ref} {...props} />
));
ModalFooter.displayName = "ModalFooter";

// ─── AdaptiveModal ────────────────────────────────────────────────────────────
// Auto mode uses a bottom drawer below 768px and a centered modal otherwise.
// Callers may override the presentation and disable dismissal for blocking flows.
// Children are shared between both — use ModalHeader / ModalContent / ModalFooter as usual.

interface AdaptiveModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	size?: VariantProps<typeof modalPopupVariants>["size"];
	showClose?: boolean;
	showHandle?: boolean;
	handleClassName?: string;
	dismissible?: boolean;
	presentation?: "auto" | "modal" | "drawer";
	layer?: "default" | "blocking";
	overlayClassName?: string;
	closeLabel?: string;
	children: React.ReactNode;
	className?: string;
}

function AdaptiveModal({
	open,
	onOpenChange,
	size,
	showClose = true,
	showHandle = true,
	handleClassName,
	dismissible = true,
	presentation = "auto",
	layer = "default",
	overlayClassName,
	closeLabel = "Close",
	children,
	className,
}: AdaptiveModalProps) {
	const detectedMobile = useMobile();
	const useDrawer = presentation === "drawer" || (presentation === "auto" && detectedMobile);

	function handleOpenChange(nextOpen: boolean, eventDetails: { cancel: () => void }) {
		if (!dismissible && !nextOpen) {
			eventDetails.cancel();
			return;
		}
		onOpenChange(nextOpen);
	}

	if (useDrawer) {
		return (
			<Drawer side="bottom" open={open} onOpenChange={handleOpenChange} disablePointerDismissal={!dismissible}>
				<DrawerContent
					overlayClassName={cn(layer === "blocking" && "z-[var(--z-blocking-overlay)]", overlayClassName)}
					className={cn(
						"pb-[env(safe-area-inset-bottom)]",
						layer === "blocking" && "z-[var(--z-blocking-overlay)]",
						className,
					)}
				>
					{dismissible && showHandle && (
						<div
							data-slot="drawer-handle"
							className={cn(
								"absolute top-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-fill/20",
								handleClassName,
							)}
							aria-hidden="true"
						/>
					)}
					{showClose && (
						<DrawerClose
							className={cn(
								"absolute top-4 right-4 z-10",
								"flex items-center justify-center size-8 rounded-8",
								"text-icon cursor-pointer",
								"hover:bg-fill-hover active:bg-fill-press",
								"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
								"after:content-[''] after:absolute after:top-1/2 after:left-1/2 after:-translate-1/2 after:size-11",
							)}
							aria-label={closeLabel}
						>
							<XIcon size={16} weight="bold" />
						</DrawerClose>
					)}
					{children}
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<Modal open={open} onOpenChange={handleOpenChange} disablePointerDismissal={!dismissible}>
			<ModalPopup
				size={size}
				showClose={showClose}
				closeLabel={closeLabel}
				layer={layer}
				overlayClassName={overlayClassName}
				className={className}
			>
				{children}
			</ModalPopup>
		</Modal>
	);
}
AdaptiveModal.displayName = "AdaptiveModal";

export {
	Modal,
	ModalTrigger,
	ModalClose,
	ModalPopup,
	ModalHeader,
	ModalTitle,
	ModalDescription,
	ModalContent,
	ModalFooter,
	AdaptiveModal,
	modalPopupVariants,
};
export type {
	ModalPopupProps,
	ModalHeaderProps,
	ModalTitleProps,
	ModalDescriptionProps,
	ModalContentProps,
	ModalFooterProps,
	AdaptiveModalProps,
};
