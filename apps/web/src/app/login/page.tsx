import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = {
  title: "Đăng nhập | Where Winds Meet Companion",
  description: "Đăng nhập vào bản đồ và trợ lý giải đố Where Winds Meet.",
};

export default function LoginPage() {
  return <LoginForm />;
}
