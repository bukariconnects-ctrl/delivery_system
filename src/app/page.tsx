import {
  Zap,
  Globe2,
  ShieldCheck,
  HardDrive,
  Radio,
  Layers,
  LogIn,
  UserPlus,
} from "lucide-react";
import Link from "next/link";

const FEATURES = [
  {
    icon: Zap,
    title: "Real-time Synchronization",
    desc: "WebSockets عبر Supabase Realtime — بث المواقع، تحديث حالة الطلبات، وإشعارات فورية بنمط Pub-Sub.",
    color: "text-yellow-500 bg-yellow-50 dark:bg-yellow-950/40",
  },
  {
    icon: Globe2,
    title: "Scalable P2P Mesh",
    desc: "اكتشاف العقد عبر Broadcast وتخزين DHT محلي على الحافة — تقليل الحمل على الخادم المركزي.",
    color: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40",
  },
  {
    icon: ShieldCheck,
    title: "Secure Transactions",
    desc: "توقيعات رقمية (HMAC-SHA256) لإثبات التوصيل، Rate Limiting، RLS، و JWT — دفاع متعدد الطبقات.",
    color: "text-red-500 bg-red-50 dark:bg-red-950/40",
  },
  {
    icon: HardDrive,
    title: "Distributed File System",
    desc: "تخزين هرمي بمعرّفات UFID فريدة، Client-side Caching، وسياسات وصول حسب الدور.",
    color: "text-purple-500 bg-purple-50 dark:bg-purple-950/40",
  },
];

const STATS = [
  { value: "10", label: "Academic Requirements" },
  { value: "5", label: "Lectures Covered" },
  { value: "4", label: "Node Types" },
  { value: "<50ms", label: "Avg Latency" },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {/* ── Hero Section ── */}
      <section className="relative flex flex-col items-center justify-center px-6 pb-16 pt-24 text-center">
        {/* Decorative grid */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-blue-500/5 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col items-center">
          <div className="mb-6 flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
            <Radio size={12} className="animate-pulse" />
            Live Distributed System
          </div>

          <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl dark:text-white">
            Smart Distributed{" "}
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Delivery Platform
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
            منصة توصيل ذكية مبنية على أنظمة موزّعة — تتصل فيها العقد عبر Cloud Hub
            مركزي مع مزامنة لحظية، اكتشاف P2P، وأمان متعدد الطبقات.
          </p>

          <div className="mt-8 flex gap-4">
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-700 hover:shadow-blue-500/40"
            >
              <LogIn size={16} />
              تسجيل الدخول
            </Link>
            <Link
              href="/auth/register"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-750"
            >
              <UserPlus size={16} />
              إنشاء حساب
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <section className="border-y border-gray-200 bg-white/50 px-6 py-8 backdrop-blur dark:border-gray-800 dark:bg-gray-900/50">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{s.value}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Distributed Features Section ── */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
              <Layers size={20} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
              Distributed Architecture Features
            </h2>
            <p className="mt-2 text-gray-500 dark:text-gray-400">
              كل ميزة تُطبّق مفاهيم أكاديمية من محاضرات الأنظمة الموزّعة
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
                >
                  <div className={`mb-4 inline-flex rounded-xl p-3 ${f.color}`}>
                    <Icon size={24} />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                    {f.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-200 px-6 py-8 dark:border-gray-800">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 text-center text-xs text-gray-400 dark:text-gray-500">
          <p>
            <strong>Distributed Delivery System</strong> — Multi-tier Architecture •
            Cloud Hub • WebSockets • RPC • P2P Mesh • DFS • Digital Signatures
          </p>
          <p>
            Built with Next.js 15, Supabase, TypeScript, and Tailwind CSS
          </p>
        </div>
      </footer>
    </div>
  );
}
