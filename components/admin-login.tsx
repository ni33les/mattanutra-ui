"use client";

import { useState, type FormEvent } from "react";
import {
  startAuthentication,
  startRegistration
} from "@simplewebauthn/browser";
import { localeLabels, type Locale } from "@/lib/i18n";
import { classNames, adminLocaleTextClass } from "@/components/admin/dashboard-shared";

type AdminLoginProps = Readonly<{
  accessToken: string;
  email: string;
  inviteToken: string;
  locale: Locale;
  nextPath: string;
  setupMode: boolean;
}>;

const loginCopy = {
  en: {
    accessHint: "Create the first owner passkey with the legacy admin token.",
    displayName: "Name",
    email: "Email",
    linkTokenHint: "Setup token supplied by this link.",
    inviteHint: "Accept your invite by creating a passkey.",
    login: "Sign in with passkey",
    loginHint: "Use your registered passkey to open the admin dashboard.",
    register: "Create admin passkey",
    registered: "Passkey created.",
    setupToken: "Setup token",
    signingIn: "Opening passkey prompt...",
    setupHeading: "Create admin passkey"
  },
  th: {
    accessHint: "สร้าง passkey เจ้าของระบบคนแรกด้วย legacy admin token",
    displayName: "ชื่อ",
    email: "อีเมล",
    linkTokenHint: "ลิงก์นี้มี setup token แล้ว",
    inviteHint: "รับคำเชิญโดยสร้าง passkey",
    login: "เข้าสู่ระบบด้วย passkey",
    loginHint: "ใช้ passkey ที่ลงทะเบียนแล้วเพื่อเปิดแดชบอร์ดแอดมิน",
    register: "สร้าง passkey แอดมิน",
    registered: "สร้าง passkey แล้ว",
    setupToken: "Setup token",
    signingIn: "กำลังเปิดหน้าต่าง passkey...",
    setupHeading: "สร้าง passkey แอดมิน"
  },
  "zh-CN": {
    accessHint: "使用旧版管理员令牌创建第一个所有者 passkey。",
    displayName: "姓名",
    email: "邮箱",
    linkTokenHint: "此链接已包含设置令牌。",
    inviteHint: "创建 passkey 以接受邀请。",
    login: "使用 passkey 登录",
    loginHint: "使用已注册的 passkey 打开管理仪表盘。",
    register: "创建管理员 passkey",
    registered: "Passkey 已创建。",
    setupToken: "设置令牌",
    signingIn: "正在打开 passkey 提示...",
    setupHeading: "创建管理员 passkey"
  }
} satisfies Record<Locale, Record<string, string>>;

async function postJson<T>(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    credentials: "same-origin",
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });
  const json = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(json.error || "Admin request failed");
  }

  return json;
}

export function AdminLogin({
  accessToken,
  email: initialEmail,
  inviteToken,
  locale,
  nextPath,
  setupMode
}: AdminLoginProps) {
  const labels = loginCopy[locale];
  const [email, setEmail] = useState(initialEmail);
  const [displayName, setDisplayName] = useState("");
  const [setupToken, setSetupToken] = useState(accessToken);
  const [busy, setBusy] = useState<"login" | "register" | null>(null);
  const [error, setError] = useState("");
  const showRegistration = Boolean(inviteToken || accessToken || setupMode);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("login");
    setError("");

    try {
      const { challengeId, options } = await postJson<{
        challengeId: string;
        options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
      }>("/api/admin/auth/passkey/login/options", {
        email,
        locale
      });
      const response = await startAuthentication({ optionsJSON: options });
      const verified = await postJson<{ redirectTo?: string }>(
        "/api/admin/auth/passkey/login/verify",
        {
          challengeId,
          next: nextPath,
          response
        }
      );

      window.location.assign(verified.redirectTo || nextPath);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Passkey login failed");
      setBusy(null);
    }
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("register");
    setError("");

    try {
      const { challengeId, options } = await postJson<{
        challengeId: string;
        options: Parameters<typeof startRegistration>[0]["optionsJSON"];
      }>("/api/admin/auth/passkey/register/options", {
        accessToken: inviteToken ? "" : setupToken,
        displayName,
        email,
        inviteToken,
        locale
      });
      const response = await startRegistration({ optionsJSON: options });
      const verified = await postJson<{ redirectTo?: string }>(
        "/api/admin/auth/passkey/register/verify",
        {
          challengeId,
          next: nextPath,
          response
        }
      );

      window.location.assign(verified.redirectTo || nextPath);
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "Passkey registration failed");
      setBusy(null);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 py-12 text-[#20343A]">
      <div className="w-full max-w-5xl">
        <div className="mb-6 flex justify-end">
          <div
            className={classNames(
              "rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-200",
              adminLocaleTextClass(locale, "label")
            )}
          >
            {localeLabels[locale]}
          </div>
        </div>
        <section className="grid overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="flex min-h-[320px] items-center bg-[#20343A] p-8 text-white sm:p-10">
            <div className="inline-grid leading-none">
              <div className="text-[42px] font-semibold tracking-normal sm:text-[48px]">
                <span>Matta</span>
                <span className="text-[#7DDDB8]">Nutra</span>
              </div>
              <p
                className="mt-3 text-[12px] font-semibold tracking-[0.18em] text-white/75 sm:text-[13px]"
                style={{ fontVariantCaps: "all-small-caps" }}
              >
                Knowing The Right Amount.
              </p>
            </div>
          </div>
          <div className="grid gap-8 p-6 sm:p-8">
            <form onSubmit={login} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {labels.login}
                </h2>
                <p className="mt-1 text-sm text-gray-500">{labels.loginHint}</p>
              </div>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">
                  {labels.email}
                </span>
                <input
                  autoComplete="email webauthn"
                  className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-[#1FA77A]"
                  onChange={(event) => setEmail(event.target.value)}
                  required={true}
                  type="email"
                  value={email}
                />
              </label>
              <button
                className="inline-flex w-full justify-center rounded-md bg-[#1FA77A] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#188B66] disabled:cursor-wait disabled:opacity-70"
                disabled={busy !== null}
                type="submit"
              >
                {busy === "login" ? labels.signingIn : labels.login}
              </button>
            </form>

            {showRegistration ? (
            <form onSubmit={register} className="space-y-4 border-t border-gray-100 pt-8">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {labels.setupHeading}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {inviteToken ? labels.inviteHint : labels.accessHint}
                </p>
              </div>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">
                  {labels.email}
                </span>
                <input
                  autoComplete="email"
                  className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-[#1FA77A]"
                  onChange={(event) => setEmail(event.target.value)}
                  required={true}
                  type="email"
                  value={email}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">
                  {labels.displayName}
                </span>
                <input
                  autoComplete="name"
                  className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-[#1FA77A]"
                  onChange={(event) => setDisplayName(event.target.value)}
                  type="text"
                  value={displayName}
                />
              </label>
              {!inviteToken ? (
                accessToken ? (
                  <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 ring-1 ring-emerald-100">
                    {labels.linkTokenHint}
                  </p>
                ) : (
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">
                      {labels.setupToken}
                    </span>
                    <input
                      autoComplete="one-time-code"
                      className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-[#1FA77A]"
                      onChange={(event) => setSetupToken(event.target.value)}
                      required={true}
                      type="password"
                      value={setupToken}
                    />
                  </label>
                )
              ) : null}
              <button
                className="inline-flex w-full justify-center rounded-md bg-[#20343A] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#16252A] disabled:cursor-wait disabled:opacity-70"
                disabled={busy !== null}
                type="submit"
              >
                {busy === "register" ? labels.signingIn : labels.register}
              </button>
            </form>
            ) : null}

            {error ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
                {error}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
