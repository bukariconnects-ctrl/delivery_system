# سجل تغييرات النظام — Distributed Delivery System

---

## حالة النظام الحالية

| العنصر | الحالة |
|--------|--------|
| Next.js (TypeScript + Tailwind + App Router) | ✅ مُهيأ |
| Supabase (Remote linked + Migration pushed) | ✅ متصل |
| قاعدة البيانات (الجداول + RLS + Realtime) | ✅ مُطبّق |
| المتطلب 1: بنية الكيانات والتوزيع | ✅ مُنجز |
| المتطلب 2: الأنماط المعمارية | ✅ مُنجز |
| النمط المعماري | Multi-tier + Thin Clients + Cloud Hub |
| المتطلب 3: النموذج الأساسي (Fundamental Model) | ✅ مُنجز |
| نموذج التفاعل (Interaction Model) | Asynchronous + DB Server Time |
| نموذج الإخفاق (Failure Model) | Retry + Heartbeat Detection |
| نموذج الأمان (Security Model) | JWT + RLS + Middleware |
| المتطلب 4: Sockets و IPC | ✅ مُنجز |
| الـ Sockets | WebSockets via Supabase Realtime |
| IPC Patterns | Stream + Message Passing + Multicast |
| المتطلب 5: Remote Invocation + Indirect Comm | ✅ مُنجز |
| Remote Invocation | PostgreSQL RPC (place_order, accept_order) |
| Indirect Communication | Notifications table (Message Queue) + Pub-Sub |
| المتطلب 6: Web Services + P2P | ✅ مُنجز |
| Web Services | Edge Function (track-order) + OpenAPI docs |
| P2P System | DHT Cache + Edge Discovery (3rd Gen) |
| المتطلب 9: Advanced Security + Attack Surfaces | ✅ مُنجز |
| Attack Mitigation | Digital Signatures + Rate Limiting + DoS Protection |
| Security Analysis | docs/security_analysis.md |
| المتطلب 10: Distributed File System (DFS) | ✅ مُنجز |
| DFS | Supabase Storage + UFID + Client-side Caching |
| Admin Dashboard + Landing Page | ✅ مُنجز |
| RBAC | admin role + is_admin() + Middleware enforcement |
| Admin Account | ibro@gmail.com (admin123) |
| Node Onboarding & Verification | ✅ مُنجز |
| Onboarding Setup Pages | Restaurant + Driver + Client |
| Verification Workflow | Admin as Certificate Authority (Lecture 9) |
| Menu Manager + DFS Image Upload | ✅ مُنجز |
| Identity Document Upload (DFS) | drivers/{id}/identity/ |
| Middleware Verification Gate | Unverified → /setup redirect |
| جميع المتطلبات الأكاديمية (1–10) | ✅ مكتملة |

---

## سجل التغييرات

### [2026-05-17] — التهيئة الأولية للمشروع

#### 1. إنشاء ملف البيئة `.env.local`
- إضافة متغيرات الاتصال بـ Supabase:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `DATABASE_URL` (مع pgbouncer)
  - `DIRECT_URL`
  - `DATABASE_PASSWORD`

#### 2. تهيئة مشروع Next.js
- الأمر: `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*"`
- الإصدار: Next.js 16.2.6, React 19.2.4
- البنية: App Router + `src/` directory

#### 3. تثبيت المكتبات الأساسية
- `@supabase/supabase-js` ^2.105.4
- `@supabase/ssr` ^0.10.3
- `lucide-react` ^1.16.0
- `react-hot-toast` ^2.6.0
- `supabase` CLI ^2.98.2 (dev)

#### 4. تهيئة Supabase محلياً وربطه بالمشروع البعيد
- `npx supabase init` → أنشأ `supabase/config.toml`
- `npx supabase link --project-ref zpsdqvmqzxzazfsegfjv` → تم الربط
- `npx supabase db push` → تم تطبيق الـ migration بنجاح

#### 5. إنشاء Migration: `0001_initial_schema.sql`
**الأنواع المخصصة:**
- `user_role`: client, restaurant, driver
- `order_status`: pending, accepted, preparing, ready_for_pickup, picked_up, in_transit, delivered, cancelled

**الجداول:**
| الجدول | الوصف |
|--------|-------|
| `profiles` | بيانات المستخدمين (id, role, full_name, avatar_url, updated_at) |
| `restaurants` | المطاعم (id, owner_id, name, latitude, longitude, is_open) |
| `orders` | الطلبات (id, client_id, restaurant_id, driver_id, status, total_amount) |
| `driver_locations` | مواقع السائقين (driver_id, current_latitude, current_longitude, is_online) |

**الأمان (RLS):**
- كل الجداول مفعّل عليها Row Level Security
- المستخدمون يقرأون/يعدّلون بياناتهم فقط
- المطاعم المفتوحة مرئية للجميع
- الطلبات مرئية حسب الدور (عميل/مطعم/سائق)
- مواقع السائقين المتصلين مرئية للجميع

**Realtime:**
- مفعّل على جدول `orders`
- مفعّل على جدول `driver_locations`

**Trigger:**
- `handle_new_user()` — ينشئ profile تلقائياً عند تسجيل مستخدم جديد

---

### [2026-05-17] — المتطلب 1 و 2: بنية الكيانات والأنماط المعمارية

#### 1. بنية المجلدات الموزّعة
- `src/types/` — واجهات TypeScript مشتركة تطابق مخطط قاعدة البيانات
- `src/lib/supabase/` — طبقة الاتصال بالـ Cloud Hub
- `src/components/shared/` — مكونات UI مشتركة بين جميع العقد
- `src/components/client/` — مكونات خاصة بعقدة العميل
- `src/components/restaurant/` — مكونات خاصة بعقدة المطعم
- `src/components/driver/` — مكونات خاصة بعقدة السائق

#### 2. أنواع TypeScript (`src/types/index.ts`)
- `UserRole` — يطابق enum `public.user_role` في قاعدة البيانات
- `OrderStatus` — يطابق enum `public.order_status`
- `UserProfile`, `Restaurant`, `Order`, `DriverLocation` — واجهات مطابقة للجداول
- `DistributedNode` — تمثيل العقد في النظام الموزّع
- `SYSTEM_NODES` — تعريف العقد الثلاث مع المسارات

#### 3. طبقة Supabase (Cloud Hub Connection)
- `src/lib/supabase/client.ts` — عميل المتصفح (Browser Client)
- `src/lib/supabase/server.ts` — عميل الخادم (Server Client with cookies)
- `src/lib/supabase/provider.tsx` — مزوّد السياق (Context Provider) مع إدارة الجلسة

#### 4. صفحة الهبوط (Service Broker Pattern)
- `src/app/page.tsx` — تعمل كـ Service Broker لتوجيه المستخدم حسب دوره
- يعرض الأدوار الثلاثة (Client, Restaurant, Driver) كبطاقات تفاعلية
- كل بطاقة توجّه إلى العقدة المناسبة

#### 5. لوحات التحكم (Dashboard Shells)
- `src/app/dashboard/client/page.tsx` — عقدة العميل
- `src/app/dashboard/restaurant/page.tsx` — عقدة المطعم
- `src/app/dashboard/driver/page.tsx` — عقدة السائق

#### 6. المكونات المشتركة
- `RoleCard.tsx` — بطاقة اختيار الدور
- `DashboardShell.tsx` — هيكل لوحة التحكم المشترك

#### 7. الأنماط المعمارية المطبّقة (Lecture 3)
| النمط | التطبيق |
|-------|--------|
| Multi-tier Architecture | Frontend (Next.js) → Middleware (Supabase Provider) → Backend (Supabase/PostgreSQL) |
| Thin Clients | كل عقدة (Client/Restaurant/Driver) هي Thin Client يتصل بالـ Cloud Hub |
| Service Broker (2.2.5) | صفحة الهبوط توجّه المستخدم للعقدة المناسبة حسب دوره |
| Centralized Cloud Hub | Supabase يعمل كمركز بيانات مركزي |
| Geographically Distributed Edges | العقد (العملاء/السائقين/المطاعم) موزّعة جغرافياً تتصل بالمركز |
| Pub/Sub Pattern | Supabase Realtime للاشتراك في تغييرات الطلبات والمواقع |

---

### [2026-05-17] — المتطلب 3: النموذج الأساسي (Fundamental Model)

#### 1. نموذج التفاعل (Interaction Model) — Lecture 3, Slide 6, 26, 27

**المشكلة:** عدم وجود ساعة عالمية (Lack of Global Clock) + زمن الوصول المتغير (Latency/Jitter)

**الحل المُنفّذ:**
- `src/lib/utils/time.ts` — يستخدم وقت خادم قاعدة البيانات كمصدر وحيد للحقيقة (Single Source of Truth)
  - `getServerTime()` — يجلب الوقت من الخادم ويحسب انحراف الساعة (Clock Drift)
  - `toServerTime()` — يحوّل التوقيت المحلي إلى توقيت الخادم
  - `isTimestampStale()` — يكشف الطوابع الزمنية القديمة (للكشف عن الإخفاق)
- `supabase/migrations/0002_server_time_function.sql` — دالة RPC `get_server_time()` في قاعدة البيانات
- `src/hooks/use-distributed-status.ts` — Hook للتفاعل غير المتزامن
  - يتتبع حالات: idle, loading, success, timeout, error
  - يقيس زمن الوصول (Latency) لكل عملية
  - يكشف حالات Timeout تلقائياً
  - يدعم إعادة المحاولة

#### 2. نموذج الإخفاق (Failure Model) — Lecture 3, Slide 7, 30, 32

**المشكلة:** إخفاق الإرسال (Omission Failures) + الإخفاقات المستقلة (Independent Failures)

**الحل المُنفّذ:**
- `src/lib/supabase/failure-handler.ts`:
  - **إخفاء الإخفاق (Masking Failures):** آلية إعادة المحاولة (Retry) مع Exponential Backoff
    - `withRetry()` — يعيد المحاولة حتى 3 مرات مع تأخير تصاعدي
    - `resilientQuery()` — غلاف مبسّط لاستعلامات Supabase
    - لا يعيد المحاولة لأخطاء المصادقة (ليست عابرة)
  - **كشف إخفاق العملية (Process Omission Detection):**
    - `detectDriverHealth()` — يحدد حالة السائق:
      - `online`: آخر ظهور < 15 ثانية
      - `degraded`: آخر ظهور بين 15-30 ثانية
      - `offline`: آخر ظهور > 30 ثانية (يُعتبر معطّل)
    - `markOfflineDrivers()` — يحدّث قاعدة البيانات ويضع السائقين المنقطعين كـ offline

#### 3. نموذج الأمان (Security Model) — Lecture 3, Slide 40-47 | Lecture 10, Slide 17

**المشكلة:** تأمين العمليات والقنوات والكائنات (Processes, Channels, Objects)

**الحل المُنفّذ:**
- `src/middleware.ts` — Middleware للتحقق من الجلسات:
  - **القنوات الآمنة (Secure Channels):** التحقق من JWT لكل طلب على `/dashboard/*`
  - **تحديث الجلسات:** يجدّد الـ tokens المنتهية تلقائياً
  - **إعادة التوجيه:** المستخدمون غير المسجلين يُوجَّهون لصفحة الدخول
- **التحكم بالوصول المبني على الهوية (Identity-Based Access Control):**
  - RLS في قاعدة البيانات يضمن أن كل Principal يصل فقط لبياناته
  - `auth.uid()` يُستخدم في كل سياسة أمان
- **صفحات المصادقة:**
  - `src/app/auth/login/page.tsx` — تسجيل الدخول
  - `src/app/auth/register/page.tsx` — إنشاء حساب (مع اختيار الدور)
  - `src/app/auth/callback/route.ts` — معالجة OAuth callback

#### ملخص النماذج الثلاثة:
| النموذج | المبدأ | التطبيق |
|---------|--------|--------|
| Interaction | Asynchronous + No Global Clock | DB Server Time + useDistributedStatus hook |
| Failure | Omission + Independent | Retry with backoff + Heartbeat (last_seen > 30s) |
| Security | Secure Channels + Identity | HTTPS/WSS + JWT Middleware + RLS policies |

---

### [2026-05-17] — المتطلب 4: Sockets و IPC (Lecture 4)

#### 1. خدمة Realtime (Socket Layer)
- `src/lib/supabase/realtime-service.ts` — طبقة الـ Sockets المركزية
  - **Channel Management:** إنشاء/إزالة القنوات (كـ Communication Endpoints)
  - **Broadcast (Multicast):** إرسال رسائل لمجموعة (Slide 27-28)
  - **Sequence Tracking:** فحص ترتيب الرسائل Sender Order (Slide 11)
  - **Acknowledgement:** تأكيد استلام الرسائل الحرجة (Slide 10, 16)
  - **Postgres Changes:** اشتراك في تغييرات الجداول كـ IPC
  - **Presence:** تتبع السائقين المتصلين

#### 2. نمط Message Passing (نقطة-لنقطة) — Slide 3, 5
- `src/hooks/use-order-socket.ts`:
  - `useOrderSocket()` — كل طلب يحصل على قناة خاصة `order:{id}`
  - العميل يشترك → المطعم/السائق ينشر تحديثات الحالة
  - ACK تلقائي عند استلام الرسالة (Reliable Communication)
  - اشتراك مزدوج: Broadcast + DB Changes (احتياطي)

#### 3. نمط Multicast (مجموعة) — Slide 27, 28
- `useNewOrderBroadcast()` — المطعم يبث طلب جديد لكل السائقين عبر قناة `new-orders`
- `useNewOrderListener()` — السائقون يستقبلون إشعارات الطلبات الجديدة

#### 4. نمط Stream Communication — Slide 18-20
- `src/hooks/use-driver-stream.ts`:
  - `useDriverStreamWriter()` — السائق يكتب موقعه على الـ Stream كل 3 ثواني
  - `useDriverStreamReader()` — العميل يقرأ موقع السائق مباشرة
  - احتياطي: الكتابة أيضاً في DB للتعافي من الإخفاق

#### 5. تحديث لوحات التحكم (Live Socket UI)
- **Driver Dashboard:** بث الموقع (Stream Write) + استقبال الطلبات (Multicast Listen)
- **Client Dashboard:** تتبع الطلب (P2P Message) + تتبع السائق (Stream Read)
- **Restaurant Dashboard:** بث طلب جديد (Multicast Send) + تحديث حالة (P2P + ACK)

#### ملخص أنماط التواصل:
| النمط | الآلية | الاستخدام |
|-------|--------|----------|
| Message Passing (P2P) | Broadcast على قناة `order:{id}` | تحديثات حالة الطلب |
| Multicast | Broadcast على قناة `new-orders` | إشعار السائقين بطلب جديد |
| Stream | Broadcast على قناة `driver-stream:{id}` | بث موقع السائق مباشرة |
| ACK | Broadcast على event `ack` | تأكيد استلام الرسائل الحرجة |
| Sender Order | Sequence numbers per sender | منع الرسائل المكررة/غير المرتبة |

---

### [2026-05-17] — المتطلب 5: Remote Invocation + Indirect Communication (Lecture 5)

#### 1. Remote Invocation — RPC (Slide 3, 12, 17)

**النمط:** Request-Reply — العميل يرسل طلباً → الخادم ينفّذ → يعيد النتيجة

- `supabase/migrations/0003_remote_actions.sql`:
  - **`place_order(restaurant_id, items, total)`** — إنشاء طلب جديد:
    - يتحقق من المصادقة (auth.uid)
    - يتحقق من وجود المطعم وأنه مفتوح (is_open)
    - يتحقق من صحة المبلغ
    - يُدرج الطلب + يُرسل إشعار للمطعم (غير مباشر)
    - يعيد JSON {success, order_id}
  - **`accept_order(order_id, driver_id)`** — قبول طلب:
    - يقفل الصف (FOR UPDATE) لمنع التعارض
    - يتحقق من حالة الطلب (pending) والسائق (online + heartbeat < 30s)
    - يُعيّن السائق + يُرسل إشعارات للعميل والمطعم
    - يعيد JSON {success, order_id, driver_id}
- `src/hooks/use-remote-actions.ts`:
  - `usePlaceOrder()` — غلاف RPC مع At-most-once guard
  - `useAcceptOrder()` — غلاف RPC مع At-most-once guard
  - **At-most-once Semantics:** قفل (lock) يمنع الإرسال المزدوج أثناء انتظار الرد

#### 2. Indirect Communication — Message Queue + Pub-Sub (Slide 24, 30, 37)

**المبدأ:** Space و Time Uncoupling — المُرسِل لا يعرف المستقبِل ولا يحتاج أن يكون متصلاً

- **Message Queue (Notifications Table):**
  - جدول `notifications`: id, user_id, title, message, type, is_read, created_at
  - الـ RPC functions تُدرج إشعارات تلقائياً (غير مباشر)
  - Trigger `on_order_status_change` يُدرج إشعاراً عند كل تغيير حالة
  - RLS: كل مستخدم يرى إشعاراته فقط
- **Pub-Sub (Realtime Subscription):**
  - `src/components/shared/NotificationBell.tsx`:
    - يشترك في Postgres Changes على جدول notifications
    - يعرض عدد غير المقروءة + قائمة منسدلة
    - يدعم "قراءة الكل" و"قراءة فردية"
  - مُدمج في `DashboardShell` — يظهر في كل لوحات التحكم

#### 3. تحديث لوحات التحكم
- **Client Dashboard:** زر "إنشاء طلب" يستدعي `place_order` RPC
- **Driver Dashboard:** زر "قبول" يستدعي `accept_order` RPC
- **كل اللوحات:** جرس الإشعارات (NotificationBell) في الـ Header

#### ملخص الأنماط:
| النمط | الآلية | الاستخدام |
|-------|--------|----------|
| Request-Reply (RPC) | Supabase .rpc() → PG Function | place_order, accept_order |
| Message Queue | Trigger → notifications table | إشعارات تغيير حالة الطلب |
| Pub-Sub | Realtime Postgres Changes | NotificationBell يستقبل الإشعارات |
| At-most-once | UI lock guard | منع الإرسال المزدوج |
| Space/Time Uncoupling | Notifications table | المرسل لا يعرف المستقبل |

---

### [2026-05-17] — المتطلب 6: Web Services + P2P (Lecture 6)

#### 1. Web Services — Interoperability

**المبدأ:** أي عميل HTTP خارجي يمكنه استهلاك الخدمة عبر واجهة موحدة

- **Edge Function:** `supabase/functions/track-order/index.ts`
  - مُنشرة على Supabase Edge (Deno runtime)
  - GET/POST `/functions/v1/track-order?order_id=...`
  - تُعيد JSON موحد: حالة الطلب + موقع السائق
  - CORS headers للوصول من أي نطاق
  - معالجة أخطاء متدرجة (400, 404, 500)
- **Service Description:** `public/api-docs.json`
  - OpenAPI 3.0.3 specification
  - يصف الـ endpoints والمخرجات والأخطاء
  - يمكن استيراده في Swagger UI / Postman
- **التحقق:** `curl "https://zpsdqvmqzxzazfsegfjv.supabase.co/functions/v1/track-order?order_id=<UUID>"`

#### 2. P2P System — 3rd Generation (Middleware-based)

**المبدأ:** تقليل الحمل على الخادم المركزي باستخدام التخزين الموزع على الحافة

- **DHT Cache:** `src/lib/supabase/p2p-cache.ts`
  - `P2PCache` class — جدول هاش موزع في الذاكرة
  - `put()` / `get()` / `has()` — O(1) للبحث عن العقد
  - `getByRole()` — تصفية حسب الدور
  - `getNearbyDrivers()` — ترتيب حسب المسافة (Haversine)
  - TTL + إخلاء تلقائي للعقد المنقطعة
  - **Edge Caching:** العقدة تتحقق من الكاش المحلي قبل RPC → Load Balancing
- **P2P Discovery:** `src/hooks/use-p2p-discovery.ts`
  - `useP2PDiscovery()` — Hook للإعلان والاكتشاف
  - كل عقدة تُعلن عن نفسها كل 10 ثواني على قناة `p2p-mesh`
  - العقد الأخرى تستقبل الإعلان وتخزّنه في DHT
  - `isPeerOnline()` / `getPeer()` / `getNearbyDrivers()` — استعلامات محلية (no RPC)
- **Driver Dashboard:** لوحة P2P Mesh تعرض العقد المكتشفة

#### ملخص الأنماط:
| النمط | الآلية | الاستخدام |
|-------|--------|----------|
| Web Service | Edge Function (Deno) | track-order للعملاء الخارجيين |
| Service Description | OpenAPI 3.0 (api-docs.json) | توثيق الواجهة |
| DHT Cache | P2PCache (in-memory) | تخزين العقد المجاورة محلياً |
| P2P Discovery | Broadcast على p2p-mesh | اكتشاف العقد + بناء خريطة الحافة |
| Edge Caching | فحص الكاش قبل RPC | تقليل الحمل (Load Balancing) |

---

### [2026-05-17] — المتطلب 9: Advanced Security + Attack Surfaces (Lecture 9)

#### 1. تحليل أسطح الهجوم (Slide 3)
- **`docs/security_analysis.md`** — توثيق شامل:
  - GPS Spoofing → Proof of Delivery + Cross-validation
  - Unauthorized Order Modification → RLS + FOR UPDATE lock
  - Packet Sniffing → HTTPS/WSS + JWT
  - Denial of Service → Rate Limiting
  - Token Theft → JWT expiry + Middleware + RLS
  - Secure Principals table + 5-Layer Security diagram

#### 2. التوقيع الرقمي — Non-repudiation (Slide 11, 17)
- **`src/lib/utils/crypto.ts`:**
  - `generateKeyPair(userId)` — توليد مفاتيح HMAC-SHA256 لكل principal
  - `signDelivery(orderId, driverId, clientId)` — توليد Proof of Delivery (POD)
  - `verifyDelivery(pod)` — التحقق من صحة التوقيع
  - `hashFile(file)` / `hashText(text)` — SHA-256 للتكامل البياني

#### 3. حماية DoS — Rate Limiting (Slide 3)
- **`src/middleware.ts`** — تحديث:
  - Sliding window per IP: 100 طلب/دقيقة
  - رد 429 مع `Retry-After` header
  - `X-RateLimit-Limit` / `X-RateLimit-Remaining` headers
  - تنظيف تلقائي للمدخلات المنتهية

---

### [2026-05-17] — المتطلب 10: Distributed File System (Lecture 10)

#### 1. تخزين هرمي — Hierarchical Namespace (Slide 10)
- **`supabase/migrations/0004_storage_dfs.sql`:**
  - Bucket `delivery-dfs` بحد 5MB وأنواع MIME محددة
  - هيكلية:
    - `/restaurants/{id}/menu/` — صور القوائم
    - `/orders/{id}/receipts/` — إيصالات الطلبات
    - `/drivers/{id}/identity/` — وثائق السائقين
  - RLS: كل دور يصل فقط لملفاته

#### 2. UFID — Unique File Identifier (Slide 13)
- **`src/lib/supabase/dfs-client.ts`:**
  - `generateUFID(ext)` — timestamp(base36) + UUID + extension
  - `parseUFID(ufid)` — استخراج المكونات
  - `DFSClient` class:
    - `upload()` — رفع بـ UFID تلقائي (append-only)
    - `getUrl()` — رابط موقّع مع Client-side Cache
    - `listFiles()` / `download()` / `delete()`

#### 3. Client-side Caching (Slide 10 — Efficiency)
- تخزين URLs الملفات في `localStorage` بـ TTL 5 دقائق
- الفحص المحلي أولاً قبل طلب signed URL جديد
- إبطال الكاش عند الحذف

#### ملخص الأنماط:
| النمط | الآلية | الاستخدام |
|-------|--------|----------|
| UFID | timestamp + UUID | معرّف فريد عالمياً لكل ملف |
| Hierarchical NS | /entity/{id}/dir/ | التنظيم الهرمي |
| Client Cache | localStorage + TTL | تقليل طلبات التخزين |
| Digital Signature | HMAC-SHA256 (Web Crypto) | Proof of Delivery — Non-repudiation |
| Rate Limiting | Sliding window per IP | حماية DoS |
| Storage RLS | Supabase Storage policies | وصول حسب الدور |

---

### [2026-05-17] — Admin Dashboard + Professional Landing Page

#### 1. RBAC — Role-Based Access Control
- **`supabase/migrations/0005_admin_role_and_seed.sql`:**
  - إضافة `admin` إلى `user_role` enum
  - `is_admin(user_id)` — دالة فحص الصلاحية
  - RLS policies: admin يقرأ ويُعدّل كل الجداول
- **`src/middleware.ts`:**
  - `/dashboard/admin` محمي — فقط `role=admin` يدخل
  - غيره يُعاد توجيهه لـ `/auth/login?error=unauthorized`
- **Admin Account:** `ibro@gmail.com` / `admin123`

#### 2. Professional Landing Page
- **`src/app/page.tsx`** — إعادة بناء كاملة:
  - Hero Section: "منصة توصيل ذكية موزّعة"
  - Stats Bar: 10 متطلبات، 5 محاضرات، 4 عقد، <50ms latency
  - Distributed Features: Realtime + P2P + Security + DFS
  - CTA: 4 بطاقات (Client, Restaurant, Driver, Admin)
  - Footer مع ملخص البنية

#### 3. Admin Dashboard — System Orchestrator
- **`src/app/dashboard/admin/page.tsx`:**
  - **System Health:** Latency, عدد المستخدمين, سائقين متصلين, طلبات نشطة
  - **User Management:** جدول كل المستخدمين + تغيير الدور
  - **Transaction Oversight:** كل الطلبات في الشبكة
  - **Global Node Map:** مطاعم + سائقين + حالة كل عقدة
  - **DFS Explorer:** ملفات الـ delivery-dfs bucket

#### 4. تحديثات إضافية
- `src/types/index.ts` — إضافة `admin` لـ UserRole + SYSTEM_NODES
- `RoleCard.tsx` — إضافة أيقونة Shield للأدمن
- `DashboardShell.tsx` — إضافة لون بنفسجي للأدمن
- `scripts/seed-admin.mjs` — سكريبت إنشاء حساب الأدمن

---

## بنية المشروع الحالية

```
d:\online_delivery_restaurant\
├── .env.local
├── .gitignore
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
├── system_change_log.md
├── src/
│   ├── middleware.ts                   ← Security + Rate Limiting + RBAC
│   ├── types/
│   │   └── index.ts
│   ├── hooks/
│   │   ├── use-distributed-status.ts   ← Interaction Model
│   │   ├── use-order-socket.ts         ← IPC: Message Passing + Multicast
│   │   ├── use-driver-stream.ts        ← IPC: Stream Communication
│   │   ├── use-remote-actions.ts       ← RPC: place_order + accept_order
│   │   └── use-p2p-discovery.ts        ← P2P: Edge Discovery
│   ├── lib/
│   │   ├── utils/
│   │   │   ├── time.ts                 ← Interaction Model
│   │   │   └── crypto.ts               ← Digital Signatures + POD
│   │   └── supabase/
│   │       ├── client.ts
│   │       ├── server.ts
│   │       ├── provider.tsx
│   │       ├── failure-handler.ts      ← Failure Model
│   │       ├── realtime-service.ts     ← Socket Layer (Req 4)
│   │       ├── p2p-cache.ts            ← P2P: DHT Cache
│   │       └── dfs-client.ts           ← DFS: UFID + Storage
│   ├── components/
│   │   ├── shared/
│   │   │   ├── RoleCard.tsx
│   │   │   ├── DashboardShell.tsx
│   │   │   └── NotificationBell.tsx    ← Pub-Sub: Indirect Comm
│   │   ├── client/
│   │   ├── restaurant/
│   │   └── driver/
│   └── app/
│       ├── layout.tsx
│       ├── page.tsx
│       ├── globals.css
│       ├── auth/
│       │   ├── login/page.tsx
│       │   ├── register/page.tsx
│       │   └── callback/route.ts
│       └── dashboard/
│           ├── admin/page.tsx          ← System Orchestrator (RBAC)
│           ├── client/page.tsx         ← P2P + Stream Read + RPC
│           ├── restaurant/page.tsx     ← Multicast + P2P + ACK
│           └── driver/page.tsx         ← Stream + Multicast + RPC + P2P
├── supabase/
│   ├── config.toml
│   ├── functions/
│   │   └── track-order/index.ts    ← Web Service (Edge Function)
│   └── migrations/
│       ├── 0001_initial_schema.sql
│       ├── 0002_server_time_function.sql
│       ├── 0003_remote_actions.sql      ← RPC + Notifications + Trigger
│       ├── 0004_storage_dfs.sql         ← DFS Bucket + Storage RLS
│       └── 0005_admin_role_and_seed.sql  ← Admin Role + RBAC Policies
├── public/
│   └── api-docs.json               ← OpenAPI Service Description
├── docs/
│   └── security_analysis.md        ← Attack Surface Analysis (Req 9)
├── scripts/
│   └── seed-admin.mjs              ← Admin Account Seeding
```

---

## ملاحظات
- يتم تحديث هذا الملف بعد كل تغيير أو إضافة في النظام
- كل تغيير يُوثّق بالتاريخ والوصف التفصيلي
- النظام يستخدم **Multi-tier Architecture** مع **Thin Clients** (محاضرة 3)
- التوزيع: **Geographically Distributed Edges** تتصل بـ **Centralized Cloud Hub**
- النموذج الأساسي: **Asynchronous Interaction** + **Failure Masking** + **Identity-Based Security**
- IPC: **WebSockets** (Supabase Realtime) — Stream + Message Passing + Multicast + ACK
- Remote Invocation: **PostgreSQL RPC** — place_order + accept_order (At-most-once)
- Indirect Comm: **Message Queue** (notifications table) + **Pub-Sub** (Realtime)
- Web Services: **Edge Function** (track-order) + **OpenAPI** (api-docs.json)
- P2P: **DHT Cache** + **Edge Discovery** (3rd Gen Middleware-based) + **Load Balancing**
- Security: **Digital Signatures** (HMAC-SHA256) + **Rate Limiting** + **5-Layer Defense**
- DFS: **Supabase Storage** + **UFID** + **Client-side Caching** + **Hierarchical Namespace**
- Admin: **RBAC** (is_admin + Middleware) + **System Orchestrator** Dashboard
- Landing Page: **Professional** — Hero + Features + Stats + CTA
- Onboarding: **Node Initialization** — Restaurant/Driver/Client setup pages
- Verification: **Admin as CA** — verify_node RPC + Pending Approvals tab
- DFS Identity: **Hierarchical storage** — drivers/{id}/identity/ + restaurants/{id}/menu/
- Middleware: **Verification Gate** — unverified users redirected to /setup
- **جميع المتطلبات الأكاديمية (1–10) مكتملة ✅**

---

### [2026-05-17] — Node Onboarding & Identity Verification

#### 1. Migration `0006_onboarding_schema.sql`
- Added `is_verified`, `phone_number`, `address_metadata`, `vehicle_details`, `id_document_ufid` to `profiles`
- Added `cuisine_type`, `description`, `is_verified` to `restaurants`
- Created `menu_items` table with RLS policies
- Created `verify_node(target_user_id)` RPC — Admin-only function (Certificate Authority)
- Admin profiles auto-verified

#### 2. Restaurant Setup (`/dashboard/restaurant/setup`)
- Restaurant info form: name, location, cuisine, description
- Menu Manager: add/delete meals with price, description, DFS image upload
- Images stored in `delivery-dfs/restaurants/{id}/menu/{ufid}`

#### 3. Driver Setup (`/dashboard/driver/setup`)
- Vehicle info: model, plate number (stored in `vehicle_details` JSONB)
- Identity document upload: driver license + ID via DFS
- Documents stored in `delivery-dfs/drivers/{id}/identity/{ufid}`

#### 4. Client Setup (`/dashboard/client/setup`)
- Basic info: full name, phone number
- Saved delivery addresses (stored in `address_metadata` JSONB)

#### 5. Admin Verification Workflow
- New "Approvals" tab in admin dashboard
- Lists all unverified restaurants and drivers
- Document viewer: preview uploaded ID documents from DFS
- One-click verify button calls `verify_node` RPC
- Admin acts as Certificate Authority (Lecture 9, Slide 6)

#### 6. Middleware Verification Gate
- Unverified non-admin users redirected to `/dashboard/{role}/setup`
- Setup pages are accessible without verification
- Admins bypass verification gate entirely

#### 7. Security & Architecture
- **Requirement 1 & 10**: Node Initialization + Hierarchical DFS storage for identities
- **Impostor Mitigation** (Lecture 9): Verification workflow prevents unauthorized access
- **RBAC**: Admin as Certificate Authority for system nodes (Lecture 9, Slide 6)

#### 8. Fix: Realtime Subscription "cannot add callbacks after subscribe()" Error
- **Root cause**: `freshChannel()` used `supabase.channel(name)` with the same name, which returned the old (already-subscribed) channel object from Supabase's internal registry after fire-and-forget removal
- **Fix in `realtime-service.ts`**: Added monotonic counter (`channelSeq`) — each `freshChannel` call now creates a unique internal channel name (`name::seq`), guaranteeing a brand-new channel object
- **Fix in `NotificationBell.tsx`**: Added `cancelled` guard + 50ms `setTimeout` to let Strict Mode cleanup complete before re-subscribing; cleanup now properly clears the timeout and removes the channel

### [2026-05-17] — Full Order Lifecycle Implementation

#### 1. Migration `0007_order_lifecycle.sql`
- Added `items` JSONB column to `orders` table
- Updated `place_order` RPC to store items in orders
- Updated `accept_order` RPC to accept `ready_for_pickup` orders (first-come-first-served)
- Added RLS policy: drivers can view `ready_for_pickup` orders with no driver assigned

#### 2. Client Dashboard (Complete Rewrite)
- **Browse restaurants**: shows verified + open restaurants with name, cuisine, description
- **View menu**: click restaurant → see menu items with prices
- **Cart**: add/remove items, adjust quantities, see total
- **Place order**: RPC `place_order` with items JSONB + total
- **Real-time tracking**: Postgres Changes subscription on `orders` table filtered by `client_id`
- **Status progress bar**: visual 7-step progress indicator
- **Confirm delivery**: client clicks "تأكيد التوصيل" when order status is `in_transit`

#### 3. Restaurant Dashboard (Complete Rewrite)
- **Toggle open/closed**: restaurant can go online/offline
- **Real-time incoming orders**: Postgres Changes subscription filtered by `restaurant_id`
- **Status flow**: pending → accepted → preparing → ready_for_pickup
- **Order items display**: shows each item name, quantity, price
- **Completed orders history**: delivered/cancelled orders list

#### 4. Driver Dashboard (Complete Rewrite)
- **Toggle online/offline**: driver must be online to see/accept orders
- **Available orders**: shows `ready_for_pickup` orders with no driver (RLS-based)
- **Accept order (RPC)**: `accept_order` atomically assigns driver (row lock prevents races)
- **Status flow**: picked_up → in_transit → delivered
- **Real-time refresh**: Postgres Changes subscription triggers data refresh

#### 5. Order Lifecycle Flow
```
Client browses → selects items → places order (RPC)
    ↓
Restaurant receives (Realtime) → accepts → prepares → marks ready
    ↓
All drivers see ready order → first to accept gets it (RPC + row lock)
    ↓
Driver picks up → in transit → marks delivered
    ↓
Client confirms delivery → order complete
```

#### 6. Types Updated
- Added `OrderItem` interface (`menu_item_id`, `name`, `price`, `quantity`)
- Added `items: OrderItem[]` field to `Order` interface

### [2026-05-18] — Dashboard UI Redesign (Reference-Inspired)

#### Design System Changes
- **DashboardShell**: Added role-based light page backgrounds (`bg-blue-50` client, `bg-emerald-50` restaurant, `bg-slate-100` driver)
- **RTL layout**: All dashboard views use `dir="rtl"` for proper Arabic text direction
- **Design language**: Clean white cards on light backgrounds, minimal shadows, rounded-xl corners

#### 1. Client Dashboard
- **Restaurant cards**: White cards with blue icon, name, cuisine, "مفتوح" badge, hover lift effect
- **Menu grid**: 3-column layout, item name top-right, green price top-left, dark "أضف للسلة" button
- **Cart controls**: Circular blue +/- buttons with quantity counter when item is in cart
- **Floating cart bar**: Fixed bottom bar with item count, total in ريال, green "إتمام الطلب" button
- **Checkout**: Two-column layout — order summary (items with delete, total) + confirm button
- **Order tracking**: Order # card → purple gradient status banner with emoji → circular step indicators (reversed RTL) with connecting lines → order details card
- **Step indicators**: Large blue circle for current, green check for completed, gray for future
- **Past orders**: Grid of white cards with status badge, date, amount

#### 2. Restaurant Dashboard
- **Header**: "لوحة التحكم" title + "إدارة القائمة" link + open/close toggle button
- **New orders section**: Yellow dot indicator, white cards with order #, date, items list, amount, green "قبول الطلب" button
- **In-progress orders**: Status-colored badges (yellow preparing, purple ready), bordered "تحديث إلى:" action button
- **Completed orders**: 3-column grid of compact white cards with status badge, date, amount
- **Settings tab**: Clean white card forms, green accent buttons, menu items with green price editing

#### 3. Driver Dashboard
- **Status card**: White card with RTL layout, truck icon (green/gray), explicit connect/disconnect button
- **Stats**: 2-column grid showing available and active order counts
- **Available orders**: White cards with purple "جاهز للاستلام" badge, item list, blue "قبول الطلب" button
- **Active orders**: Status-colored badges (cyan picked_up, blue in_transit), green/blue action buttons

### [2026-05-18] — Text Readability Fixes & Admin Role-Change Removal

#### 1. Dark Mode → Class-Based (globals.css)
- Switched Tailwind v4 dark mode from `prefers-color-scheme` (media) to class-based via `@custom-variant dark`
- Removed OS dark mode CSS variable override (`--background: #0a0a0a`) that was causing dark body backgrounds
- Since no `dark` class is ever added, `dark:` variants no longer activate — all dashboards stay on light backgrounds
- **Root cause**: OS dark mode preference was activating `dark:bg-gray-900` on admin cards/tables, creating dark panels on light page backgrounds with poor text contrast

#### 2. Restaurant Settings — Input Readability
- Added explicit `text-gray-800` to all form inputs (name, cuisine, lat, lng, description)
- Added `text-gray-800 placeholder:text-gray-400` to "add menu item" inputs
- Added `text-gray-800` to inline price edit input

#### 3. Admin Dashboard — Contrast Improvements
- **Certificate Authority banner**: upgraded from `bg-yellow-950/20` to `bg-yellow-900/40` with `text-yellow-100` in dark context
- **Empty approvals card**: changed to `dark:bg-gray-800` with `text-gray-600 dark:text-gray-300`
- **Table headers**: added `dark:text-gray-400` across all tables (Users, Orders, Approvals)
- **Table cells**: upgraded `text-gray-400` to `text-gray-500 dark:text-gray-400` for IDs, dates, amounts

#### 4. Admin Users Tab — Role-Change Dropdown Removed
- **Removed** the `<select>` dropdown that allowed changing user roles (client ↔ driver ↔ restaurant ↔ admin)
- **Removed** the `handleRoleChange` function entirely
- **Replaced** Actions column with "Verified" column showing مفعّل / غير مفعّل badges
- **Rationale**: Changing user roles is illogical — a client should not become a driver or restaurant owner via admin action; roles are set during registration and verified through the Certificate Authority flow

### [2026-05-18] — Dark/Light Mode Toggle Feature

#### 1. Theme System Implementation
- **ThemeProvider** (`src/components/shared/ThemeProvider.tsx`): React context for theme state management
  - Stores theme preference in `localStorage`
  - Toggles `dark` class on `<html>` element
  - Prevents hydration mismatch with `mounted` state guard
- **ThemeToggle** (`src/components/shared/ThemeToggle.tsx`): Moon/Sun icon button for switching themes
- **Layout update** (`src/app/layout.tsx`): Wrapped app with `ThemeProvider`, added `suppressHydrationWarning` to `<html>`

#### 2. Dashboard Shell Updates
- Added `ThemeToggle` button to header (next to notification bell)
- Updated `roleBg` map to include `dark:bg-gray-900` for all roles

#### 3. Dark Mode Support Added to Dashboards
- **Client Dashboard**: Cards, inputs, headings, empty states — all support `dark:bg-gray-800`, `dark:text-gray-100`
- **Restaurant Dashboard**: Order cards, settings forms, status badges — dark mode variants added
- **Driver Dashboard**: Status card, stats, order cards — dark mode support
- **Admin Dashboard**: Already had dark mode classes from previous work

#### 4. How It Works
- User clicks Moon icon → theme switches to dark, `dark` class added to `<html>`
- Tailwind's `dark:` variants activate (e.g., `dark:bg-gray-800`, `dark:text-gray-100`)
- Preference persists in `localStorage` across sessions

### [2026-05-18] — Geo-spatial Location Transparency

#### 1. LocationPicker Map Component
- **File**: `src/components/shared/LocationPicker.tsx`
- Uses Leaflet with `react-leaflet` for interactive map display
- **LocationPicker**: Allows users to click/drag a marker or click anywhere on map to set location. Supports "My Current Location" button.
- **LocationDisplay**: Shows two markers (green = pickup, red = delivery) with auto-fitted bounds
- Icons loaded from CDN to avoid Next.js webpack asset issues with Leaflet defaults

#### 2. Restaurant Setup Page — Interactive Map Picker
- **File**: `src/app/dashboard/restaurant/setup/page.tsx`
- **Replaced** manual latitude/longitude `<input>` fields with `LocationPicker` map component
- Coordinates sync to React state via `onLocationChange` callback
- Saved to `restaurants` table on Submit as `latitude` / `longitude` columns

#### 3. Client Checkout — Delivery Location Map
- **File**: `src/app/dashboard/client/page.tsx`
- **Added** delivery location map picker in checkout (cart) view
- Client must select a delivery point on map before confirming order
- `place_order` RPC updated to include `p_delivery_lat` and `p_delivery_lng`

#### 4. Order Type Updates
- **File**: `src/types/index.ts`
- Added `delivery_lat` and `delivery_lng` to `Order` interface
- Created `OrderBroadcastPayload` interface for enriched driver broadcasts with:
  - `pickup_location: {lat, lng}` (from restaurant)
  - `delivery_location: {lat, lng}` (from order)
  - `order_details: {total, items, restaurant_name}`

#### 5. Enriched Realtime Broadcast for Drivers
- **File**: `src/app/dashboard/restaurant/page.tsx`
- When order status changes to `ready_for_pickup`, restaurant sends enriched broadcast via `RealtimeService.sendBroadcast`
- **Channel**: `drivers:available-orders`
- **Event**: `new_order`
- **Payload**: `OrderBroadcastPayload` with pickup & delivery coordinates

#### 6. Driver Dashboard — Pickup/Delivery Map Display
- **File**: `src/app/dashboard/driver/page.tsx`
- **Subscribes** to enriched broadcasts on `drivers:available-orders` channel
- Shows toast notification when new enriched broadcast arrives
- Fetches restaurant coordinates for all orders and caches in `Map<string, Restaurant>`
- **Available orders**: Collapsible map toggle button (`عرض موقع الاستلام والتوصيل`)
- **Active orders**: Map always visible showing pickup (green) and delivery (red) markers
- Uses `LocationDisplay` component with `FitBoundsMap` to auto-center view

#### 7. Technical Fixes
- Renamed `dynamic` import alias in dashboard pages to avoid naming conflicts
- Fixed `useTheme` hook to return default value during SSR/prerender instead of throwing
- Added `dark:bg-gray-800` / `dark:text-gray-100` to map containers for dark mode consistency

### [2026-05-18] — Stream Communication: Real-Time Driver Tracking

#### 1. Driver Location Stream (Driver Node → Cloud Hub)
- **File**: `src/app/dashboard/driver/page.tsx`
- Added `trackingOrderId` state to manage active delivery tracking mode
- **`toggleTracking(orderId)`**: Toggle button per active order (only visible when `status === "in_transit"`)
  - Green "بدء التتبع المباشر" → starts streaming
  - Red "إيقاف التتبع" → stops streaming
- **`useEffect` with `setInterval`**: Every 3 seconds:
  - Calls `navigator.geolocation.getCurrentPosition` with `enableHighAccuracy: true`
  - Upserts `{ driver_id, current_latitude, current_longitude, is_online: true }` into `driver_locations` table
  - Represents a **continuous stream** of GPS data from Driver Node to Cloud Hub

#### 2. Client Live Tracking Map (Cloud Hub → Client Node)
- **File**: `src/app/dashboard/client/page.tsx`
- Added `driverLocations` Map state to cache latest coordinates per driver
- **`fetchMyOrders`**: Now also fetches:
  - Restaurant data into `restaurantMap` (for pickup coordinates)
  - Driver locations into `driverLocations` (for initial driver position)
- **Real-time subscription** to `driver_locations` table with `UPDATE` filter:
  - Channel: `client-driver-locs:${userId}`
  - When a driver row updates, the client immediately updates `driverLocations` state
  - No page refresh required — this is **Location Transparency**
- **`LiveTrackingMap`**: Embedded below "مراحل الطلب" in the tracking view
  - Shows 3 markers: pickup (green), delivery (red), driver (blue)
  - Auto-fits bounds to include all three points
  - Only visible when `order.driver_id` exists and coordinates are available

#### 3. LiveTrackingMap Component
- **File**: `src/components/shared/LiveTrackingMap.tsx`
- Uses `react-leaflet` with custom colored markers
- `FitBounds` helper recalculates map bounds whenever driver position changes
- Legend shows: الاستلام (green) — السائق (blue) — التوصيل (red)

#### 4. Distributed Concepts Implemented
- **Stream Communication** (Lecture 4, Slide 5): Unidirectional data flow `Driver → Hub → Client` at 3-second intervals
- **Location Transparency**: Client sees driver movement without knowing driver’s device IP or internal network details
- **WebSocket Optimization**: Single `driver_locations` table subscription handles all driver updates efficiently

### [2026-05-18] — Stripe Payment Integration (Web Service Interoperability & Indirect Communication)

#### 1. Database Schema Update
- **File**: `supabase/migrations/0009_stripe_payment_status.sql`
- Added `payment_status TEXT` column to `orders` with constraint (`pending` | `paid` | `failed`)
- Added `stripe_session_id TEXT` column to link orders with Stripe Checkout Sessions
- Added index `idx_orders_stripe_session_id` for webhook lookups
- Created RPC `confirm_order_payment(p_stripe_session_id)` for webhook use
- Created RPC `set_order_stripe_session(p_order_id, p_stripe_session_id)` for linking

#### 2. Checkout API Route — Web Service Interoperability (Req 7)
- **File**: `src/app/api/checkout/route.ts`
- Acts as gateway to Stripe REST API (external distributed system)
- Creates Stripe Checkout Session with line items from cart
- Stores `stripe_session_id` on the order via Supabase admin client
- Returns `session.url` for client redirect
- Currency: SAR (Saudi Riyal)

#### 3. Stripe Webhook Route — Indirect Communication (Req 6)
- **File**: `src/app/api/webhooks/stripe/route.ts`
- Listens for `checkout.session.completed` events from Stripe servers
- Verifies webhook signature using `STRIPE_WEBHOOK_SECRET`
- On success: atomically updates `payment_status = 'paid'` and `status = 'accepted'`
- Also handles `payment_intent.payment_failed` → `payment_status = 'failed'`
- Uses `createAdminClient()` (service role) to bypass RLS
- **Concept**: Time-uncoupled communication — payment happens async on Stripe, webhook notifies later

#### 4. Client Checkout Flow Update
- **File**: `src/app/dashboard/client/page.tsx`
- New flow: `place_order` RPC → `/api/checkout` → redirect to Stripe → webhook updates DB
- Button renamed to "الدفع والتأكيد" to reflect Stripe redirect
- Detects `?paid=success` / `?paid=cancelled` query params on return and shows toast
- Payment status badge added to order tracking UI:
  - 🟡 "بانتظار الدفع" — pending
  - 🟢 "تم الدفع" — paid
  - 🔴 "فشل الدفع" — failed

#### 5. Environment Variables Required
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_SERVICE_ROLE_KEY=<service-role>
NEXT_PUBLIC_APP_URL=https://localhost:3000
```

#### 6. Webhook Environment Verification
- **Verified**: `STRIPE_WEBHOOK_SECRET` is read correctly from `.env.local` at module level
- **Verified**: `stripe-signature` header is validated before any processing
- **Verified**: Missing `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` throws explicit error at startup
- **Verified**: `POST /api/webhooks/stripe` route is dynamic (server-rendered on demand) and correctly receives raw body via `req.text()`
- **Indirect Communication Tunnel Established**: Stripe servers (Publisher) → `/api/webhooks/stripe` (Subscriber) → Supabase admin client (Atomic DB update)

#### 7. Distributed Concepts Implemented
- **Web Service Interoperability** (Lecture 7): Independent distributed system (Stripe) integrated via REST API
- **Indirect Communication** (Lecture 6): Stripe acts as Publisher, our webhook as Subscriber
- **Atomic Updates**: Webhook ensures DB state stays consistent with Stripe payment state

### [2026-05-20] — User Profile Page & Header Identity Display

#### 1. DashboardShell Header Update
- **File**: `src/components/shared/DashboardShell.tsx`
- Fetches user profile from `profiles` table on mount
- Displays username and Arabic role label in the header bar
- Added dropdown menu with: user info (name, email, role badge), profile page link, and logout
- Dropdown shows on all dashboard pages: client, driver, restaurant, admin

#### 2. Profile Page
- **File**: `src/app/dashboard/profile/page.tsx`
- Route: `/dashboard/profile`
- Shows read-only account info: email, Node ID, role type, verification status, last update
- Editable fields: full name, phone number
- Driver-specific: displays vehicle details if available
- Shows address metadata if present
- Gradient header matches user role color scheme
- Back button navigates to role-appropriate dashboard
