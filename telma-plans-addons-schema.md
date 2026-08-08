# Telma Atende: Fase 1 - Plans & Add-ons Schema

## Contexto

El dashboard ya tiene un schema básico con `clinics` que tiene un campo `plan` (enum). Ahora necesitamos:

1. Una tabla `plans` que defina qué ofrece cada plan
2. Una tabla `addons` que defina add-ons opcionales
3. Una tabla `minute_packs` para packs de minutos extras
4. Extender `clinics` para trackear `active_addons` y uso mensual
5. Crear tabla `usage_metrics` para facturación metered
6. Crear tabla `purchases` para auditoría y descuentos en checkout

Esto permitirá validar dinámicamente qué puede hacer cada clínica según su plan + addons.

---

## Tablas a crear

### 1. `plans`

Define las características de cada plan: Essencial, Clínica, Rede, Personalizado.

**Nota importante**: Los límites son en MINUTOS, no en llamadas (1 llamada ≈ 3 minutos promedio).

```sql
create table plans (
  id text primary key, -- 'essencial', 'clinica', 'rede', 'personalizado'
  name text not null, -- "Essencial", "Clínica", "Rede"
  description text,
  price_monthly_eur numeric(10,2) not null,
  price_annual_eur numeric(10,2),
  max_minutes_per_month integer not null, -- 250, 750, 2000, etc.
  max_locations integer not null default 1,
  max_concurrent_calls integer not null default 1,
  features jsonb not null default '{}', -- Feature flags:
  -- {
  --   "whatsapp": false,
  --   "api_integration": false,
  --   "custom_voice": false,
  --   "advanced_analytics": false,
  --   "priority_support": false,
  --   "multiple_languages": false,
  --   "monthly_report": false
  -- }
  stripe_price_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Datos a insertar en migration (sin IVA, sin período mínimo):
-- ('essencial', 'Essencial', 'Para consultórios pequenos', 99, 1089, 250, 1, 1, '{"whatsapp": false, "api_integration": false, "custom_voice": false, "advanced_analytics": false, "priority_support": false, "multiple_languages": false, "monthly_report": false}'::jsonb),
-- ('clinica', 'Clínica', 'Más escolhido. Voz personalizada e reporte mensal inclusos', 249, 2741, 750, 3, 2, '{"whatsapp": false, "api_integration": false, "custom_voice": true, "advanced_analytics": false, "priority_support": true, "multiple_languages": false, "monthly_report": true}'::jsonb),
-- ('rede', 'Rede', 'Para grupos multisede. Painel unificado, cada sede con número propio', 599, 6589, 2000, 3, 5, '{"whatsapp": false, "api_integration": false, "custom_voice": true, "advanced_analytics": true, "priority_support": true, "multiple_languages": false, "monthly_report": true}'::jsonb),
-- ('personalizado', 'Personalizado', 'Para +5 sedes o +2000 minutos. Consultar', null, null, null, null, null, '{}'::jsonb),
```

### 2. `addons`

Define add-ons opcionales que pueden comprarse además del plan base.

```sql
create table addons (
  id text primary key, -- 'whatsapp', 'language_en', 'language_es', 'api_integration', 'custom_voice', 'analytics'
  name text not null,
  description text,
  price_monthly_eur numeric(10,2) not null,
  feature_unlock text not null, -- Qué feature activa (ej: 'whatsapp', 'language_en')
  compatible_with text[] not null default ARRAY['essencial', 'clinica', 'rede'], -- Planes donde se puede comprar
  stripe_price_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Datos a insertar:
-- ('whatsapp', 'Telma em WhatsApp', 'Confirmações e recordatórios automáticos. Até 1000 mensagens/mês incluídas', 49, 'whatsapp', ARRAY['essencial', 'clinica', 'rede']),
-- ('language_en', 'English', 'Telma responde em inglês. Em breve disponível', 0, 'language_en', ARRAY['clinica', 'rede']),
-- ('language_es', 'Español', 'Telma responde em espanhol. Em breve disponível', 0, 'language_es', ARRAY['rede']),
-- ('api_integration', 'API Integration', 'Integração direta com seu software. Orçamento à medida', 99, 'api_integration', ARRAY['clinica', 'rede']),
-- ('analytics', 'Análitica Avançada', 'Reportes detalhados e insights (incluído em Rede)', 49, 'advanced_analytics', ARRAY['essencial', 'clinica']),
```

### 3. `minute_packs`

Packs predefinidos de minutos extras que se pueden comprar.

```sql
create table minute_packs (
  id text primary key, -- 'pack_250', 'pack_500', etc.
  name text not null, -- "Pack de 250 minutos"
  minutes integer not null,
  price_eur numeric(10,2) not null, -- 79 para 250 minutos
  price_per_minute_eur numeric(10,4) as (price_eur::numeric / minutes::numeric) stored, -- Para comparación (79/250 = 0.316€/min)
  unit_price_eur numeric(10,4) default 0.35, -- Precio unitario si compras sueltos
  stripe_price_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Datos a insertar:
-- ('pack_250', 'Pack de 250 minutos', 250, 79, 0.316, 0.35),
-- (Otros packs si se quieren ofrecer en el futuro)
```

### 4. Extender tabla `clinics`

Agregar campos para tracking de add-ons y uso.

```sql
alter table clinics add column if not exists active_addons text[] default ARRAY[]::text[];
-- Ej: ARRAY['whatsapp', 'language_en']

alter table clinics add column if not exists usage_this_month jsonb default '{
  "minutes_used": 0,
  "extra_minutes_used": 0,
  "extra_minutes_purchased": 0,
  "whatsapp_messages": 0,
  "api_calls": 0
}'::jsonb;

alter table clinics add column if not exists billing_cycle text default 'monthly' check (billing_cycle in ('monthly', 'annual'));

alter table clinics add column if not exists plan_renews_at date;

alter table clinics add column if not exists stripe_customer_id text;
alter table clinics add column if not exists stripe_subscription_id text;

-- RENOMBRAR columna anterior por consistencia (si existe):
-- ALTER TABLE clinics RENAME COLUMN call_limit TO max_calls_per_month;
-- (Mejor: mantenerla por backward compatibility, pero marcar como deprecated)

-- Índices para búsquedas rápidas
create index if not exists idx_clinics_plan on clinics(plan);
create index if not exists idx_clinics_plan_renews_at on clinics(plan_renews_at);
create index if not exists idx_clinics_status on clinics(status);
```

### 5. Tabla `usage_metrics`

Historial de uso por clínica, por día. Permite generar facturas mensuales.

```sql
create table usage_metrics (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  metric_date date not null, -- Fecha del uso
  metric_type text not null check (metric_type in ('minutes_used', 'extra_minutes_used', 'whatsapp_messages', 'api_calls', 'extra_location')),
  count integer not null default 1, -- Número de minutos, mensajes, etc.
  plan_id text, -- Snapshot del plan ese día (para facturación histórica)
  created_at timestamptz not null default now(),
  unique(clinic_id, metric_date, metric_type)
);

-- Índices
create index if not exists idx_usage_clinic_date on usage_metrics(clinic_id, metric_date);
create index if not exists idx_usage_metric_type on usage_metrics(metric_type);
create index if not exists idx_usage_clinic_month on usage_metrics(clinic_id, date_trunc('month', metric_date));
```

### 6. Tabla `purchases`

Registro de todas las compras: add-ons, packs de minutos, etc. Permite auditoría, facturación y descuentos en checkout.

```sql
create table purchases (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  purchase_type text not null check (purchase_type in ('addon', 'minute_pack', 'plan_upgrade', 'plan_downgrade')),
  item_id text not null, -- ID del addon, pack, o plan
  item_name text not null, -- Nombre legible
  quantity integer not null default 1,
  unit_price_eur numeric(10,2) not null, -- Precio unitario en el momento de compra
  total_price_eur numeric(10,2) not null, -- quantity × unit_price
  
  -- DESCUENTOS EN CHECKOUT (para promociones futuras)
  coupon_code text, -- Código de descuento si aplica (ej: 'WELCOME10', 'PARTNER20')
  discount_eur numeric(10,2) default 0, -- Cantidad en € descontada
  discount_percent integer default 0, -- Porcentaje de descuento (10, 20, etc)
  final_price_eur numeric(10,2) not null, -- total_price - discount (siempre >= 0)
  
  -- TRACKING
  payment_method text, -- 'stripe', 'bank_transfer', 'manual', etc.
  payment_status text default 'pending' check (payment_status in ('pending', 'completed', 'failed', 'refunded')),
  stripe_invoice_id text,
  stripe_charge_id text,
  
  -- AUDITORÍA
  purchased_at timestamptz not null default now(),
  expires_at date, -- Para add-ons anuales o packs con fecha de expiración
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices
create index if not exists idx_purchases_clinic on purchases(clinic_id);
create index if not exists idx_purchases_date on purchases(purchased_at);
create index if not exists idx_purchases_type on purchases(purchase_type);
create index if not exists idx_purchases_coupon on purchases(coupon_code) where coupon_code is not null;
create index if not exists idx_purchases_status on purchases(payment_status);

-- Trigger para updated_at
create trigger trg_purchases_updated before update on purchases
  for each row execute function set_updated_at();
```

---

## Cambios a funciones SQL existentes

### Función `available_slots()` (ya existe)

**Actualizar para validar minutos, no llamadas**:
- Devuelve solo slots disponibles si `clinic.usage_this_month->>'minutes_used'::int + clinic.usage_this_month->>'extra_minutes_used'::int < (plan.max_minutes_per_month + clinic.usage_this_month->>'extra_minutes_purchased'::int)`

### Nueva función: `check_clinic_capability()`

```sql
create or replace function check_clinic_capability(
  p_clinic_id uuid,
  p_capability text
) returns boolean as $$
declare
  v_plan_id text;
  v_active_addons text[];
begin
  select plan, active_addons into v_plan_id, v_active_addons
  from clinics where id = p_clinic_id;
  
  if v_plan_id is null then
    return false;
  end if;
  
  case p_capability
    when 'whatsapp' then
      return 'whatsapp' = any(v_active_addons);
    when 'api_integration' then
      return 'api_integration' = any(v_active_addons);
    when 'language_en' then
      return 'language_en' = any(v_active_addons);
    when 'language_es' then
      return 'language_es' = any(v_active_addons);
    when 'custom_voice' then
      return 'custom_voice' = any(v_active_addons);
    else
      return false;
  end case;
end;
$$ language plpgsql security definer;
```

---

## Relaciones y restricciones

```
plans (1) ←→ (N) clinics [fk: plan_id]
addons (N) ←→ (N) clinics [junction: active_addons array]
minute_packs (1) ←→ (N) purchases
clinics (1) ←→ (N) usage_metrics
clinics (1) ←→ (N) purchases
```

---

## Orden de ejecución

Las migrations deben correr en este orden:

1. **0009_plans_addons_minute_packs.sql**: Crear tablas `plans`, `addons`, `minute_packs`, insertar datos
2. **0010_extend_clinics.sql**: Agregar columnas a `clinics`, crear índices
3. **0011_usage_metrics_purchases.sql**: Crear tablas `usage_metrics`, `purchases`, función `check_clinic_capability()`

---

## Notas importantes

- **Precios**: Todos en EUR, sin IVA
- **Minutos vs Llamadas**: Los límites de plans son en MINUTOS (1 llamada ≈ 2-3 minutos según duración)
- **Stripe**: Los `stripe_price_id` se rellenan después de crear productos en Stripe
- **Descuentos en checkout**: La tabla `purchases` tiene campos `coupon_code`, `discount_eur`, `discount_percent`, `final_price_eur`. Esto permite:
  - Aplicar descuentos al día de lanzar checkout online
  - Registrar promociones (ej: "WELCOME10" = 10% descuento primer mes)
  - Auditoría completa de todas las transacciones
- **Multilenguaje**: Addons `language_en` y `language_es` listos para activar cuando se publique
- **WhatsApp**: Es un addon de 49€/mes (no incluido por defecto en ningún plan)
- **Call_limit**: Campo anterior en `clinics` se mantiene por backward compatibility, pero ya no se usa (ahora es `plans.max_minutes_per_month`)