export async function withAuthenticationRecovery<T>({
  mutation,
  request,
  isAuthenticationError,
  renew,
  mutationExpiredError,
}: {
  mutation: boolean;
  request: () => Promise<T>;
  isAuthenticationError: (error: unknown) => boolean;
  renew: () => Promise<void>;
  mutationExpiredError: () => Error;
}): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!isAuthenticationError(error)) throw error;
    await renew();
    if (mutation) throw mutationExpiredError();
    return request();
  }
}
