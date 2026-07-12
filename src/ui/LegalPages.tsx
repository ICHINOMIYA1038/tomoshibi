import { useState, type ReactNode } from 'react'
import { createProCheckout, createBillingPortal, CloudError, loginUrl } from '../io/cloud'
import { useCloudSession } from '../io/cloudSession'

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

const UPDATED = '2026年7月12日'

function Layout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <a href="/" className="legal-back">← {SERVICE.name}に戻る</a>
      </header>
      <main className="legal-main">
        <h1>{title}</h1>
        {children}
        <footer className="legal-foot">
          <p>最終更新日: {UPDATED}</p>
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
        <li>サービス利用情報: 保存されたシーンデータ、操作ログ</li>
        <li>決済情報: Pro プランをご利用の場合、Stripe 等の決済事業者を通じたお名前、メールアドレス、支払い方法(カード情報は当方は保持せず、決済事業者が管理します)</li>
        <li>技術情報: IP アドレス、ブラウザ種別、アクセス日時等</li>
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

      <h2>5. 外部サービスの利用</h2>
      <ul>
        <li>認証: 姉妹サービス「戯曲図書館」および Google OAuth</li>
        <li>決済: Stripe 等の決済事業者</li>
        <li>ホスティング: Vercel Inc.</li>
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
          <tr><th>お支払い方法</th><td>クレジットカード決済 (Visa / Mastercard / American Express / JCB 等、決済事業者の対応範囲による)</td></tr>
          <tr><th>お支払い時期</th><td>初回: お申し込み時にお客様のクレジットカードから即時決済<br />2回目以降: 各更新日 (毎月、お申し込み日と同日) に自動更新・自動決済</td></tr>
          <tr><th>サービスの提供時期</th><td>決済完了後、即時に有料機能をご利用いただけます。</td></tr>
          <tr><th>返品・キャンセルについて</th><td>デジタルサービスの性質上、決済完了後の返金は原則としてお受けしておりません。ただし、当方の重大な過失または法令に基づく場合はこの限りではありません。</td></tr>
          <tr><th>解約について</th><td>いつでも本サービス内の「Pro プラン管理」画面からご自身で解約可能です。次回更新日の前日までに解約手続きを行うことで、以降の課金は停止されます。当該課金期間の残日数分は引き続き有料機能をご利用いただけます。</td></tr>
          <tr><th>動作環境</th><td>WebGL 対応の最新のウェブブラウザ (Google Chrome / Safari / Firefox / Edge 等)</td></tr>
        </tbody>
      </table>
    </Layout>
  )
}

export function ProPage() {
  return (
    <Layout title="Pro プラン">
      <p className="pro-lead">{SERVICE.name}をもっと快適に。<br />クラウドに何度でも保存できる Pro プラン。</p>

      <div className="pro-price-card">
        <div className="pro-price-amount">¥{SERVICE.proPriceMonthly}<span>/月</span></div>
        <div className="pro-price-sub">税込・自動更新・いつでも解約可能</div>
        <ProSubscribeButton />
      </div>

      <h2>Free プランと Pro プランの違い</h2>
      <table className="legal-table">
        <thead>
          <tr><th></th><th>Free</th><th>Pro</th></tr>
        </thead>
        <tbody>
          <tr><td>シミュレーター本体の全機能</td><td>◯</td><td>◯</td></tr>
          <tr><td>基本の器具プロファイル (Fresnel / PAR / LED)</td><td>◯</td><td>◯</td></tr>
          <tr><td>クラウドへのシーン保存</td><td>3件まで</td><td><strong>無制限</strong></td></tr>
          <tr><td>シーンの共有URL</td><td>◯</td><td>◯ (長期保持)</td></tr>
          <tr><td>優先サポート</td><td>—</td><td>◯</td></tr>
        </tbody>
      </table>

      <h2>お支払い・解約について</h2>
      <ul>
        <li>初回課金は Pro プラン申し込み時に即時決済されます</li>
        <li>2回目以降は毎月同日に自動更新されます</li>
        <li>解約はいつでも本サービス内の「Pro プラン管理」画面から可能です</li>
        <li>解約後も、次回更新日までは Pro 機能を引き続きご利用いただけます</li>
      </ul>

      <h2>よくあるご質問</h2>
      <dl className="faq">
        <dt>Free プランでも使い続けられますか?</dt>
        <dd>はい。シミュレーター本体は Free プランでもすべての機能をご利用いただけます。Pro プランは主にクラウド保存数の上限を解除するオプションです。</dd>
        <dt>いつでも解約できますか?</dt>
        <dd>はい。解約は本サービス内から数クリックで完了します。違約金等は一切かかりません。</dd>
        <dt>Pro プランを解約した後、保存していたシーンはどうなりますか?</dt>
        <dd>4件目以降のシーンは、Pro プラン期間終了後に閲覧・編集のみ可能な「アーカイブ状態」となります。データが削除されることはなく、再度 Pro プランに加入すれば通常通り利用できます。</dd>
        <dt>領収書は発行されますか?</dt>
        <dd>Stripe 決済の場合、決済完了時に自動で領収書メールが送信されます。</dd>
      </dl>

      <p className="legal-note"><a href="/tokushoho">特定商取引法に基づく表記</a> / <a href="/terms">利用規約</a> / <a href="/privacy">プライバシーポリシー</a></p>
    </Layout>
  )
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
    return (
      <>
        <a href={loginUrl()} className="pro-subscribe-btn">ログインして申し込む</a>
        <div className="pro-subscribe-note">戯曲図書館アカウント (Google) でログインが必要です</div>
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
          {busy ? '準備中…' : 'Pro プラン管理・解約'}
        </button>
        <div className="pro-subscribe-note">Stripe のポータルで解約・支払い方法変更・領収書再発行ができます</div>
        {err && <div className="pro-subscribe-error">{err}</div>}
      </>
    )
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
        <li><strong>Pro プラン</strong> — 決済トラブル、領収書再発行、返金相談</li>
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
        Pro プラン加入者の方は、決済・領収書・支払い方法の変更・解約について
        <strong>Stripe カスタマーポータル</strong> から直接操作いただけます
        (画面右上のアカウントメニューからアクセスできます)。
        ポータルで解決しない場合のみ上記メールにご連絡ください。
      </p>

      <h2>特定商取引法上の表記</h2>
      <p>事業者情報の詳細は <a href="/tokushoho">特定商取引法に基づく表記</a> ページをご覧ください。</p>
    </Layout>
  )
}

function ProSuccessPage() {
  return (
    <Layout title="Pro プランへようこそ">
      <div className="pro-price-card">
        <div className="pro-flame-large">✦</div>
        <h2 className="pro-success-h">ご登録ありがとうございます!</h2>
        <p>Pro プランの決済が完了しました。<br />クラウド保存が<strong>無制限</strong>に開放されました。</p>
        <a href="/" className="pro-subscribe-btn">シミュレーターに戻る</a>
        <div className="pro-subscribe-note">領収書は登録メールアドレスに Stripe から自動送信されます</div>
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
        <a href="/" className="pro-subscribe-btn" style={{ background: 'transparent', border: '1px solid rgba(212,175,111,0.35)', color: '#ffd9a3', marginTop: 10 }}>シミュレーターに戻る</a>
      </div>
    </Layout>
  )
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
    default: return null
  }
}
