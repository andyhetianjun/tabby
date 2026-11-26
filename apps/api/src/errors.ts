export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = (what = "not found") => new ApiError(404, what);
export const badRequest = (message: string) => new ApiError(400, message);
