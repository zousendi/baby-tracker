import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const families = sqliteTable('families', {
  id: text('id').primaryKey(), name: text('name').notNull(),
  babyName: text('baby_name').notNull(), birthday: text('birthday').notNull().default(''),
  goalLow: integer('goal_low'), goalHigh: integer('goal_high'),
  version: integer('version').notNull().default(1), createdAt: integer('created_at').notNull(),
});
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), username: text('username').notNull(),
  displayName: text('display_name').notNull(), familyId: text('family_id').notNull().references(() => families.id),
  passwordHash: text('password_hash').notNull(), active: integer('active').notNull().default(1),
  createdAt: integer('created_at').notNull(),
}, t => [uniqueIndex('idx_users_username').on(t.username), index('idx_users_family').on(t.familyId)]);
export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
}, t => [index('idx_sessions_user').on(t.userId), index('idx_sessions_expiry').on(t.expiresAt)]);
export const records = sqliteTable('records', {
  id: text('id').primaryKey(), familyId: text('family_id').notNull().references(() => families.id),
  kind: text('kind').notNull(), at: text('at').notNull(), ml: integer('ml').notNull().default(0),
  left: integer('left_minutes').notNull().default(0), right: integer('right_minutes').notNull().default(0),
  milkType: text('milk_type').notNull().default('formula'), note: text('note').notNull().default(''),
  wakeAt: text('wake_at'),
  createdBy: text('created_by').notNull().references(() => users.id), updatedBy: text('updated_by').notNull().references(() => users.id),
  version: integer('version').notNull().default(1), updatedAt: integer('updated_at').notNull(),
}, t => [index('idx_records_family_at').on(t.familyId, t.at)]);
export const loginAttempts = sqliteTable('login_attempts', {
  key: text('key').primaryKey(), count: integer('count').notNull(), resetAt: integer('reset_at').notNull(),
}, t => [index('idx_login_attempts_reset').on(t.resetAt)]);
export const weights = sqliteTable('weights', {
  id: text('id').primaryKey(), familyId: text('family_id').notNull().references(() => families.id),
  day: text('day').notNull(), grams: integer('grams').notNull(), note: text('note').notNull().default(''),
  createdBy: text('created_by').notNull().references(() => users.id), updatedBy: text('updated_by').notNull().references(() => users.id),
  version: integer('version').notNull().default(1), updatedAt: integer('updated_at').notNull(),
}, t => [uniqueIndex('idx_weights_family_day').on(t.familyId, t.day)]);

// Notification storage is independent of existing records, accounts and sessions.
export const notificationSubscriptions = sqliteTable('notification_subscriptions', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(()=>users.id),
  familyId: text('family_id').notNull().references(()=>families.id), sessionHash: text('session_hash').notNull(),
  endpoint: text('endpoint').notNull(), p256dh: text('p256dh').notNull(), auth: text('auth').notNull(),
  language: text('language').notNull().default('ja'), familyEvents: integer('family_events').notNull().default(1),
  reminderMinutes: integer('reminder_minutes').notNull().default(0), createdAt: integer('created_at').notNull(),updatedAt: integer('updated_at').notNull(),
},t=>[index('idx_notification_family').on(t.familyId)]);
export const notificationOutbox = sqliteTable('notification_outbox', {
  id: text('id').primaryKey(), subscriptionId: text('subscription_id').notNull().references(()=>notificationSubscriptions.id,{onDelete:'cascade'}),
  kind: text('kind').notNull(),recordId: text('record_id').notNull(),recordAt: text('record_at'),
  reminderMinutes: integer('reminder_minutes').notNull().default(0), createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull(),
  attempts: integer('attempts').notNull().default(0), nextAttemptAt: integer('next_attempt_at').notNull().default(0),
  leaseUntil: integer('lease_until').notNull().default(0), deliveredAt: integer('delivered_at'),
},t=>[index('idx_notification_pending').on(t.deliveredAt,t.nextAttemptAt,t.expiresAt)]);
