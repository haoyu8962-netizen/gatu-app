import { useActiveAgentOwner } from "@gatu/hl-react";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { useExplicitAgentApproval } from "@/hooks/wallet/use-explicit-agent-approval";
import { useReconnectWallet, useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { formatExchangeActionError } from "@/lib/errors/format";
import { formatDateTime } from "@/lib/format";
import { type InfoResponse, useHyperliquid, useInfo } from "@/lib/hyperliquid";
import {
	type ApiWalletActionState,
	createApiWalletActionState,
	isApiWalletActionLocked,
	transitionApiWalletAction,
} from "./api-wallet-action-state";
import {
	type ApiWalletCredential,
	createApiWalletCredential,
	downloadApiWalletCredential,
} from "./api-wallet-credentials";
import { type ApiWalletReconciliationTarget, reconcileApiWalletAction } from "./api-wallet-reconciliation";
import {
	type ApiWalletApproval,
	type ApiWalletExpiryDays,
	type ApiWalletRemoval,
	createApiWalletApproval,
	createApiWalletRemoval,
	deriveApiWalletAgentStatus,
	deriveApiWalletPageState,
	isApiWalletExtraAgentSnapshot,
	isApiWalletPageOperable,
	validateApiWalletName,
} from "./api-wallet-state";
import type {
	ApiWalletActionSigner,
	ApiWalletActionView,
	ApiWalletAgentStatus,
	ApiWalletAgentView,
	ApiWalletViewProps,
} from "./api-wallet-view";

type ExtraAgentsResponse = InfoResponse<"extraAgents">;

interface ActiveAction {
	state: ApiWalletActionState;
	identityKey: string;
	ownerAddress: string;
	approval?: ApiWalletApproval;
	removal?: ApiWalletRemoval;
	errorMessage?: string;
	isPreflighting?: boolean;
	privateKeyVisible: boolean;
	credentialDownloaded: boolean;
}

interface ExecutionLease {
	abortController: AbortController;
	identityKey: string;
	token: symbol;
}

interface BoundCredential extends ApiWalletCredential {
	identityKey: string;
}

export interface ApiWalletControllerOptions {
	createCredential?: () => ApiWalletCredential;
}

export interface ApiWalletController extends Omit<ApiWalletViewProps, "onConfirmAction" | "onVerifyAgain"> {
	onConfirmAction: () => Promise<void>;
	onVerifyAgain: () => Promise<void>;
}

export function useApiWalletController({
	createCredential = createApiWalletCredential,
}: ApiWalletControllerOptions = {}): ApiWalletController {
	const { t, i18n } = useLingui();
	const wallet = useWalletSession();
	const { env } = useHyperliquid();
	const activeAgentOwner = useActiveAgentOwner();
	const approvalMutation = useExplicitAgentApproval();
	const { reconnectWallet } = useReconnectWallet();
	const accountAddress =
		wallet.sessionMode === "agent-only"
			? activeAgentOwner?.env === env
				? activeAgentOwner.address
				: undefined
			: wallet.address;
	const signingAddress = wallet.hasWalletAccess ? wallet.walletAddress : undefined;
	const agentsQuery = useInfo(
		"extraAgents",
		{ user: accountAddress ?? "" },
		{ enabled: Boolean(accountAddress), requestTimeoutMs: 10_000, retry: false },
	);
	const [name, setName] = useState("");
	const [validityDays, setValidityDays] = useState<ApiWalletExpiryDays>(90);
	const [generatedAddress, setGeneratedAddress] = useState<Address>();
	const credentialRef = useRef<BoundCredential | undefined>(undefined);
	const [activeAction, setActiveAction] = useState<ActiveAction | undefined>(undefined);
	const activeActionRef = useRef<ActiveAction | undefined>(undefined);
	const executionRef = useRef<ExecutionLease | undefined>(undefined);
	const mountedRef = useRef(true);
	const identityKey = createIdentityKey(env, accountAddress, signingAddress, wallet.sessionMode);
	const identityKeyRef = useRef(identityKey);
	identityKeyRef.current = identityKey;
	const identityBoundAction = activeAction?.identityKey === identityKey ? activeAction : undefined;
	const identityBoundCredential =
		credentialRef.current?.identityKey === identityKey ? credentialRef.current : undefined;
	activeActionRef.current = identityBoundAction;
	const validatedAgents = isApiWalletExtraAgentSnapshot(agentsQuery.data) ? agentsQuery.data : undefined;
	const hasMalformedSnapshot = agentsQuery.data !== undefined && validatedAgents === undefined;

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			executionRef.current?.abortController.abort();
			executionRef.current = undefined;
			credentialRef.current = undefined;
		};
	}, []);

	useEffect(() => {
		identityKeyRef.current = identityKey;
		executionRef.current?.abortController.abort();
		executionRef.current = undefined;
		credentialRef.current = undefined;
		setGeneratedAddress(undefined);
		setActiveAction(undefined);
	}, [identityKey]);

	const pageState = deriveApiWalletPageState({
		isConnected: wallet.isConnected,
		accountAddress,
		signingAddress,
		isLoading: agentsQuery.isLoading,
		isError: agentsQuery.isError || hasMalformedSnapshot,
		agents: validatedAgents,
	});
	const agents = createAgentViews(validatedAgents ?? [], i18n.locale, Date.now(), t);
	const nameValidation = validateApiWalletName(name, validatedAgents);
	const nameError = getNameError(name, nameValidation.error, t);
	const canOperate = isApiWalletPageOperable(pageState) && !identityBoundAction && !approvalMutation.isPending;
	const canGenerate = canOperate;
	const visibleGeneratedAddress = identityBoundCredential ? generatedAddress : undefined;
	const canAuthorize =
		canOperate && nameValidation.valid && Boolean(visibleGeneratedAddress && identityBoundCredential);

	function updateAction(next: ActiveAction | undefined): void {
		activeActionRef.current = next;
		setActiveAction(next);
	}

	function handleNameChange(nextName: string): void {
		if (!canOperate) return;
		if (generatedAddress) clearCredential();
		setName(nextName);
	}

	function handleValidityChange(nextValidity: ApiWalletExpiryDays): void {
		if (!canOperate) return;
		if (generatedAddress) clearCredential();
		setValidityDays(nextValidity);
	}

	function handleGenerate(): void {
		if (!canGenerate) return;
		const credential = { ...createCredential(), identityKey };
		credentialRef.current = credential;
		setGeneratedAddress(credential.address);
	}

	function handleAuthorize(): void {
		if (
			!canAuthorize ||
			!accountAddress ||
			!visibleGeneratedAddress ||
			!identityBoundCredential ||
			!nameValidation.valid
		) {
			return;
		}
		const approval = createApiWalletApproval(nameValidation.name, visibleGeneratedAddress, validityDays);
		updateAction({
			state: transitionApiWalletAction(createApiWalletActionState("authorize"), { type: "review" }),
			identityKey,
			ownerAddress: accountAddress,
			approval,
			privateKeyVisible: false,
			credentialDownloaded: false,
		});
	}

	function handleRemove(agentView: ApiWalletAgentView): void {
		if (!canOperate || !accountAddress) return;
		const agent = agentsQuery.data?.find(
			(item) => `${item.name}:${item.address}:${item.validUntil ?? "none"}` === agentView.id,
		);
		if (!agent) return;
		clearCredential();
		const removal = createApiWalletRemoval(agent);
		updateAction({
			state: transitionApiWalletAction(createApiWalletActionState("remove"), { type: "review" }),
			identityKey,
			ownerAddress: accountAddress,
			removal,
			privateKeyVisible: false,
			credentialDownloaded: false,
		});
	}

	function closeAction(): void {
		const current = activeActionRef.current;
		if (!current || current.isPreflighting || isApiWalletActionLocked(current.state)) return;
		if (
			current.state.action === "authorize" &&
			current.state.stage === "done" &&
			current.state.result === "success" &&
			!current.state.credentialsSaved
		) {
			return;
		}
		abortExecution();
		clearCredential();
		updateAction(undefined);
	}

	async function confirmAction(): Promise<void> {
		const current = activeActionRef.current;
		if (!current || current.isPreflighting) return;
		if (!actionIdentityIsCurrent(current, identityKeyRef.current)) return;
		if (current.state.stage === "done") {
			const retriedState = transitionApiWalletAction(current.state, { type: "retry" });
			if (retriedState === current.state || retriedState.stage !== "review") return;
			updateAction({ ...current, state: retriedState, errorMessage: undefined });
			return;
		}
		if (current.state.stage !== "review") return;

		const target = toReconciliationTarget(current);
		if (!target || !isCurrentIdentityOperable(current.identityKey, identityKeyRef.current, pageState)) {
			closeAction();
			return;
		}
		if (
			current.approval &&
			(!credentialRef.current || credentialRef.current.address.toLowerCase() !== current.approval.address.toLowerCase())
		) {
			closeAction();
			return;
		}
		const lease = startExecution(current.identityKey);
		updateAction({ ...current, errorMessage: undefined, isPreflighting: true });
		let freshSnapshot: Awaited<ReturnType<typeof agentsQuery.refetch>>;
		try {
			freshSnapshot = await agentsQuery.refetch({ cancelRefetch: true });
		} catch {
			if (!executionIsCurrent(lease)) return;
			const latest = activeActionRef.current;
			if (latest) {
				updateAction({
					...latest,
					errorMessage: t`Fresh API wallet data could not be verified before signing.`,
					isPreflighting: false,
				});
			}
			finishExecution(lease);
			return;
		}
		try {
			if (!executionIsCurrent(lease)) return;
			if (freshSnapshot.error != null || !isApiWalletExtraAgentSnapshot(freshSnapshot.data)) {
				const latest = activeActionRef.current;
				if (latest) {
					updateAction({
						...latest,
						errorMessage: t`Fresh API wallet data could not be verified before signing.`,
						isPreflighting: false,
					});
				}
				finishExecution(lease);
				return;
			}
			if (!preflightApiWalletAction(current, freshSnapshot.data)) {
				const latest = activeActionRef.current;
				if (latest) {
					updateAction({
						...latest,
						errorMessage: t`API wallet data changed before signing. Close this request and review the refreshed list.`,
						isPreflighting: false,
					});
				}
				finishExecution(lease);
				return;
			}
			const preflighted = activeActionRef.current;
			if (!preflighted) return;
			updateAction({
				...preflighted,
				state: transitionApiWalletAction(preflighted.state, { type: "requestSignature" }),
				isPreflighting: false,
			});
			await approvalMutation.mutateAsync(getApprovalParameters(current), {
				signal: lease.abortController.signal,
				applicationReview: "confirmed",
			});
			if (!executionIsCurrent(lease)) return;
			const awaiting = activeActionRef.current;
			if (!awaiting) return;
			const submittedState = transitionApiWalletAction(awaiting.state, { type: "signatureAccepted" });
			const reconcilingState = transitionApiWalletAction(submittedState, { type: "submissionAccepted" });
			updateAction({ ...awaiting, state: reconcilingState });
			await reconcileCurrentAction(lease, target);
		} catch (error) {
			if (!executionIsCurrent(lease) || lease.abortController.signal.aborted) return;
			const latest = activeActionRef.current;
			if (!latest) return;
			if (isUserRejectedRequest(error)) {
				updateAction({
					...latest,
					state: transitionApiWalletAction(latest.state, { type: "resolve", result: "rejected" }),
				});
				finishExecution(lease);
				return;
			}
			if (!isDeterministicApprovalError(error)) {
				const submitted =
					latest.state.stage === "awaiting"
						? transitionApiWalletAction(latest.state, { type: "signatureAccepted" })
						: latest.state;
				updateAction({ ...latest, state: transitionApiWalletAction(submitted, { type: "reconcile" }) });
				await reconcileCurrentAction(lease, target);
				return;
			}
			const submitted =
				latest.state.stage === "awaiting"
					? transitionApiWalletAction(latest.state, { type: "signatureAccepted" })
					: latest.state;
			updateAction({
				...latest,
				state: transitionApiWalletAction(submitted, { type: "resolve", result: "apiError" }),
				errorMessage: formatExchangeActionError(error, t`The API wallet request was rejected.`, (descriptor) =>
					t(descriptor),
				),
			});
			finishExecution(lease);
		}
	}

	async function reconcileCurrentAction(lease: ExecutionLease, target: ApiWalletReconciliationTarget): Promise<void> {
		try {
			const result = await reconcileApiWalletAction({
				target,
				signal: lease.abortController.signal,
				loadSnapshot: async () => {
					const snapshot = await agentsQuery.refetch({ cancelRefetch: true });
					return { data: snapshot.data, error: snapshot.error };
				},
			});
			if (!executionIsCurrent(lease)) return;
			const current = activeActionRef.current;
			if (!current) return;
			updateAction({
				...current,
				state: transitionApiWalletAction(current.state, {
					type: "resolve",
					result: result.status === "success" ? "success" : "unknown",
				}),
				errorMessage:
					result.status === "unknown" && result.reason === "conflict"
						? t`Another API wallet with this exact name appeared while removal was being verified.`
						: undefined,
			});
			if (result.status !== "success" && current.state.action === "authorize") {
				setGeneratedAddress(current.approval?.address as Address | undefined);
			}
			finishExecution(lease);
		} catch {
			if (!executionIsCurrent(lease) || lease.abortController.signal.aborted) return;
			const current = activeActionRef.current;
			if (!current) return;
			updateAction({
				...current,
				state: transitionApiWalletAction(current.state, { type: "resolve", result: "unknown" }),
			});
			finishExecution(lease);
		}
	}

	async function verifyAgain(): Promise<void> {
		const current = activeActionRef.current;
		if (!current || current.state.stage !== "done" || current.state.result !== "unknown") return;
		const target = toReconciliationTarget(current);
		if (!target || !isCurrentIdentityOperable(current.identityKey, identityKeyRef.current, pageState)) return;
		const lease = startExecution(current.identityKey);
		updateAction({ ...current, state: transitionApiWalletAction(current.state, { type: "retry" }) });
		await reconcileCurrentAction(lease, target);
	}

	function handleCredentialSavedChange(saved: boolean): void {
		const current = activeActionRef.current;
		if (!current || !current.credentialDownloaded || saved === current.state.credentialsSaved) return;
		if (!saved) return;
		updateAction({
			...current,
			state: transitionApiWalletAction(current.state, { type: "acknowledgeCredentials" }),
		});
	}

	function handleDownloadCredential(): void {
		const current = activeActionRef.current;
		const credential = credentialRef.current;
		if (
			!current?.approval ||
			!credential ||
			current.state.result !== "success" ||
			!actionIdentityIsCurrent(current, identityKeyRef.current) ||
			credential.address.toLowerCase() !== current.approval.address.toLowerCase()
		) {
			return;
		}
		downloadApiWalletCredential({
			accountAddress: current.ownerAddress,
			agentAddress: credential.address,
			agentName: current.approval.baseName,
			privateKey: credential.privateKey,
		});
		updateAction({ ...current, credentialDownloaded: true });
	}

	function finishAction(): void {
		const current = activeActionRef.current;
		if (!current || current.state.stage !== "done" || current.state.result !== "success") return;
		if (!actionIdentityIsCurrent(current, identityKeyRef.current)) return;
		if (current.state.action === "authorize" && !current.state.credentialsSaved) return;
		abortExecution();
		clearCredential();
		setName("");
		updateAction(undefined);
		void agentsQuery.refetch({ cancelRefetch: true });
	}

	const actionSigner: ApiWalletActionSigner = wallet.walletIntent === "embedded" ? "embedded" : "external";
	const actionView = createActionView(
		identityBoundAction,
		identityBoundCredential?.privateKey,
		i18n.locale,
		actionSigner,
		t,
	);

	return {
		pageState,
		accountAddress,
		accountLabel: env === "Testnet" ? t`Hyperliquid testnet account` : t`Hyperliquid account`,
		name,
		nameError,
		generatedAddress: visibleGeneratedAddress,
		validityDays,
		agents,
		action: actionView,
		canGenerate,
		canAuthorize,
		isRefreshing: agentsQuery.isFetching,
		onNameChange: handleNameChange,
		onValidityChange: handleValidityChange,
		onGenerate: handleGenerate,
		onAuthorize: handleAuthorize,
		onRemove: handleRemove,
		onRetry: () => void agentsQuery.refetch({ cancelRefetch: true }),
		onConnect: () => void reconnectWallet(),
		onCloseAction: closeAction,
		onConfirmAction: confirmAction,
		onVerifyAgain: verifyAgain,
		onTogglePrivateKey: () => {
			const current = activeActionRef.current;
			if (!current || current.state.result !== "success") return;
			updateAction({ ...current, privateKeyVisible: !current.privateKeyVisible });
		},
		onDownloadCredential: handleDownloadCredential,
		onCredentialSavedChange: handleCredentialSavedChange,
		onFinishAction: finishAction,
	};

	function startExecution(key: string): ExecutionLease {
		abortExecution();
		const lease = { abortController: new AbortController(), identityKey: key, token: Symbol("api-wallet-action") };
		executionRef.current = lease;
		return lease;
	}

	function executionIsCurrent(lease: ExecutionLease): boolean {
		return (
			mountedRef.current &&
			executionRef.current?.token === lease.token &&
			!lease.abortController.signal.aborted &&
			identityKeyRef.current === lease.identityKey
		);
	}

	function abortExecution(): void {
		executionRef.current?.abortController.abort();
		executionRef.current = undefined;
	}

	function finishExecution(lease: ExecutionLease): void {
		if (executionRef.current?.token === lease.token) executionRef.current = undefined;
	}

	function clearCredential(): void {
		credentialRef.current = undefined;
		setGeneratedAddress(undefined);
	}
}

function createActionView(
	action: ActiveAction | undefined,
	privateKey: Hex | undefined,
	locale: string,
	signer: ApiWalletActionSigner,
	t: ReturnType<typeof useLingui>["t"],
): ApiWalletActionView | null {
	if (!action || action.state.stage === "input") return null;
	const approval = action.approval;
	const target = approval ?? action.removal?.target;
	if (!target) return null;
	const result = action.state.result ?? undefined;
	return {
		open: true,
		kind: action.state.action,
		stage: action.state.stage,
		signer,
		result,
		agentName: approval?.baseName ?? action.removal?.target.name ?? "",
		agentAddress: approval?.address ?? action.removal?.target.address ?? "",
		validityLabel:
			action.state.action === "authorize"
				? formatValidityDays(approval ? Math.ceil((approval.validUntil - Date.now()) / 86_400_000) : 0, t)
				: formatValidityDate(action.removal?.target.validUntil ?? null, locale, t),
		errorMessage: action.errorMessage,
		privateKey: result === "success" && action.state.action === "authorize" ? privateKey : undefined,
		privateKeyVisible: action.privateKeyVisible,
		credentialDownloaded: action.credentialDownloaded,
		credentialSaved: action.state.credentialsSaved,
		locked: isApiWalletActionLocked(action.state) || action.isPreflighting === true,
	};
}

function createAgentViews(
	agents: ExtraAgentsResponse,
	locale: string,
	nowMs: number,
	t: ReturnType<typeof useLingui>["t"],
): ApiWalletAgentView[] {
	return agents.map((agent) => {
		const status = deriveApiWalletAgentStatus(agent.validUntil, nowMs);
		return {
			id: `${agent.name}:${agent.address}:${agent.validUntil ?? "none"}`,
			name: agent.name,
			address: agent.address,
			expiresAt: agent.validUntil === null ? null : new Date(agent.validUntil).toISOString(),
			expiryLabel: formatValidityDate(agent.validUntil, locale, t),
			status: mapAgentStatus(status),
			statusDetail: getStatusDetail(status, agent.validUntil, nowMs, t),
		};
	});
}

function mapAgentStatus(status: ReturnType<typeof deriveApiWalletAgentStatus>): ApiWalletAgentStatus {
	return status;
}

function getStatusDetail(
	status: ReturnType<typeof deriveApiWalletAgentStatus>,
	validUntil: number | null,
	nowMs: number,
	t: ReturnType<typeof useLingui>["t"],
): string | undefined {
	if (status === "today") return t`Expires today`;
	if (status !== "expiring" || validUntil === null) return undefined;
	const days = Math.max(1, Math.ceil((validUntil - nowMs) / 86_400_000));
	return t`${days} days left`;
}

function getNameError(
	name: string,
	error: ReturnType<typeof validateApiWalletName>["error"],
	t: ReturnType<typeof useLingui>["t"],
): string | undefined {
	if (!name) return undefined;
	if (error === "required") return t`Enter an API wallet name.`;
	if (error === "format") return t`Use 2–16 letters, numbers, underscores, or hyphens.`;
	if (error === "duplicate") return t`This name already exists. A duplicate would replace the existing API wallet.`;
	return undefined;
}

function formatValidityDays(days: number, t: ReturnType<typeof useLingui>["t"]): string {
	return t`${days} days`;
}

function formatValidityDate(validUntil: number | null, locale: string, t: ReturnType<typeof useLingui>["t"]): string {
	if (validUntil === null) return t`Not reported`;
	return formatDateTime(validUntil, { locale, dateStyle: "medium" });
}

function toReconciliationTarget(action: ActiveAction): ApiWalletReconciliationTarget | undefined {
	if (action.approval) return { kind: "authorize", approval: action.approval };
	if (action.removal) return { kind: "remove", removal: action.removal };
	return undefined;
}

function getApprovalParameters(action: ActiveAction): { agentAddress: string; agentName: string } {
	if (action.approval) return action.approval.approveAgent;
	if (action.removal) return action.removal.approveAgent;
	throw new Error("API wallet action is missing approval parameters");
}

function preflightApiWalletAction(action: ActiveAction, agents: ExtraAgentsResponse): boolean {
	if (action.approval) {
		const normalizedName = action.approval.baseName.toLowerCase();
		return !agents.some((agent) => agent.name.toLowerCase() === normalizedName);
	}
	if (action.removal) {
		const sameNameAgents = agents.filter((agent) => agent.name === action.removal?.target.name);
		return (
			sameNameAgents.length === 1 &&
			sameNameAgents[0]?.address.toLowerCase() === action.removal.target.address.toLowerCase() &&
			sameNameAgents[0]?.validUntil === action.removal.target.validUntil
		);
	}
	return false;
}

function isCurrentIdentityOperable(
	expected: string,
	current: string,
	pageState: ApiWalletViewProps["pageState"],
): boolean {
	return expected === current && isApiWalletPageOperable(pageState);
}

function isUserRejectedRequest(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const candidate = error as { code?: unknown; message?: unknown };
	return (
		candidate.code === 4001 ||
		(typeof candidate.message === "string" &&
			/user rejected|user denied|rejected the request in (?:the )?wallet|request rejected by (?:the )?user/i.test(
				candidate.message,
			))
	);
}

function isDeterministicApprovalError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return error.name === "ApiRequestError" || error.name === "ValidationError";
}

function createIdentityKey(
	env: string,
	accountAddress: string | undefined,
	signingAddress: string | undefined,
	sessionMode: string,
): string {
	return `${env}:${accountAddress?.toLowerCase() ?? "disconnected"}:${signingAddress?.toLowerCase() ?? "no-signer"}:${sessionMode}`;
}

function actionIdentityIsCurrent(action: ActiveAction, currentIdentityKey: string): boolean {
	return action.identityKey === currentIdentityKey;
}
