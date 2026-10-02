import {
	AdaptiveModal,
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerHeader,
	type DrawerSide,
	DrawerTitle,
} from "@sairn/ui";
import { i18n } from "@lingui/core";
import { useState } from "react";
import { TradeSlider } from "@/components/trade/components/trade-slider";
import { createI18nRoot } from "@/lib/tests/harness/react";
import "./trade-slider.css";

function DrawerInteractionFixture() {
	const params = new URLSearchParams(window.location.search);
	const mode = params.get("mode") ?? "basic";
	const side = (params.get("side") ?? "bottom") as DrawerSide;
	const [open, setOpen] = useState(true);
	const [nestedOpen, setNestedOpen] = useState(false);
	const [locked, setLocked] = useState(true);
	const [value, setValue] = useState(25);
	const [events, setEvents] = useState<string[]>([]);
	const body = (
		<>
			<DrawerHeader data-swipe-target="primary" className="h-24 shrink-0 select-none">
				<DrawerTitle>Primary drawer</DrawerTitle>
			</DrawerHeader>
			{mode === "slider" && (
				<div className="px-6 py-4">
					<TradeSlider
						value={value}
						min={0}
						max={100}
						ariaLabel="Quantity percent"
						onPreview={setValue}
						onCommit={setValue}
						onCancel={setValue}
					/>
				</div>
			)}
			{mode === "scroll" && (
				<div data-scroll-content className="min-h-0 flex-1 overflow-y-auto px-6">
					<div className="h-[1000px]">Scrollable content</div>
				</div>
			)}
			{mode === "blocking" && (
				<button type="button" onClick={() => setLocked(false)}>
					Unlock dismissal
				</button>
			)}
			{mode === "nested" && (
				<>
					<button type="button" onClick={() => setNestedOpen(true)}>
						Open nested drawer
					</button>
					<Drawer
						side="bottom"
						open={nestedOpen}
						onOpenChange={(next, details) => {
							setEvents((previous) => [...previous, `nested:${next}:${details.reason}`]);
							setNestedOpen(next);
						}}
					>
						<DrawerContent className="h-64">
							<DrawerHeader data-swipe-target="nested" className="h-24 shrink-0 select-none">
								<DrawerTitle>Nested drawer</DrawerTitle>
							</DrawerHeader>
							<DrawerClose>Close nested drawer</DrawerClose>
						</DrawerContent>
					</Drawer>
				</>
			)}
			<DrawerClose>Close primary drawer</DrawerClose>
		</>
	);

	return (
		<>
			<button type="button" onClick={() => setOpen(true)}>
				Open primary drawer
			</button>
			<output data-fixture-state hidden>
				{JSON.stringify({ open, nestedOpen, value, events })}
			</output>
			{mode === "blocking" ? (
				<AdaptiveModal
					open={open}
					onOpenChange={(next) => {
						setEvents((previous) => [...previous, `primary:${next}`]);
						setOpen(next);
					}}
					presentation="drawer"
					layer="blocking"
					dismissible={!locked}
					className="h-[360px]"
				>
					{body}
				</AdaptiveModal>
			) : (
				<Drawer
					side={side}
					open={open}
					onOpenChange={(next, details) => {
						setEvents((previous) => [...previous, `primary:${next}:${details.reason}`]);
						setOpen(next);
					}}
				>
					<DrawerContent
						keepMounted={params.has("keepMounted")}
						overlay={mode !== "overlayless"}
						className={side === "left" || side === "right" ? "w-72" : "h-[360px]"}
					>
						{body}
					</DrawerContent>
				</Drawer>
			)}
		</>
	);
}

const element = document.getElementById("root");
if (!element) throw new Error("Missing drawer fixture root");
i18n.loadAndActivate({ locale: "en", messages: {} });
createI18nRoot(element).render(<DrawerInteractionFixture />);
