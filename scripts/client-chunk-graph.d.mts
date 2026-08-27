export const CLIENT_CHUNK_GRAPH_FILE: string;

export interface ClientChunkGraphChunk {
	modules: string[];
	imports: string[];
	dynamicImports: string[];
}

export interface ClientChunkGraph {
	version: 3;
	assets: string[];
	chunks: Record<string, ClientChunkGraphChunk>;
}

type ClientBuildOutput =
	| { type: "asset"; fileName: string }
	| {
			type: "chunk";
			fileName: string;
			modules: Record<string, unknown>;
			imports: string[];
			dynamicImports: string[];
			viteMetadata?: { importedAssets?: Iterable<string>; importedCss?: Iterable<string> };
	  };

export function resolveClientChunkGraphCacheFile(terminalDirectory: string): string;
export function removeClientChunkGraphFile(graphFile: string): void;
export function writeClientChunkGraphFile(graphFile: string, graph: ClientChunkGraph): void;
export function createClientChunkGraph(
	bundle: Record<string, ClientBuildOutput>,
	repositoryRoot: string,
): ClientChunkGraph;
