export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode = 400,
    public readonly voiceMessage?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class TmsError extends Error {
  constructor(
    message: string,
    public readonly tmsCode?: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "TmsError";
  }
}
