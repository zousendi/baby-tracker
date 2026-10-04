export type Kind = 'milk' | 'breast' | 'pee' | 'poop' | 'both';
export type RecordItem = { id: string; kind: Kind; at: string; ml: number; left: number; right: number; milkType: 'formula' | 'expressed'; note: string; wakeAt?: string | null; version: number; author: string; updatedAt: number };
export type Family = { id: string; name: string; babyName: string; birthday: string; goalLow: number | null; goalHigh: number | null; version: number };
export type User = { id: string; username: string; displayName: string; familyId: string };
export type WeightRecord = { id: string; day: string; grams: number; note: string; version: number; author: string; updatedAt: number };
export type AppState = { user: User; family: Family; records: RecordItem[]; weights: WeightRecord[]; serverTime: number };
export type Language = 'ja' | 'zh';
