import { InfoIcon, WarningIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="space-y-3">
			<h3 className="text-2xs font-medium uppercase tracking-wider text-text-400">{title}</h3>
			<div className="rounded-xs border border-border-100 bg-surface-execution p-4">{children}</div>
		</section>
	);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="space-y-1.5">
			<p className="text-3xs text-text-400">{label}</p>
			<div className="flex flex-wrap items-center gap-2">{children}</div>
		</div>
	);
}

export function ComponentsGallery() {
	const [switchOn, setSwitchOn] = useState(false);
	const [checked, setChecked] = useState<boolean | "indeterminate">(true);

	return (
		<div className="space-y-6">
			<h2 className="text-xs font-semibold uppercase tracking-wider">Components Gallery</h2>

			<Section title="Buttons — Contained">
				<div className="space-y-3">
					<Row label="Base tone">
						<Button variant="contained" tone="base" size="sm">
							Small
						</Button>
						<Button variant="contained" tone="base" size="md">
							Medium
						</Button>
						<Button variant="contained" tone="base" size="lg">
							Large
						</Button>
						<Button variant="contained" tone="base" size="md" disabled>
							Disabled
						</Button>
					</Row>
					<Row label="Accent tone">
						<Button variant="contained" tone="accent" size="sm">
							Small
						</Button>
						<Button variant="contained" tone="accent" size="md">
							Medium
						</Button>
						<Button variant="contained" tone="accent" size="lg">
							Large
						</Button>
						<Button variant="contained" tone="accent" size="md" disabled>
							Disabled
						</Button>
					</Row>
				</div>
			</Section>

			<Section title="Buttons — Outlined">
				<div className="space-y-3">
					<Row label="Base tone">
						<Button variant="outlined" tone="base" size="sm">
							Small
						</Button>
						<Button variant="outlined" tone="base" size="md">
							Medium
						</Button>
						<Button variant="outlined" tone="base" size="lg">
							Large
						</Button>
						<Button variant="outlined" tone="base" size="md" disabled>
							Disabled
						</Button>
					</Row>
					<Row label="Accent tone">
						<Button variant="outlined" tone="accent" size="sm">
							Small
						</Button>
						<Button variant="outlined" tone="accent" size="md">
							Medium
						</Button>
						<Button variant="outlined" tone="accent" size="lg">
							Large
						</Button>
						<Button variant="outlined" tone="accent" size="md" disabled>
							Disabled
						</Button>
					</Row>
				</div>
			</Section>

			<Section title="Buttons — Ghost & Text">
				<div className="space-y-3">
					<Row label="Ghost">
						<Button variant="ghost" tone="base" size="md">
							Base
						</Button>
						<Button variant="ghost" tone="accent" size="md">
							Accent
						</Button>
						<Button variant="ghost" tone="base" size="md" disabled>
							Disabled
						</Button>
					</Row>
					<Row label="Text">
						<Button variant="text" tone="base" size="none">
							Base
						</Button>
						<Button variant="text" tone="accent" size="none">
							Accent
						</Button>
					</Row>
					<Row label="Destructive">
						<Button variant="destructive" size="sm">
							Small
						</Button>
						<Button variant="destructive" size="md">
							Medium
						</Button>
						<Button variant="destructive" size="md" disabled>
							Disabled
						</Button>
					</Row>
				</div>
			</Section>

			<Section title="Badges">
				<div className="space-y-3">
					<Row label="Variants">
						<Badge variant="default">Default</Badge>
						<Badge variant="secondary">Secondary</Badge>
						<Badge variant="destructive">Destructive</Badge>
						<Badge variant="outline">Outline</Badge>
						<Badge variant="long">Long</Badge>
						<Badge variant="short">Short</Badge>
						<Badge variant="neutral">Neutral</Badge>
					</Row>
					<Row label="Sizes">
						<Badge size="default">Default</Badge>
						<Badge size="sm">Small</Badge>
						<Badge size="xs">XS</Badge>
					</Row>
				</div>
			</Section>

			<Section title="Inputs">
				<div className="max-w-sm space-y-3">
					<Row label="Sizes">
						<Input inputSize="sm" placeholder="Small input" />
						<Input inputSize="default" placeholder="Default input" />
						<Input inputSize="lg" placeholder="Large input" />
					</Row>
					<Row label="States">
						<Input placeholder="Default" />
						<Input placeholder="Disabled" disabled />
						<Input placeholder="Invalid" aria-invalid="true" />
					</Row>
				</div>
			</Section>

			<Section title="Switch & Checkbox">
				<div className="space-y-3">
					<Row label="Switch">
						<Switch checked={switchOn} onCheckedChange={setSwitchOn} />
						<Switch checked={!switchOn} onCheckedChange={() => setSwitchOn(!switchOn)} />
						<Switch disabled />
					</Row>
					<Row label="Checkbox">
						<Checkbox checked={checked} onCheckedChange={setChecked} />
						<Checkbox checked={false} />
						<Checkbox checked />
						<Checkbox disabled />
					</Row>
				</div>
			</Section>

			<Section title="Tabs">
				<div className="space-y-4">
					<Row label="Pill variant">
						<Tabs defaultValue="tab1">
							<TabsList variant="pill">
								<TabsTrigger value="tab1">Tab 1</TabsTrigger>
								<TabsTrigger value="tab2">Tab 2</TabsTrigger>
								<TabsTrigger value="tab3">Tab 3</TabsTrigger>
							</TabsList>
						</Tabs>
					</Row>
					<Row label="Underline variant">
						<Tabs defaultValue="tab1">
							<TabsList variant="underline">
								<TabsTrigger value="tab1">Tab 1</TabsTrigger>
								<TabsTrigger value="tab2">Tab 2</TabsTrigger>
								<TabsTrigger value="tab3">Tab 3</TabsTrigger>
							</TabsList>
						</Tabs>
					</Row>
				</div>
			</Section>

			<Section title="Alerts">
				<div className="space-y-3">
					<Alert>
						<InfoIcon />
						<AlertTitle>Default Alert</AlertTitle>
						<AlertDescription>This is a default informational alert with a description.</AlertDescription>
					</Alert>
					<Alert variant="destructive">
						<WarningIcon />
						<AlertTitle>Destructive Alert</AlertTitle>
						<AlertDescription>Something went wrong. Please try again.</AlertDescription>
					</Alert>
				</div>
			</Section>

			<Section title="Loading States">
				<div className="space-y-3">
					<Row label="Spinner">
						<Spinner className="size-3" />
						<Spinner className="size-4" />
						<Spinner className="size-5" />
					</Row>
					<Row label="Skeleton">
						<div className="flex items-center gap-3">
							<Skeleton className="size-8 rounded-full" />
							<div className="space-y-1.5">
								<Skeleton className="h-3 w-32" />
								<Skeleton className="h-3 w-20" />
							</div>
						</div>
					</Row>
				</div>
			</Section>

			<Section title="Separator">
				<div className="space-y-2">
					<Row label="Horizontal">
						<Separator orientation="horizontal" className="w-full" />
					</Row>
					<Row label="Vertical (in row)">
						<div className="flex items-center gap-3">
							<span className="text-2xs text-text-600">Left</span>
							<Separator orientation="vertical" />
							<span className="text-2xs text-text-600">Right</span>
						</div>
					</Row>
				</div>
			</Section>
		</div>
	);
}
