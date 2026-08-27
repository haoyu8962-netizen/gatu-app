const USER_MENU_MODAL_LOAD_FALLBACK_MESSAGE = "User menu modal failed to load";

export class UserMenuModalLoadError extends Error {
	constructor(cause: unknown) {
		super(cause instanceof Error ? cause.message : USER_MENU_MODAL_LOAD_FALLBACK_MESSAGE, { cause });
		this.name = "UserMenuModalLoadError";
	}
}

export async function loadUserMenuModalModule<T>(importer: () => Promise<T>): Promise<T> {
	try {
		return await importer();
	} catch (error) {
		throw new UserMenuModalLoadError(error);
	}
}
