import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSetTheme, useTheme } from "@/stores/use-global-settings-store";
import { ComponentsGallery } from "./components-gallery";
import { ConsistencyChecks } from "./consistency-checks";
import { TokensViewer } from "./tokens-viewer";

export default function DesignSystem() {
	const theme = useTheme();
	const setTheme = useSetTheme();

	return (
		<div className="min-h-screen bg-surface-base text-text-950">
			<header className="sticky top-0 z-10 flex items-center justify-between border-b bg-surface-execution px-4 py-2">
				<div className="flex items-center gap-3">
					<h1 className="text-sm font-semibold tracking-tight">Design System</h1>
					<span className="text-3xs text-text-400 uppercase tracking-wider">Internal</span>
				</div>
				<Button
					variant="ghost"
					size="icon"
					tone="base"
					onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
					aria-label="Toggle theme"
				>
					{theme === "dark" ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
				</Button>
			</header>

			<Tabs defaultValue="tokens" className="flex-1">
				<div className="border-b bg-surface-execution px-4">
					<TabsList variant="underline">
						<TabsTrigger value="tokens">Tokens</TabsTrigger>
						<TabsTrigger value="components">Components</TabsTrigger>
						<TabsTrigger value="consistency">Consistency</TabsTrigger>
					</TabsList>
				</div>

				<div className="p-4">
					<TabsContent value="tokens">
						<TokensViewer />
					</TabsContent>
					<TabsContent value="components">
						<ComponentsGallery />
					</TabsContent>
					<TabsContent value="consistency">
						<ConsistencyChecks />
					</TabsContent>
				</div>
			</Tabs>
		</div>
	);
}
