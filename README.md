# こもれび — 家庭で共有する育児記録

授乳・ミルク・おしっこ・うんちを家族で共有する日本語／中国語（簡体字）Webアプリ。

## 現在の状態

- メール不要のユーザーID・パスワード認証と、家庭単位のアクセス制限を実装。
- D1データベースに記録・家庭・アカウント・セッションを保存。ブラウザには言語設定のみを保存。
- 10秒ごと、および画面に戻ったときに同期。同時編集時は409を返し、古い内容による上書きを防止。
- `/admin` の管理画面から家庭・アカウントを発行、停止・再開、パスワード再設定。
- 日本時間で日別に集計。端末のタイムゾーンが違っても家族間で一致。
- iPhoneサイズ、Edge・WebKitで記録、編集、ログイン、家庭分離を検証済み。
- **Sitesの登録・公開・クラウドDBへの初期アカウント作成は未実施。** このセッションにはSitesのネイティブ公開ツールが提供されていない。
- 検証用のローカルDBに「ゆうさくくん」の家庭と `ypapa`、`ymama` を作成済み。パスワードはユーザー指定値で設定（ソースには保存しない）。

## ミルク分析

- 24時間の授乳時刻・量と次の授乳までの間隔。日付をまたぐ間隔も含みます。
- 24時間リズムのログは新しい順。累積量の階段チャートで、おととい・昨日・今日を比較できます。今日の線は現在時刻まで、凡例の量は3日とも同時刻まで。過去の日付を選ぶと選択日と前2日の終日量を比較します。
- 記録編集画面は横スクロールを抑止し、縦スクロールを維持。`npm run test:rhythm-ui` でローカル開発サーバーに対してテスト用データによる画面検証を実行できます（DB不要、`TEST_BROWSER=webkit` でWebKit）。
- 直近7・14・30日の量とリズム、1回平均、量別の間隔（中央値・最短・最長・件数）を日本語／中国語で確認できます。
- 選択日の前7・14・30日と比較。当日は過去も同時刻までの合計を使用。対象のミルク記録がない日は平均から除外し、「記録なし」と表示します。
- 授乳後に起きた時刻を任意で記録し、家族間で同期。次の授乳を超える起床は集計から除外します。授乳からの経過時間で、睡眠時間・消化時間の推定ではありません。
- ミルク／搾母乳で絞り込み。次の授乳は直母も含めて対応付けます。次が未記録の授乳は間隔の集計に含めません。
- ミルク量の見守り・目標値設定を画面から撤去。既存の目標値のDB列は互換性のため保持し、分析には使用しません。

## 起動・ビルド

Node.js 22.13以上を使用。

```text
npm ci
node scripts/setup-local.mjs
npm run db:generate
npm run build
```

初回のみ、生成済みスキーマをローカルに適用する。既に適用済みのファイルは再実行しない。

```text
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_polite_bug.sql
npm run dev -- --port 5174
```

ローカルURL: http://127.0.0.1:5174/

管理画面: http://127.0.0.1:5174/admin

`setup-local.mjs` は十分に長いランダムな `ADMIN_KEY` を、Git対象外の `.dev.vars` と `.env` に保存する。管理者だけがこの値を使用する。家族アカウントに管理権限は付与しない。`.env.example` と `.dev.vars.example` は値を含まない。

Windowsの制限環境でDrizzleの `os.userInfo` が `ENOMEM` になる場合、この検証環境では `.sites-runtime/windows-userinfo.cjs` を `--require` して生成した。これは一時ディレクトリ名に環境変数のユーザー名を使うローカル補助で、クラウドには含めない。

## 起床時刻のDB移行

既存DBには `drizzle/0001_neat_sentry.sql` を1回だけ適用してください。適用済みの初期移行は再実行しません。新しい起床時刻はNULL可で、既存記録は保持します。

ローカルでの適用例（ビルド後）:

```text
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_neat_sentry.sql
```

新しいコードを公開する前に、ホストのDB移行フローでこの追加移行を適用してください。Gitへのpushでは、公開やクラウドDB移行は実行されません。

## Sites公開時の引き継ぎ

1. Sitesネイティブツールで新しいSiteを1つ登録し、返された `project_id` を `.openai/hosting.json` に追加する。現時点ではIDを発行できていないため捏造しない。
2. `d1: "DB"`、`r2: null` を維持。生成済み `drizzle/` を本番スキーマ移行に含める。適用済み移行は書き換えない。
3. 管理者専用のランダムな `ADMIN_KEY` をSitesのホスト側シークレットに設定する。ローカルのキーを公開ソースに含めない。
4. ネイティブSitesフローでソース同期・バージョン保存・公開する。Workerの出力は `dist/server/index.js`、クライアントは `dist/client`。
5. ユーザーはGPTアカウント不要の公開URLを希望している。Sitesの閲覧範囲は一般公開にし、アプリ自身のログインで記録を保護する。プライベートのSitesログインを代わりに採用しない。
6. **公開先で** 管理画面または `scripts/provision-family.mjs` を使い、「ゆうさくくん」に `ypapa`・`ymama` を作成する。公開先 `APP_URL` と `ADMIN_KEY` は実行環境で指定。入力JSONは標準入力で渡す。パスワードは元のユーザー指示を参照し、履歴やソースに埋め込まない。
7. 別セッションで共有・家庭分離を確認し、成功したネイティブツールが返したURLだけを案内する。

管理用バッチへの入力形は次のとおり（パスワードは実行時に置き換える）。

```json
{"name":"家庭名","users":[{"username":"user_id","displayName":"表示名","password":"実行時に指定"}]}
```

`provision-family.mjs` は既存アカウントのパスワードを変更しない。別の家庭に属する同名IDの移動も拒否する。

認証: パスワードはソルト付きPBKDF2、セッションは不透明なランダム値のハッシュを保存。CookieはHttpOnly・SameSite=Lax、本番はSecure。各更新に同一オリジンのカスタムヘッダーを要求し、家庭IDはログインセッションから確定する。ログイン試行数を制限し、停止・パスワード再設定時は既存セッションを失効させる。

## 検証

```text
npm run check
npm test
npm run test:integration
```

統合テストはローカル専用。既定ではランダムなパスワードの一時家庭・アカウントを作成します。既存の `ypapa` / `ymama` を使う場合だけ `TEST_FAMILY_PASSWORD` を指定します。`TEST_BROWSER=webkit` でWebKitを選択（既定はEdge）。必要に応じて `npx playwright install webkit`。本番URLにはテスト用家庭を作成しません。

テスト後は `.sites-runtime/test-cleanup-*.sql` があれば、上記D1ローカル実行と同様に適用してテスト専用家庭を片付けます。スクリーンショットはGit対象外の `artifacts/`。

WebMCPは対応ブラウザにのみ、現在読み込んだ自家庭の1日合計を返す読み取りツールを登録する。対応コンテキストが提供されていないため、実ブラウザのWebMCP呼び出し検証は未実施。通常の画面操作には影響しない。

## 仕様上の範囲

オフラインでの編集、通知、体重の記録、複数の赤ちゃんの切り替えは未実装。旧デモのブラウザ内データは自動移行しない。管理者は全家庭のアカウント情報を管理できる。一般ユーザーは所属する1家庭の記録のみを閲覧・編集できる。

分析は記録の比較であり、直母の分数をmlに換算しません。Sitesの利用条件への適合は実際の運用範囲に応じて確認する。

公式情報: https://learn.chatgpt.com/docs/sites
