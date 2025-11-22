# VerifyForge AI - Multi-Tenant Testing Platform

**Version 2.0 - Production Ready**  
**Generated: November 22, 2025**

The complete testing platform for web apps, APIs, documents, games, mobile apps, AI/bots, 3D avatars, and software tools.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Supabase account
- Stripe account (for billing)
- Vercel account (for deployment)

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your credentials

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

---

## 🎯 Features

### Multi-Tenant Architecture
- ✅ Complete organization isolation
- ✅ Row-level security (RLS)
- ✅ Usage tracking and limits
- ✅ Automatic billing cycle management

### 8 Testing Engines (400+ Checks)
1. **Web Testing** - 100+ checks (SEO, accessibility, performance, security)
2. **API Testing** - 40+ checks (endpoints, auth, rate limiting)
3. **Document Testing** - 42 checks + OCR (PDF, DOCX, XLSX, PPTX)
4. **AI/Bot Testing** - 32 checks (hallucination, bias, toxicity)
5. **Game Testing** - 42 checks (FPS, memory, compatibility)
6. **Mobile Testing** - 50 checks (iOS/Android performance, UX)
7. **Avatar Testing** - 42 checks (3D models, textures, rigging)
8. **Tool Testing** - 52 checks (functionality, security, usability)

### Pricing Tiers
- **Free**: 10 tests/month, basic features
- **Pro**: $49/month, 100 tests, white-label, Javari Auto-Fix
- **Enterprise**: Custom pricing, unlimited everything

### Advanced Features
- ✅ Javari Auto-Fix (90%+ confidence automatic fixes)
- ✅ Economy Mode (40-60% cost savings)
- ✅ White-label reports with custom branding
- ✅ Team management with role-based access
- ✅ API access for developers
- ✅ Scheduled automated testing
- ✅ 8 export formats (PDF, Excel, Word, etc.)

---

## 📁 Project Structure

```
verifyforge-multitenant/
├── app/
│   ├── api/
│   │   └── tests/
│   │       └── route.ts          # Multi-tenant test API
│   └── ...
├── components/
│   └── OrganizationDashboard.tsx # Main dashboard UI
├── lib/
│   ├── organization-middleware.ts # Multi-tenant middleware
│   ├── pricing-config.ts          # Pricing tiers
│   └── white-label-reports.ts     # Report generator
├── database/
│   └── schema-multitenant.sql     # Database schema
└── package.json
```

---

## 🗄️ Database Setup

### Step 1: Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Copy your project URL and API keys

### Step 2: Run Migrations
```bash
# Connect to Supabase
psql $SUPABASE_CONNECTION_STRING

# Run schema
\i database/schema-multitenant.sql
```

### Step 3: Enable RLS
All tables have Row-Level Security policies that ensure complete data isolation between organizations.

---

## 💳 Stripe Setup

### Step 1: Create Products
1. Go to Stripe Dashboard → Products
2. Create two products:
   - **VerifyForge Pro** - $49/month
   - **VerifyForge Pro Annual** - $470/year

### Step 2: Get Price IDs
Copy the price IDs and add to `.env.local`:
```env
NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=price_xxxxx
NEXT_PUBLIC_STRIPE_PRO_YEARLY_PRICE_ID=price_xxxxx
```

### Step 3: Configure Webhooks
Webhook URL: `https://your-domain.com/api/webhooks/stripe`

Events to listen for:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

---

## 🚀 Deployment to Vercel

### Option 1: Vercel CLI
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### Option 2: GitHub Integration
1. Connect repository to Vercel
2. Push to main branch
3. Auto-deploys on every commit

### Environment Variables in Vercel
Add all variables from `.env.example` to Vercel project settings.

---

## 🧪 Testing

### Run Tests Locally
```bash
# Unit tests
npm test

# Type checking
npm run type-check

# Linting
npm run lint
```

### Test as Different Tiers
1. **Free User**: Sign up → Run 10 tests → Hit limit
2. **Pro User**: Upgrade → 100 tests, white-label, auto-fix
3. **Enterprise**: Contact sales → Unlimited everything

---

## 📊 API Documentation

### Authentication
All API requests require authentication via Supabase Auth:
```bash
Authorization: Bearer YOUR_SUPABASE_JWT_TOKEN
```

### Key Endpoints

#### Submit Test
```bash
POST /api/tests
Headers: 
  Authorization: Bearer TOKEN
  X-Organization: your-org-slug

Body:
{
  "target_url": "https://example.com",
  "target_type": "web",
  "test_engines": ["web", "api"],
  "economy_mode": true
}
```

#### Get Test Results
```bash
GET /api/tests/:id
Headers:
  Authorization: Bearer TOKEN
  X-Organization: your-org-slug
```

#### Get Usage Stats
```bash
GET /api/usage
Headers:
  Authorization: Bearer TOKEN
  X-Organization: your-org-slug
```

---

## 🔐 Security

### Row-Level Security (RLS)
- All tables have RLS policies
- Users can only access their organization's data
- Enforced at database level

### API Key Management
- Keys are hashed (never stored in plaintext)
- Rate limiting per minute and per day
- Can be revoked instantly

### Audit Logs
- All actions are logged
- Includes user, timestamp, and details
- Retained based on subscription tier

---

## 📈 Monitoring

### Usage Tracking
- Real-time usage monitoring
- Automatic limit warnings at 80%
- Usage resets monthly

### Performance Monitoring
- Test execution times tracked
- Database query performance
- API response times

---

## 🆘 Support

### Documentation
- Full API docs: `/docs/api`
- User guides: `/docs/guides`
- Video tutorials: `/docs/videos`

### Support Channels
- **Free**: Community Discord
- **Pro**: Priority email (24hr response)
- **Enterprise**: Dedicated manager (4hr response)

---

## 📝 License

Proprietary - CR AudioViz AI, LLC  
All rights reserved.

---

## 🙏 Credits

Built with:
- Next.js 14
- Supabase (PostgreSQL + Auth)
- Stripe (Billing)
- Tailwind CSS
- OpenAI (Javari Auto-Fix)

---

**For questions or support:**  
Email: support@craudiovizai.com  
Website: https://verifyforge.craudiovizai.com

**Your Story. Our Design.**  
© 2025 CR AudioViz AI, LLC
