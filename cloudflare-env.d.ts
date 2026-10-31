declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    ADMIN_KEY?: string;
    PUSH_PUBLIC_KEY?: string;
    PUSH_PRIVATE_KEY?: string;
    PUSH_SUBJECT?: string;
    PUSH_JOB_KEY?: string;
    PUSH_REMINDERS_ENABLED?: string;
    BUCKET?: R2Bucket;
  }
}
