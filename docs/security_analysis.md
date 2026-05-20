# تحليل أمني — Distributed Delivery System
## Security Analysis (Lecture 9: Security)

---

## 1. Attack Surfaces (أسطح الهجوم)

### 1.1 GPS Spoofing — انتحال الموقع (Driver)
| البند | التفصيل |
|-------|---------|
| **الوصف** | سائق يُرسل إحداثيات مزيفة للنظام ليبدو أنه أقرب للمطعم أو قد أتمّ التوصيل |
| **المكوّن المُهدد** | `use-driver-stream.ts` → `driver_locations` table |
| **التصنيف** | Tampering (التلاعب) |
| **الاحتمالية** | عالية — أدوات تزييف GPS متاحة على الأجهزة المحمولة |
| **الأثر** | تعيين خاطئ للطلبات، إثبات توصيل مزوّر |
| **التخفيف** | 1. **Proof of Delivery** بتوقيع رقمي (`crypto.ts` → `signDelivery()`) — Non-repudiation |
| | 2. Cross-validation مع عنوان العميل المُسجّل |
| | 3. فحص Heartbeat (الموقع لم يتغير > 30 ثانية = شبهة) |

### 1.2 Unauthorized Order Modification — تعديل غير مُصرّح
| البند | التفصيل |
|-------|---------|
| **الوصف** | مُهاجم يُعدّل حالة طلب أو مبلغ دون صلاحية |
| **المكوّن المُهدد** | `orders` table، RPC functions |
| **التصنيف** | Elevation of Privilege (تصعيد الصلاحيات) |
| **الاحتمالية** | متوسطة — تتطلب token مُصادق |
| **الأثر** | خسائر مالية، بيانات غير متسقة |
| **التخفيف** | 1. **RLS Policies** — كل جدول يفرض قيود على مستوى الصف |
| | 2. **RPC SECURITY DEFINER** — الدوال تُنفذ بصلاحيات محددة |
| | 3. **FOR UPDATE** lock في `accept_order` — منع Race Conditions |
| | 4. **At-most-once** guard في الـ UI — منع الإرسال المزدوج |

### 1.3 Packet Sniffing — التنصت على الشبكة
| البند | التفصيل |
|-------|---------|
| **الوصف** | مُهاجم يعترض حزم البيانات بين العميل والخادم |
| **المكوّن المُهدد** | جميع قنوات الاتصال (HTTP, WebSocket) |
| **التصنيف** | Information Disclosure (كشف المعلومات) |
| **الاحتمالية** | منخفضة — HTTPS/WSS مُفعّل |
| **الأثر** | تسريب بيانات المستخدمين، tokens |
| **التخفيف** | 1. **HTTPS** لكل طلبات REST |
| | 2. **WSS** لكل اتصالات Realtime (WebSockets) |
| | 3. **JWT** مُشفّرة ومُوقّعة من Supabase Auth |
| | 4. **httpOnly cookies** لتخزين الجلسة |

### 1.4 Denial of Service (DoS) — حرمان من الخدمة
| البند | التفصيل |
|-------|---------|
| **الوصف** | إغراق الخادم بطلبات مُتكررة لتعطيل الخدمة |
| **المكوّن المُهدد** | Cloud Hub (Middleware, Edge Functions, DB) |
| **التصنيف** | Denial of Service |
| **الاحتمالية** | متوسطة |
| **الأثر** | توقف الخدمة لجميع المستخدمين |
| **التخفيف** | 1. **Rate Limiting** في `middleware.ts` — تحديد عدد الطلبات per IP |
| | 2. Supabase built-in rate limits على Auth و REST |
| | 3. Edge Function isolation — كل دالة في sandbox مُنفصل |

### 1.5 Token Theft — سرقة رمز المصادقة
| البند | التفصيل |
|-------|---------|
| **الوصف** | مُهاجم يسرق JWT token ويستخدمه لانتحال هوية المستخدم |
| **المكوّن المُهدد** | Auth system, Supabase client |
| **التصنيف** | Spoofing (انتحال الهوية) |
| **الاحتمالية** | منخفضة — تتطلب XSS أو وصول فيزيائي |
| **الأثر** | وصول كامل لحساب المستخدم |
| **التخفيف** | 1. **JWT expiry** قصير (1 ساعة) مع refresh تلقائي |
| | 2. **Middleware** يتحقق من صلاحية الـ token في كل طلب |
| | 3. **RLS** يضمن أن الـ token يصل فقط لبيانات صاحبه |

---

## 2. Secure Principals (الكيانات الآمنة)

| Principal | الهوية | المصادقة | التفويض |
|-----------|--------|----------|---------|
| **Client** | UUID from auth.users | Email + Password → JWT | RLS: طلباته فقط |
| **Restaurant** | UUID (owner_id) | Email + Password → JWT | RLS: مطعمه + طلباته |
| **Driver** | UUID from auth.users | Email + Password → JWT | RLS: طلباته المُعيّنة + موقعه |
| **Cloud Hub** | Supabase service_role | Service Role Key | وصول كامل (SECURITY DEFINER) |
| **Edge Function** | Supabase function runtime | Service Role Key | وصول لقراءة الطلبات + المواقع |

---

## 3. Security Layers (طبقات الأمان)

```
┌─────────────────────────────────────────────────┐
│  Layer 1: Transport Security (HTTPS/WSS)        │
│  ┌─────────────────────────────────────────────┐ │
│  │  Layer 2: Rate Limiting (middleware.ts)     │ │
│  │  ┌─────────────────────────────────────────┐ │
│  │  │  Layer 3: Authentication (JWT + Auth)  │ │ │
│  │  │  ┌─────────────────────────────────────┐ │ │
│  │  │  │  Layer 4: Authorization (RLS)      │ │ │ │
│  │  │  │  ┌─────────────────────────────────┐ │ │ │
│  │  │  │  │  Layer 5: Data Integrity       │ │ │ │ │
│  │  │  │  │  (Digital Signatures, Hashing) │ │ │ │ │
│  │  │  │  └─────────────────────────────────┘ │ │ │
│  │  │  └─────────────────────────────────────┘ │ │
│  │  └─────────────────────────────────────────┘ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## 4. الملفات المُنفذة

| الملف | الدور الأمني |
|-------|-------------|
| `src/middleware.ts` | JWT verification + Rate Limiting (DoS protection) |
| `src/lib/utils/crypto.ts` | Digital Signatures + Proof of Delivery + File Hashing |
| `supabase/migrations/0001_initial_schema.sql` | RLS policies for all tables |
| `supabase/migrations/0004_storage_dfs.sql` | Storage RLS for DFS bucket |
| `src/lib/supabase/failure-handler.ts` | Retry with backoff (Availability) |
| `supabase/functions/track-order/index.ts` | CORS headers + Service Role isolation |
