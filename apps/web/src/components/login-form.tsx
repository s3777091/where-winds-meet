"use client";

import { ArrowRight, Eye, EyeSlash, LockKey, Wind } from "@phosphor-icons/react";
import Image from "next/image";
import { useState, type FormEvent } from "react";
import { createClient } from "@/utils/supabase/client";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const values = new FormData(event.currentTarget);
    const email = String(values.get("email") ?? "").trim().toLocaleLowerCase("en");
    const password = String(values.get("password") ?? "");
    setPending(true);
    setError(undefined);

    try {
      const { error: authError } = await createClient().auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
      window.location.replace(next);
    } catch {
      setError("Email hoặc mật khẩu chưa đúng.");
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-[100dvh] bg-[#0b1016] text-[#edf0eb] lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden min-h-[100dvh] overflow-hidden border-r border-white/10 lg:block">
        <Image
          src="/regions/qinghe.png"
          alt="Bản đồ vùng Qinghe trong Where Winds Meet"
          fill
          priority
          sizes="55vw"
          className="object-cover object-center opacity-70"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,11,16,0.18),rgba(7,11,16,0.68)),linear-gradient(0deg,rgba(7,11,16,0.9),transparent_58%)]" />
        <div className="absolute inset-x-0 bottom-0 p-10 xl:p-14">
          <div className="flex max-w-xl items-center gap-3 text-[#d7a958]">
            <Wind size={24} weight="bold" />
            <span className="text-sm font-semibold tracking-[0.14em]">WHERE WINDS MEET</span>
          </div>
          <h1 className="mt-5 max-w-2xl text-4xl font-semibold tracking-[-0.04em] xl:text-5xl">
            Mỗi dấu vết trên giang hồ đều có lời giải.
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-[#bac2c8]">
            Bản đồ hoàn thành, lộ trình và trợ lý giải đố có trích nguồn trong cùng một không gian.
          </p>
        </div>
      </section>

      <section className="flex min-h-[100dvh] items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[430px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="grid size-11 place-items-center rounded-[14px] bg-[#d7a958] text-[#171107]">
              <Wind size={23} weight="bold" />
            </span>
            <span className="font-semibold tracking-[-0.02em]">Where Winds Meet Companion</span>
          </div>

          <p className="text-sm font-medium text-[#d7a958]">Chào mừng trở lại</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Đăng nhập để tiếp tục</h2>
          <p className="mt-3 text-sm leading-6 text-[#919ca5]">
            Dùng tài khoản đã được cấp cho hệ thống Protexa.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-[#d7dde0]">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                className="h-12 w-full rounded-[14px] border border-white/12 bg-[#121a22] px-4 text-sm text-[#edf0eb] outline-none transition placeholder:text-[#67727c] focus:border-[#d7a958] focus:ring-2 focus:ring-[#d7a958]/20"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-[#d7dde0]">Mật khẩu</label>
              <div className="relative">
                <LockKey className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#77828c]" size={18} />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="Nhập mật khẩu"
                  className="h-12 w-full rounded-[14px] border border-white/12 bg-[#121a22] pl-11 pr-12 text-sm text-[#edf0eb] outline-none transition placeholder:text-[#67727c] focus:border-[#d7a958] focus:ring-2 focus:ring-[#d7a958]/20"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-[10px] text-[#919ca5] hover:bg-white/6 hover:text-[#edf0eb]"
                >
                  {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-[14px] border border-[#d16f6f]/35 bg-[#d16f6f]/10 px-4 py-3 text-sm text-[#f2b2b2]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#d7a958] px-5 text-sm font-bold text-[#171107] transition hover:bg-[#e2bd75] active:translate-y-px disabled:cursor-wait disabled:opacity-65"
            >
              {pending ? "Đang xác thực..." : "Đăng nhập"}
              {!pending && <ArrowRight size={18} weight="bold" />}
            </button>
          </form>

          <p className="mt-8 text-xs leading-5 text-[#707b84]">
            Phiên đăng nhập được xác thực bởi Supabase hiện có. Ứng dụng không lưu lại mật khẩu của bạn.
          </p>
        </div>
      </section>
    </main>
  );
}
