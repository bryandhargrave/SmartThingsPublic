// Shared error type with no platform dependencies, so it can be imported by both
// the Node server and the Cloudflare Worker (and by the pure logic modules).
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
