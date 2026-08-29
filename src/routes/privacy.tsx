import { createFileRoute } from "@tanstack/react-router";
import { CONTACT_URL, LegalPage } from "@/components/LegalPage";

// プライバシーポリシー (ログイン不要)。Google OAuth 同意画面に登録する URL でもある
export const Route = createFileRoute("/privacy")({
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage title="プライバシーポリシー" updatedAt="2026 年 8 月 29 日">
      <p>
        poi (以下「本サービス」) の運営者 (以下「運営者」) は、本サービスにおける利用者の個人情報の取り扱いについて、
        以下のとおりプライバシーポリシーを定めます。
      </p>

      <h2>1. 取得する情報</h2>
      <p>本サービスは、次の情報を取得・保存します。</p>
      <h3>Google アカウントの情報</h3>
      <p>Google アカウントでログインした際に、Google から次の情報を受け取ります。</p>
      <ul>
        <li>名前</li>
        <li>メールアドレス</li>
        <li>プロフィール画像の URL</li>
        <li>Google 上のアカウント ID、およびログイン処理のために Google が発行する認証トークン</li>
      </ul>
      <h3>利用者が入力した内容</h3>
      <ul>
        <li>板に書き込んだ本文と、各セクションの作成日時・有効期限</li>
      </ul>
      <h3>自動的に取得する情報</h3>
      <ul>
        <li>ログインセッションの管理のため、ログイン時の IP アドレスとブラウザの種類 (User-Agent)</li>
      </ul>
      <p>
        本サービスは、Cookie をログイン状態の維持のためにのみ使用します。アクセス解析や広告のための Cookie
        や外部サービスは使用していません。
      </p>

      <h2>2. 利用目的</h2>
      <p>取得した情報は、次の目的にのみ利用します。</p>
      <ul>
        <li>利用者を識別し、ログイン状態を維持するため</li>
        <li>利用者が書いた内容を保存し、同じ利用者の別の端末に同期して表示するため</li>
        <li>不正なアクセスの検知や防止、問い合わせへの対応のため</li>
      </ul>
      <p>取得した情報を広告、マーケティング、利用者の分析に利用することはありません。</p>

      <h2>3. 保存場所と保存期間</h2>
      <p>
        取得した情報は Cloudflare, Inc. が提供するサービス (Cloudflare Workers / D1) 上に保存されます。
        サーバーは日本国外に所在することがあります。
      </p>
      <ul>
        <li>
          板に書き込んだ内容は、各セクションが最初に書かれてから 30 日後に有効期限を迎え、期限を過ぎたものは
          自動的に削除されます。削除された内容は復元できません。
        </li>
        <li>Google アカウントの情報とログインセッションの情報は、アカウントが削除されるまで保存されます。</li>
        <li>
          オフラインでの閲覧のため、直近に取得した板の内容とログイン中の利用者の情報を、利用者の端末のブラウザ内
          (localStorage) にも保存します。これはログアウトすると削除されます。
        </li>
      </ul>

      <h2>4. 第三者への提供</h2>
      <p>
        運営者は、法令に基づく場合を除き、利用者の同意なく個人情報を第三者に提供しません。
        なお、ログインのために Google LLC の認証サービスを、情報の保存のために Cloudflare, Inc.
        のサービスを利用しています。それぞれの事業者における情報の取り扱いは、各社のプライバシーポリシーに従います。
      </p>
      <ul>
        <li>
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
            Google プライバシーポリシー
          </a>
        </li>
        <li>
          <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">
            Cloudflare Privacy Policy
          </a>
        </li>
      </ul>

      <h2>5. 安全管理</h2>
      <p>
        本サービスの通信はすべて暗号化 (HTTPS) されています。運営者は、利用者の個人情報への不正なアクセス、
        漏えい、改ざんを防ぐため、合理的な範囲で安全管理措置を講じます。
      </p>

      <h2>6. 開示・訂正・削除の請求</h2>
      <p>
        利用者は、自身の個人情報の開示、訂正、利用停止、削除 (アカウントの削除を含む) を求めることができます。
        下記の問い合わせ先までご連絡ください。本人確認のうえ、合理的な期間内に対応します。
      </p>
      <p>
        板の内容は、本サービス上で該当箇所を消すか、セクションの削除ボタンを押すことで利用者自身で削除できます。
      </p>

      <h2>7. Google API サービスの利用</h2>
      <p>
        本サービスが Google API から受け取った情報の利用は、
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google API サービスのユーザーデータに関するポリシー
        </a>
        (限定的使用の要件を含む) に従います。
      </p>

      <h2>8. ポリシーの変更</h2>
      <p>
        運営者は、必要に応じて本ポリシーを変更することがあります。変更後のポリシーは、本ページに掲載した時点から
        効力を生じます。重要な変更がある場合は、本サービス上で告知します。
      </p>

      <h2>9. 問い合わせ先</h2>
      <p>
        本ポリシーに関する問い合わせ、および個人情報の開示・削除の請求は、GitHub の Issue から受け付けています。
      </p>
      <p>
        <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
          {CONTACT_URL}
        </a>
      </p>
      <p>
        Issue は誰でも閲覧できます。メールアドレスなど公開したくない情報は Issue 本文に書かず、
        「削除を希望する」旨だけを記載してください。本人確認の方法は運営者から Issue 上で案内します。
      </p>
    </LegalPage>
  );
}
