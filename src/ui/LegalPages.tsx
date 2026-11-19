import { useEffect, useRef, useState, type ReactNode } from 'react'
import { APP_RESTORE_URL, hasAppBridge } from '../io/appBridge'
import {
  createProCheckout,
  createBillingPortal,
  syncBilling,
  CloudError,
  loginUrl,
  logoutUrl,
  deleteAccountUrl,
  listCloudProjects,
  isNativeApp,
  APP_STORE_SUBSCRIPTIONS_URL,
  NATIVE_PURCHASE_URL,
  updateProfile,
} from '../io/cloud'
import { patchSessionUser, refreshSession, useCloudSession } from '../io/cloudSession'

const OPERATOR = {
  name: '一ノ宮 綾平',
  handle: 'tomoshibi',
  postalCode: '〒600-8846',
  addressLine1: '京都府京都市下京区朱雀宝蔵町44番地 協栄ビル2階',
  addressLine2: '京都朱雀スタジオAX-401',
  contactDisclosurePolicy: '請求があれば遅滞なく開示いたします。下記メールアドレスまでご連絡ください。',
  email: 'support@gikyokutosyokan.com',
  telecomNotice: 'A-08-23628(令和8年5月18日届出)',
}

const SERVICE = {
  name: 'TOMOSHIBI小屋',
  url: 'https://tomoshibi.gikyokutosyokan.com',
  proPriceMonthly: 300,
}

const UPDATED = '2026年11月16日'

function Layout({ title, children, showUpdated = true }: { title: string; children: ReactNode; showUpdated?: boolean }) {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <a href="/" className="legal-back">← {SERVICE.name}に戻る</a>
      </header>
      <main className="legal-main">
        <h1>{title}</h1>
        {children}
        <footer className="legal-foot">
          {showUpdated && <p>最終更新日: {UPDATED}</p>}
          <nav>
            <a href="/terms">利用規約</a> ・
            <a href="/privacy">プライバシーポリシー</a> ・
            <a href="/tokushoho">特定商取引法に基づく表記</a> ・
            <a href="/pro">Pro プラン</a> ・
            <a href="/contact">お問い合わせ</a>
          </nav>
        </footer>
      </main>
    </div>
  )
}

export function TermsPage() {
  return (
    <Layout title="利用規約">
      <p>本規約は、{OPERATOR.name}(以下「当方」)が提供するウェブサービス「{SERVICE.name}」(以下「本サービス」)の利用条件を定めるものです。ユーザー(以下「利用者」)は、本規約に同意のうえ本サービスを利用するものとします。</p>

      <h2>第1条(適用)</h2>
      <p>本規約は、本サービスの利用に関する当方と利用者との間の一切の関係に適用されます。</p>

      <h2>第2条(利用登録)</h2>
      <ol>
        <li>本サービスの一部機能を利用するにあたっては、姉妹サービスである戯曲図書館アカウント(Google 認証)による認証が必要となる場合があります。虚偽の情報を登録することは禁止します。</li>
        <li>未成年者が本サービスの有料プランに申し込む場合には、事前に親権者の同意を得るものとします。有料プランへの申し込みがなされた時点で、当方は当該同意が得られているものとみなします。</li>
        <li>当方は、利用者が反社会的勢力(暴力団、暴力団員、暴力団準構成員、暴力団関係企業、総会屋、社会運動等標榜ゴロその他これらに準ずる者)に該当すると判断した場合、事前の通知なく本サービスの利用を停止・登録抹消することができます。</li>
      </ol>

      <h2>第3条(有料プラン)</h2>
      <ol>
        <li>本サービスは無料で基本機能を利用でき、月額課金制の Pro プランにより追加機能を利用できます。</li>
        <li>Pro プランは月額 {SERVICE.proPriceMonthly} 円(税込)で、毎月自動更新されます。</li>
        <li>解約はいつでも可能で、次回更新日の前日までに解約手続きを行うことで、以降の課金は停止されます。当該課金期間中は、有料機能を引き続き利用できます。</li>
        <li>すでに支払い済みの料金は、原則として返金いたしません。ただし、法令上返金が必要な場合、および当方の重大な過失により本サービスを提供できない場合はこの限りではありません。</li>
      </ol>

      <h2>第4条(禁止事項)</h2>
      <p>利用者は本サービスの利用にあたり、次の行為を行ってはなりません:</p>
      <ul>
        <li>法令または公序良俗に違反する行為</li>
        <li>本サービスの運営を妨害する行為、サーバーへの過度な負荷を与える行為</li>
        <li>本サービスのソースコードの解析、リバースエンジニアリング、不正アクセス</li>
        <li>他の利用者、第三者、または当方の権利を侵害する行為</li>
        <li>本サービスを用いて商用の広告・宣伝を無断で行う行為</li>
      </ul>

      <h2>第5条(本サービスの提供の停止等)</h2>
      <p>当方は、次の場合には利用者に事前通知することなく、本サービスの全部または一部の提供を停止または中断できるものとします:</p>
      <ul>
        <li>本サービスにかかるシステムの保守点検・更新を行う場合</li>
        <li>地震・停電・火災・戦争・その他の不可抗力により提供が困難となった場合</li>
        <li>その他、当方が停止・中断を必要と判断した場合</li>
      </ul>

      <h2>第6条(著作権・知的財産権)</h2>
      <p>本サービスに関する著作権、その他一切の知的財産権は、当方または当方に対して使用許諾を行っている権利者に帰属します。利用者が本サービスを通じて作成したシーンデータ等の著作権は利用者に帰属しますが、当方はこれをサービス運営の目的で保管・表示することができます。</p>

      <h2>第7条(免責事項)</h2>
      <ol>
        <li>当方は、本サービスの内容の正確性、完全性、有用性等について保証するものではありません。</li>
        <li>本サービスに事実上または法律上の瑕疵(安全性、信頼性、正確性、完全性、有効性、特定目的への適合性、セキュリティ等に関する欠陥、エラーやバグ、権利侵害等)がないことを明示的にも黙示的にも保証しません。</li>
        <li>当方は、本サービスに起因して利用者に生じたあらゆる損害について、当方の故意または重過失による場合を除き、責任を負いません。</li>
      </ol>

      <h2>第8条(サービス内容の変更・終了)</h2>
      <p>当方は、利用者への事前通知をもって本サービスの内容を変更、または本サービスの提供を終了することができるものとします。</p>

      <h2>第9条(利用規約の変更)</h2>
      <p>当方は、必要と判断した場合、利用者への通知(本サービス上での告知を含む)により、本規約を変更できるものとします。</p>

      <h2>第10条(準拠法・裁判管轄)</h2>
      <p>本規約の解釈にあたっては、日本法を準拠法とします。本サービスに関して紛争が生じた場合には、当方の所在地を管轄する裁判所を専属的合意管轄とします。</p>
    </Layout>
  )
}

export function PrivacyPage() {
  return (
    <Layout title="プライバシーポリシー">
      <p>{OPERATOR.name}(以下「当方」)は、{SERVICE.name}(以下「本サービス」)における個人情報の取り扱いについて、以下のとおりプライバシーポリシー(以下「本ポリシー」)を定めます。</p>

      <h2>1. 取得する情報</h2>
      <ul>
        <li>認証情報: Google アカウントを用いた認証によるメールアドレス、表示名、プロフィール画像</li>
        <li>サービス利用情報: 保存されたプロジェクト・旧シーンデータ、操作ログ</li>
        <li>決済情報: Pro プランをご利用の場合、Stripe 等の決済事業者を通じたお名前、メールアドレス、支払い方法(カード情報は当方は保持せず、決済事業者が管理します)</li>
        <li>技術情報: IP アドレス、ブラウザ種別、アクセス日時等</li>
        <li>アプリの利用状況とクラッシュ情報(iOS アプリ版): 画面の表示・操作の記録、アプリのバージョン、端末の機種・OS のバージョン、強制終了時の技術的な記録、端末ごとの識別子。個人を特定する目的では利用しません</li>
      </ul>

      <h2>2. 利用目的</h2>
      <ul>
        <li>本サービスの提供・維持・改善のため</li>
        <li>利用者からのお問い合わせに対応するため</li>
        <li>Pro プランの課金処理および会計処理のため</li>
        <li>利用規約に違反する行為への対応のため</li>
        <li>本サービスに関する重要なお知らせを送信するため</li>
      </ul>

      <h2>3. 第三者提供</h2>
      <p>当方は、以下の場合を除き、取得した個人情報を第三者に提供しません:</p>
      <ul>
        <li>利用者の同意がある場合</li>
        <li>法令に基づく場合</li>
        <li>決済処理のため決済事業者(Stripe 等)に必要な情報を提供する場合</li>
        <li>サービス運営を委託する外部事業者(ホスティング、認証、分析等)に業務上必要な範囲で提供する場合</li>
      </ul>

      <h2>4. Cookie 等の利用</h2>
      <p>本サービスでは、利便性向上のため Cookie を使用する場合があります。ブラウザの設定により Cookie を無効化することも可能ですが、その場合本サービスの一部機能が利用できなくなることがあります。</p>
      <p>ウェブ版では、無料プランの利用者とログインしていない利用者に、第三者配信の広告サービス「Google AdSense」による広告を表示します。Google などの第三者配信事業者は、Cookie を使用して、利用者が本サービスやほかのウェブサイトに過去にアクセスした際の情報に基づいて広告を配信することがあります。利用者は、<a href="https://adssettings.google.com/" target="_blank" rel="noreferrer">Google の広告設定</a>でパーソナライズ広告を無効にできます。Google による情報の使い方は、<a href="https://policies.google.com/technologies/ads" target="_blank" rel="noreferrer">Google のポリシーと規約</a>をご覧ください。Pro プランの利用者には、広告を表示しません。</p>
      <p>iOS アプリ版では、無料プランの利用者とログインしていない利用者に、Google の広告サービス「Google AdMob」による広告を画面の下に表示します。端末の広告識別子は、利用者がトラッキングを許可した場合にだけ、広告の配信に使います。許可しない場合は、パーソナライズしない広告を表示します。</p>

      <h2>5. 外部サービスの利用</h2>
      <ul>
        <li>認証: 姉妹サービス「戯曲図書館」および Google OAuth</li>
        <li>決済: Stripe 等の決済事業者</li>
        <li>ホスティング: Cloudflare, Inc.</li>
        <li>広告配信(ウェブ版の無料プラン): Google AdSense</li>
        <li>広告配信(iOS アプリ版の無料プラン): Google AdMob</li>
        <li>アプリの利用状況の統計・クラッシュ情報の収集(iOS アプリ版): Google Firebase(Firebase Analytics・Firebase Crashlytics)</li>
      </ul>
      <p>これらのサービスにおける情報の取り扱いは、各サービスのプライバシーポリシーに従います。</p>

      <h2>6. 個人情報の開示・訂正・削除</h2>
      <p>利用者は、当方が保有する自己の個人情報について、開示、訂正、削除を請求することができます。下記お問い合わせ先までご連絡ください。</p>

      <h2>6-2. アカウント削除および保有データの取り扱い</h2>
      <ul>
        <li>利用者はいつでもアカウント削除を請求できます。</li>
        <li>アカウント削除の受付後、認証情報およびシーンデータ等の利用者に紐づく個人情報は、法令に基づく保存義務のある情報(会計帳簿・課税関係書類等)を除き、原則として30日以内に削除いたします。</li>
        <li>削除後のデータの復元はできません。</li>
      </ul>

      <h2>7. お問い合わせ先</h2>
      <p>{OPERATOR.name}<br />メール: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a></p>

      <h2>8. 本ポリシーの変更</h2>
      <p>本ポリシーの内容は、法令その他本ポリシーに別段の定めのある事項を除いて、利用者に通知することなく変更することができるものとします。</p>
    </Layout>
  )
}

export function TokushohoPage() {
  return (
    <Layout title="特定商取引法に基づく表記">
      <p className="legal-note-top">特定商取引に関する法律第11条に基づき、以下のとおり表記します。</p>
      <table className="legal-table">
        <tbody>
          <tr><th>販売事業者</th><td>{OPERATOR.name}</td></tr>
          <tr><th>運営責任者</th><td>{OPERATOR.name}</td></tr>
          <tr>
            <th>所在地</th>
            <td>
              {OPERATOR.postalCode}<br />
              {OPERATOR.addressLine1}<br />
              {OPERATOR.addressLine2}
            </td>
          </tr>
          <tr><th>電話番号</th><td>{OPERATOR.contactDisclosurePolicy}</td></tr>
          <tr><th>メールアドレス</th><td><a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a></td></tr>
          <tr><th>電気通信事業届出番号</th><td>{OPERATOR.telecomNotice}</td></tr>
          <tr><th>サービス名</th><td>{SERVICE.name}</td></tr>
          <tr><th>URL</th><td><a href={SERVICE.url}>{SERVICE.url}</a></td></tr>
          <tr><th>販売価格</th><td>Pro プラン: 月額 {SERVICE.proPriceMonthly} 円(消費税込)</td></tr>
          <tr><th>販売価格以外の必要料金</th><td>本サービス利用に必要な通信料は利用者様負担となります。</td></tr>
          <tr><th>お支払い方法</th><td>Web 版: クレジットカード決済（Stripe。Visa / Mastercard / American Express / JCB 等、決済事業者の対応範囲による）<br />iOS アプリ: App Store のアプリ内課金（Apple ID に登録したお支払い方法）</td></tr>
          <tr><th>お支払い時期</th><td>初回: お申し込み時に即時決済<br />2回目以降: 各更新日 (毎月、お申し込み日と同日) に自動更新・自動決済（App Store でのお申し込みは、Apple の定める時期に決済されます）</td></tr>
          <tr><th>サービスの提供時期</th><td>決済完了後、即時に有料機能をご利用いただけます。</td></tr>
          <tr><th>返品・キャンセルについて</th><td>デジタルサービスの性質上、決済完了後の返金は原則としてお受けしておりません。ただし、当方の重大な過失または法令に基づく場合はこの限りではありません。App Store でのお申し込みの返金は、Apple の定める手続きでお申し出ください。</td></tr>
          <tr><th>解約について</th><td>Web でお申し込みの方は、アカウントの画面の「契約の管理」から、App Store でお申し込みの方は、iPhone の「設定」→ 自分の名前 →「サブスクリプション」から、いつでもご自身で解約できます。次回更新日の前日までに解約手続きを行うことで、以降の課金は停止されます。当該課金期間の残日数分は引き続き有料機能をご利用いただけます。</td></tr>
          <tr><th>動作環境</th><td>WebGL 対応の最新のウェブブラウザ (Google Chrome / Safari / Firefox / Edge 等)</td></tr>
        </tbody>
      </table>
    </Layout>
  )
}

export function ProPage() {
  const { user } = useCloudSession()
  const isPro = user?.plan === 'pro'
  return (
    <Layout title="Pro プラン">
      <p className="pro-lead">{isPro
        ? 'Proプランをご利用中です。プロジェクトを10件まで保存でき、広告は表示されません。'
        : <>{SERVICE.name}で複数の舞台を計画する方へ。<br />アカウントに10件まで保存でき、広告が出なくなるProプラン。</>}</p>

      <div className="pro-price-card">
        {isPro && <h2 style={{ marginTop: 0 }}>現在のプラン：Pro <span style={{ fontSize: 14 }}>契約中</span></h2>}
        <div className="pro-price-amount">¥{SERVICE.proPriceMonthly}<span>/月</span></div>
        <div className="pro-price-sub">税込・自動更新・いつでも解約可能</div>
        <ProSubscribeButton />
        {hasAppBridge() && <a className="pro-restore-link" href={APP_RESTORE_URL}>購入を復元</a>}
      </div>

      <ExistingWebSubscription />

      <h2>Free プランと Pro プランの違い</h2>
      <table className="legal-table">
        <thead>
          <tr><th></th><th>Free</th><th>Pro</th></tr>
        </thead>
        <tbody>
          <tr><td>演出プランの基本機能</td><td>◯</td><td>◯</td></tr>
          <tr><td>すべての照明器具</td><td>◯</td><td>◯</td></tr>
          <tr><td>アカウントへのプロジェクト保存</td><td>2件まで</td><td><strong>10件まで</strong></td></tr>
          <tr><td>広告</td><td>あり</td><td><strong>なし</strong></td></tr>
        </tbody>
      </table>

      <h2>お支払い・解約について</h2>
      <ul>
        <li>初回課金は Pro プラン申し込み時に即時決済されます</li>
        <li>2回目以降は毎月同日に自動更新されます</li>
        <li>解約はいつでもできます。Web で申し込んだ方はアカウントの画面の「契約の管理」から、App Store で申し込んだ方は iPhone の「設定」→ 自分の名前 →「サブスクリプション」から解約します</li>
        <li>解約後も、次回更新日までは Pro 機能を引き続きご利用いただけます</li>
      </ul>

      <h2>よくあるご質問</h2>
      <dl className="faq">
        <dt>Free プランでも使い続けられますか?</dt>
        <dd>はい。演出プランの基本機能は Free プランでも使えます。Pro プランでは、アカウントに保存できるプロジェクトが 10 件になり、広告が出なくなります。</dd>
        <dt>いつでも解約できますか?</dt>
        <dd>はい。Web で申し込んだ方はアカウントの画面の「契約の管理」から、App Store で申し込んだ方は iPhone の「設定」から解約できます。違約金等は一切かかりません。</dd>
        <dt>Pro プランを解約した後、保存していたプロジェクトはどうなりますか?</dt>
        <dd>保存済みのプロジェクトは残り、閲覧・編集できます。Free プランの上限である 2 件を超えている場合は、新しいプロジェクトの追加はできません。</dd>
        <dt>領収書は発行されますか?</dt>
        <dd>Web（Stripe）でのお申し込みは、決済完了時に領収書のメールが届きます。App Store でのお申し込みは、Apple から領収書のメールが届き、App Store の購入履歴でも確認できます。</dd>
      </dl>

      <p className="legal-note"><a href="/tokushoho">特定商取引法に基づく表記</a> / <a href="/terms">利用規約</a> / <a href="/privacy">プライバシーポリシー</a></p>
    </Layout>
  )
}

function ExistingWebSubscription() {
  const { user } = useCloudSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [needsLogin, setNeedsLogin] = useState(false)
  if (user?.plan === 'pro') return null
  return <details style={{ borderTop: '1px solid rgba(212,175,111,0.25)', padding: '20px 0', margin: '24px 0' }}>
    <summary style={{ cursor: 'pointer', minHeight: 44, display: 'list-item', alignContent: 'center' }}>購入済みなのにProにならない方</summary>
    <div style={{ padding: '8px 0 16px' }}>
    {hasAppBridge() && <p>App Store で購入した方は、上の「購入を復元」を押してください。以下は Web（Stripe）で契約した方向けです。</p>}
    <BillingVerification />
    <p>契約の管理・解約だけ行う場合はこちら。</p>
    <button className="pro-subscribe-btn" disabled={busy} onClick={async () => {
      setBusy(true); setError(''); setNeedsLogin(false)
      try {
        const { url } = await createBillingPortal()
        location.href = url
      } catch (e) {
        setNeedsLogin(e instanceof CloudError && e.status === 401)
        setError(e instanceof CloudError && e.status === 401
          ? '契約したアカウントでログインしてから、もう一度お試しください。'
          : e instanceof CloudError ? e.message : '管理画面を開けませんでした。時間をおいてお試しください。')
        setBusy(false)
      }
    }}>{busy ? '管理画面を開いています…' : 'Web契約の管理・解約'}</button>
    {error && <p role="alert">{error}</p>}
    {needsLogin && <a href={loginUrl()}>契約したアカウントでログインする →</a>}
    <p className="pro-subscribe-note">解約は移動先のStripe管理画面で行います。このボタンだけでは解約されません。</p>
    </div>
  </details>
}

function ProSubscribeButton() {
  const { user, proAvailable, loading } = useCloudSession()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (loading) return <button className="pro-subscribe-btn" disabled>読み込み中…</button>

  const isPro = user?.plan === 'pro'

  // 本番決済が有効化されていない状態では、Pro 未加入者に対して申込 UI を隠す。
  // 既存 Pro ユーザーは解約導線を出しておく必要があるため対象外。
  if (!proAvailable && !isPro) {
    return (
      <>
        <button className="pro-subscribe-btn" disabled>準備中</button>
        <div className="pro-subscribe-note">
          Pro プランは現在準備中です。公開までしばらくお待ちください。
          <br />
          リリース通知を希望される方は <a href="/contact">お問い合わせ</a> よりご連絡ください。
        </div>
      </>
    )
  }

  if (!user) {
    // Guideline 5.1.1(v): アプリ内のネイティブIAP購入はアカウント登録
    // (ログイン) を必須にしてはならない。アプリ内実行時は未ログインのまま
    // ネイティブ購入フローに入れるボタンを出す。複数端末で使うためのサイン
    // インはアプリ側で購入完了後に任意で案内する (main.dartのoffer参照)。
    if (isNativeApp()) {
      return (
        <>
          <a href={NATIVE_PURCHASE_URL} className="pro-subscribe-btn">Pro プランに申し込む</a>
          <div className="pro-subscribe-note">
            ログインなしでご購入いただけます。複数端末で使う場合は、購入後にサインインを案内します。
          </div>
        </>
      )
    }
    return (
      <>
        <a href={loginUrl()} className="pro-subscribe-btn">新規登録・ログインして申し込む</a>
        <div className="pro-subscribe-note">戯曲 ID（戯曲図書館と共通のアカウント）でのログインが必要です</div>
      </>
    )
  }

  if (user.plan === 'pro' && user.billing === 'app_store') {
    // App Store で買った契約は Stripe のポータルでは扱えない（ポータルを開くと戯曲図書館の名前の空の画面になる）
    return (
      <>
        <a className="pro-subscribe-btn" href={APP_STORE_SUBSCRIPTIONS_URL}>App Store で契約を管理・解約</a>
        <div className="pro-subscribe-note">App Store でお申し込みの契約です。iPhone の「設定」→ 自分の名前 →「サブスクリプション」からも、解約・確認ができます。</div>
      </>
    )
  }

  if (user.plan === 'pro') {
    return (
      <>
        <button
          className="pro-subscribe-btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true); setErr('')
            try {
              const { url } = await createBillingPortal()
              window.location.href = url
            } catch (e) {
              setErr(e instanceof CloudError ? e.message : String(e))
              setBusy(false)
            }
          }}
        >
          {busy ? '管理画面を開いています…' : '契約の管理・解約'}
        </button>
        <div className="pro-subscribe-note">Stripeの管理画面で、解約・支払い方法の変更・領収書の確認ができます。</div>
        {err && <div className="pro-subscribe-error">{err}</div>}
      </>
    )
  }

  // アプリの中では、ログインしていても初めから Apple の購入に入る。Stripe の購入画面を作ってからアプリに横取りさせると、
  // 「Stripe へ移動中…」が一瞬出て、使わない Stripe の購入画面も残った（2026-11-19 オーナー報告）
  if (isNativeApp()) {
    return <a href={NATIVE_PURCHASE_URL} className="pro-subscribe-btn">Pro プランに申し込む</a>
  }

  return (
    <>
      <button
        className="pro-subscribe-btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true); setErr('')
          try {
            const { url } = await createProCheckout()
            window.location.href = url
          } catch (e) {
            setErr(e instanceof CloudError ? e.message : String(e))
            setBusy(false)
          }
        }}
      >
        {busy ? 'Stripe へ移動中…' : 'Pro プランに申し込む'}
      </button>
      {err && <div className="pro-subscribe-error">{err}</div>}
    </>
  )
}

export function ContactPage() {
  const subject = encodeURIComponent(`[${SERVICE.name}] お問い合わせ`)
  const body = encodeURIComponent(
    `── 以下にお問い合わせ内容をご記入ください ──\n\n\n\n──────────────\n(自動記入) 送信元: ${SERVICE.url}\n`
  )
  const mailto = `mailto:${OPERATOR.email}?subject=${subject}&body=${body}`

  return (
    <Layout title="お問い合わせ">
      <p>{SERVICE.name} に関するご質問・ご要望・不具合報告は、下記メールアドレスまでお気軽にご連絡ください。</p>

      <h2>連絡先</h2>
      <div className="contact-card">
        <div className="contact-card-label">メールアドレス</div>
        <a className="contact-email" href={mailto}>{OPERATOR.email}</a>
        <a className="pro-subscribe-btn" href={mailto} style={{ marginTop: 16 }}>
          メールでお問い合わせ
        </a>
        <p className="legal-note" style={{ textAlign: 'center', marginTop: 12 }}>
          上のボタンでメールソフトが自動で開きます
        </p>
      </div>

      <h2>お問い合わせの種類</h2>
      <ul>
        <li><strong>サービス全般</strong> — 使い方・機能の質問、動作環境の相談</li>
        <li><strong>不具合報告</strong> — 表示崩れ、エラー、動作しない機能等(可能であればスクリーンショット添付)</li>
        <li><strong>Pro プラン</strong> — 決済トラブル、領収書再発行、返金相談（App Store での購入の返金は Apple へ）</li>
        <li><strong>要望・提案</strong> — 新機能のリクエスト、改善案</li>
        <li><strong>その他</strong> — 上記以外の全て</li>
      </ul>

      <h2>返信について</h2>
      <ul>
        <li>返信は原則 <strong>3営業日以内</strong> を目安にお送りしております(個人運営のため多少前後する場合があります)。</li>
        <li>迷惑メールフォルダに振り分けられている場合がありますので、返信が届かないときは併せてご確認ください。</li>
        <li>フリーメール(gmail, yahoo 等)をお使いの場合、当方からの返信が届かないことがあります。届かない場合は別のアドレスをお試しください。</li>
      </ul>

      <h2>Pro プランに関するお問い合わせ</h2>
      <p>
        Web でお申し込みの方は、アカウントの画面（PC は右上のアイコン、スマホは「⋯」→「アカウント」）の
        <strong>「契約の管理」</strong>から、領収書・支払い方法の変更・解約ができます。
        App Store でお申し込みの方は、iPhone の「設定」→ 自分の名前 →「サブスクリプション」で管理し、返金は Apple にお申し出ください。
        それで解決しない場合は、上記のメールにご連絡ください。
      </p>

      <h2>特定商取引法上の表記</h2>
      <p>事業者情報の詳細は <a href="/tokushoho">特定商取引法に基づく表記</a> ページをご覧ください。</p>
    </Layout>
  )
}

function BillingVerification({ automatic = false }: { automatic?: boolean }) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'confirmed' | 'error'>('idle')
  const [error, setError] = useState('')
  const [needsLogin, setNeedsLogin] = useState(false)
  async function verify() {
    setStatus('checking'); setError(''); setNeedsLogin(false)
    try {
      await syncBilling()
      await refreshSession()
      setStatus('confirmed')
    } catch (e) {
      setNeedsLogin(e instanceof CloudError && e.status === 401)
      setError(e instanceof Error ? e.message : '契約情報を確認できませんでした。')
      setStatus('error')
    }
  }
  useEffect(() => { if (automatic) void verify() }, [automatic])
  return <div aria-live="polite">
    {status === 'confirmed' ? <p>Pro契約の反映を確認しました。プロジェクトを10件まで保存できます。</p> : <>
      <p>{status === 'checking' ? 'Stripeの契約情報を確認しています…' : '決済済みなのにProにならない場合は、購入済みの契約を確認してください。追加の決済は不要です。'}</p>
      <button className="pro-subscribe-btn" disabled={status === 'checking'} onClick={() => void verify()}>
        {status === 'checking' ? '確認中…' : status === 'error' ? 'もう一度契約を確認する' : '購入済みの契約を確認する'}
      </button>
    </>}
    {error && <p role="alert">{error}</p>}
    {needsLogin && <a href={loginUrl()}>購入時のアカウントでログインする →</a>}
  </div>
}

function ProSuccessPage() {
  return (
    <Layout title="Pro契約の確認">
      <div className="pro-price-card">
        <h2 className="pro-success-h">購入済みの契約を確認します</h2>
        <BillingVerification automatic />
        <a href="/studio/projects/" className="pro-subscribe-btn">プロジェクトに戻る</a>
      </div>
    </Layout>
  )
}

function ProCancelPage() {
  return (
    <Layout title="申し込みをキャンセルしました">
      <p>Pro プランの申し込みはキャンセルされました。課金は発生していません。</p>
      <p>もう一度検討する場合は下記からどうぞ。</p>
      <div className="pro-price-card">
        <a href="/pro" className="pro-subscribe-btn">Pro プランのページに戻る</a>
        <a href="/studio/projects/" className="pro-subscribe-btn" style={{ background: 'transparent', border: '1px solid rgba(212,175,111,0.35)', color: '#ffd9a3', marginTop: 10 }}>プロジェクトに戻る</a>
      </div>
    </Layout>
  )
}

/**
 * アカウント（/account）。戯曲 ID のページへ移らずに、名前・プラン・保存の件数・契約・ログアウトをここで見る（2026-11-19 オーナー
 * 「アカウント管理から戯曲図書館のページに飛ぶの嫌だ」）。退会だけは戯曲 ID ごと消えるので、戯曲 ID の確認画面で行う
 */
/** 画像を真ん中で正方形に切り、256px 四方の JPEG にする（送る量を小さくする） */
async function squareAvatar(file: File): Promise<{ contentType: string; data: string }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('画像を読み込めませんでした。JPEG・PNG・WebP の画像を選んでください'))
      el.src = url
    })
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d')
    if (!ctx || !side) throw new Error('画像を読み込めませんでした')
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256)
    const dataUrl = canvas.toDataURL('image/jpeg', .88)
    return { contentType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 名前とアイコン。戯曲 ID のもので、戯曲図書館などでも同じ名前・アイコンで出る（2026-11-19 オーナー「する」） */
function ProfileEditor({ name, image }: { name: string | null; image: string | null }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name ?? '')
  const [busy, setBusy] = useState<'' | 'name' | 'icon'>('')
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const initial = name?.trim() ? Array.from(name.trim())[0].toUpperCase() : '?'
  const run = async (kind: 'name' | 'icon', change: Parameters<typeof updateProfile>[0], message: string) => {
    setBusy(kind); setErr(''); setDone('')
    try {
      const updated = await updateProfile(change)
      patchSessionUser({ name: updated.name, image: updated.image })
      setDone(message)
      if (kind === 'name') setEditing(false)
    } catch (e) {
      setErr(e instanceof CloudError ? e.message : e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }
  const pickIcon = async (file: File | undefined) => {
    if (!file) return
    try { await run('icon', { avatar: await squareAvatar(file) }, 'アイコンを変えました') } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    if (fileRef.current) fileRef.current.value = ''
  }
  return <section className="account-page-who">
    <div className="account-page-icon">
      {image ? <img className="account-page-avatar" src={image} alt="" /> : <span className="account-page-avatar initial" aria-hidden>{initial}</span>}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => void pickIcon(event.target.files?.[0])} />
      <button type="button" className="account-page-link" disabled={!!busy} onClick={() => fileRef.current?.click()}>{busy === 'icon' ? '保存中…' : 'アイコンを変える'}</button>
      {image && <button type="button" className="account-page-link" disabled={!!busy} onClick={() => void run('icon', { avatar: null }, 'アイコンを外しました')}>外す</button>}
    </div>
    <div className="account-page-who-body">
      {editing
        ? <form className="account-page-name-form" onSubmit={event => { event.preventDefault(); void run('name', { displayName: draft }, '名前を変えました') }}>
          <label htmlFor="account-name">名前</label>
          <input id="account-name" value={draft} maxLength={50} autoFocus onChange={event => setDraft(event.target.value)} />
          <div>
            <button type="submit" className="account-page-btn" disabled={!!busy}>{busy === 'name' ? '保存中…' : '保存する'}</button>
            <button type="button" className="account-page-btn quiet" disabled={!!busy} onClick={() => { setEditing(false); setDraft(name ?? '') }}>やめる</button>
          </div>
        </form>
        : <>
          <div className="account-page-name">{name ?? '名前は未設定'}</div>
          <button type="button" className="account-page-link" onClick={() => { setDraft(name ?? ''); setEditing(true); setDone('') }}>名前を変える</button>
        </>}
      <div className="account-page-sub">戯曲 ID でログイン中です。名前とアイコンは、戯曲図書館などほかのサービスでも同じものが出ます。</div>
      {done && <p className="account-page-done" role="status">{done}</p>}
      {err && <p className="account-page-err" role="alert">{err}</p>}
    </div>
  </section>
}

export function AccountPage() {
  const { user, loading } = useCloudSession()
  const [count, setCount] = useState<number | null>(null)
  const [portalBusy, setPortalBusy] = useState(false)
  const [portalErr, setPortalErr] = useState('')
  useEffect(() => {
    if (!user) return
    listCloudProjects().then(list => setCount(Array.isArray(list) ? list.length : null)).catch(() => setCount(null))
  }, [user])
  const openPortal = async () => {
    setPortalBusy(true); setPortalErr('')
    try {
      const { url } = await createBillingPortal()
      window.location.href = url
    } catch (e) {
      setPortalErr(e instanceof CloudError ? e.message : String(e))
      setPortalBusy(false)
    }
  }
  if (loading && !user) return <Layout title="アカウント" showUpdated={false}><p>読み込み中…</p></Layout>
  if (!user) return <Layout title="アカウント" showUpdated={false}>
    <p>ログインすると、プロジェクトをアカウントに保存して、ほかの端末からも開けます。</p>
    <p><a className="pro-subscribe-btn account-page-cta" href={loginUrl()}>新規登録・ログイン</a></p>
  </Layout>
  const isPro = user.plan === 'pro'
  const until = user.planExpiresAt ? new Date(user.planExpiresAt).toLocaleDateString('ja-JP') : null
  return <Layout title="アカウント" showUpdated={false}>
    <ProfileEditor name={user.name} image={user.image} />

    <h2>プランと保存</h2>
    <table className="legal-table account-page-table">
      <tbody>
        <tr><th>プラン</th><td>{isPro ? <>Pro{until && <span className="account-page-note">（{until} まで）</span>}</> : 'Free'}</td></tr>
        <tr><th>アカウントのプロジェクト</th><td>{count === null ? '—' : count} / {user.maxProjects} 件<a className="account-page-inline" href="/studio/projects/">一覧を見る</a></td></tr>
      </tbody>
    </table>

    <h2>契約</h2>
    {isPro && user.billing === 'app_store'
      ? <><p><a className="account-page-btn" href={APP_STORE_SUBSCRIPTIONS_URL}>契約の管理（App Store）</a></p><p className="account-page-sub">iPhone の「設定」→ 自分の名前 →「サブスクリプション」からも、解約・確認ができます。</p></>
      : isPro
        ? <p><button type="button" className="account-page-btn" onClick={openPortal} disabled={portalBusy}>{portalBusy ? '移動中…' : '契約の管理（領収書・支払い方法・解約）'}</button></p>
        : <p>いまは Free プランです。<a className="account-page-btn" href="/pro">Pro プランを見る</a></p>}
    {portalErr && <p className="account-page-err">{portalErr}</p>}

    <h2>ログアウト</h2>
    <p><a className="account-page-btn" href={logoutUrl()}>ログアウト</a></p>

    <h2>退会</h2>
    <p>退会すると、戯曲 ID ごと消えます。TOMOSHIBI小屋に保存したプロジェクトと、戯曲図書館などほかのサービスのアカウントも使えなくなります。</p>
    <p><a className="account-page-btn danger" href={deleteAccountUrl()}>退会の手続きへ</a></p>
  </Layout>
}

export function tryRenderLegalPage() {
  if (typeof window === 'undefined') return null
  const path = window.location.pathname
  switch (path) {
    case '/terms': return <TermsPage />
    case '/privacy': return <PrivacyPage />
    case '/tokushoho': return <TokushohoPage />
    case '/pro': return <ProPage />
    case '/pro/success': return <ProSuccessPage />
    case '/pro/cancel': return <ProCancelPage />
    case '/contact': return <ContactPage />
    case '/account': return <AccountPage />
    default: return null
  }
}
