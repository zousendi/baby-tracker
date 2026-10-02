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
