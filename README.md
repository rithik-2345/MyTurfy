# 🏟️ MyTurfy — Commercial Sports Venue Booking Platform

> India's fastest-growing sports venue booking platform. Book turfs, courts, and arenas in seconds — BookMyShow quality, built for sports.

---

## ✨ Features Overview

### Core Booking System
- **Real-time slot availability** — hour-by-hour grids updated live from the database
- **5-minute slot hold** (BookMyShow-style) — slot locked with countdown timer on payment screen
- **Multi-court support** — visual court/pitch selector with sport-specific SVG diagrams
- **Razorpay payment integration** — secure, PCI-compliant payment processing

### Commercial-Grade Features (v2)
| Feature | Description |
|---|---|
| ⏱️ **Updated Slot Hold Timers** | 3-min countdown for solo bookings, 10-min countdown for team split bookings |
| 👥 **Flexible Custom Split Bill** | Teammates can pay equal designated share, custom amount, or full remaining balance |
| 📱 **Flexible Gmail / Mobile Auth** | Sign up and sign in using Gmail (@gmail.com), 10-digit Mobile number, or both |
| 📩 **Email OTP Verification** | Automatic OTP delivery via Gmail (with Spam notice) |
| 🔄 **Smart Auto-Redirect** | If Gmail or Mobile is not found on login, automatically switches to Registration |
| 🚫 **Past Date & Closing Time Blocking** | Past dates strictly blocked; bookings at 9 PM capped at 1 hour (venue closes at 10 PM) |
| 🛡️ **Bot & Anti-Abuse Protection** | 10 consecutive cancellations block account for 24 hours; `express-rate-limit` active |
| 🏟️ **Visual Court Map** | BookMyShow-style pitch diagrams (Football, Cricket, Basketball etc.) |
| 🔍 **Smart Autocomplete** | Swiggy-style search: sport tag suggestions + venue thumbnails + keyboard nav |
| 🎫 **Live Match Ticket** | Real-time countdown on My Bookings + QR code entry pass |

### Tiered Cancellation & Refund Policy
- **Cancellation Eligibility**: Allowed for all upcoming match slots before match start time.
- **Refund Schedule (based on hours since booking creation)**:
  - Cancel within **2 hours** of booking: **95% Cash Refund** (5% retained cancellation fee)
  - Cancel within **12 hours** of booking: **75% Cash Refund** (25% retained cancellation fee, 10% owner compensation)
  - Cancel between **12 to 24 hours** of booking: **50% Cash Refund** (50% retained cancellation fee, 20% owner compensation)
  - Cancel **after 24 hours** of booking or **after match slot start/passed**: **0% Refund / Not allowed**
- **Merchant Compensation**: Retained cancellation fees compensate venue owners for slot holding.
- **Bot Anti-Abuse Lock**: Accounts making 10 consecutive cancellations are automatically blocked from cancelling for 24 hours.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla HTML5, CSS3, JavaScript (ES2022) |
| **Backend** | Node.js · Express.js |
| **Database** | MongoDB (Mongoose ODM) |
| **Payments** | Razorpay (Orders API + Webhooks) |
| **Auth** | JWT (Access Tokens) · Google OAuth (GSI) · Gmail OTP |
| **Email** | Nodemailer (SMTP / Gmail) |
| **Security** | Express Rate Limit (`express-rate-limit`) · Account Auto-Lock |
| **Storage** | Cloudinary (venue images) |
| **Fonts** | Google Fonts — Bebas Neue · Barlow · Barlow Condensed |

---

## 📁 Environment Variables Setup

Create `server/.env`:

```env
# Server
PORT=5000
NODE_ENV=development

# MongoDB
MONGO_URI=mongodb://localhost:27017/myturfy

# JWT
JWT_SECRET=your_super_secret_jwt_key_here

# Razorpay
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_razorpay_secret

# Email (Gmail SMTP)
EMAIL_USER=myturfy@gmail.com
EMAIL_PASS=your_gmail_app_password
```

---

## 📁 Project Structure

```
2 RitSTartUP/
├── client/                   # Frontend (static HTML/CSS/JS)
│   ├── index.html            # Homepage
│   ├── venues.html           # Venue listing with smart search
│   ├── venue-detail.html     # Venue detail + booking + slot hold
│   ├── my-bookings.html      # Booking history + Live Match Card
│   ├── owner-portal.html     # Owner dashboard
│   ├── css/
│   │   ├── styles.css        # Global design system
│   │   ├── venue-detail.css  # Hold timer, Split Bill, Court cards
│   │   ├── venues.css        # Autocomplete dropdown
│   │   └── my-bookings.css   # Live Card, QR modal
│   └── js/
│       ├── api.js            # All API calls (centralised)
│       ├── auth.js           # Auth, Google SSO, JWT management
│       ├── venue-detail.js   # Booking flow, court picker, split bill
│       ├── venues.js         # Search, autocomplete, map view
│       └── my-bookings.js    # Bookings list, live ticket, refund
│
└── server/                   # Backend
    ├── index.js              # Express server entry
    ├── models/
    │   ├── Booking.js        # holdExpiresAt, splitCode, qrCodeData, courtNumber
    │   ├── Venue.js          # specs.turfs, openHour, closeHour, closedDates
    │   └── User.js           # Customer / Owner roles
    ├── routes/
    │   ├── bookings.js       # Hold slot, payment verify, refund, live ticket
    │   ├── venues.js         # Venue CRUD + search
    │   ├── payments.js       # Razorpay order creation
    │   └── reviews.js        # Reviews CRUD
    └── utils/
        └── sendEmail.js      # Nodemailer email templates
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Razorpay account (test keys for dev)

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd "2 RitSTartUP/server"
npm install
```

### 2. Configure Environment

Create `server/.env`:

```env
# Server
PORT=5000
NODE_ENV=development

# MongoDB
MONGO_URI=mongodb://localhost:27017/myturfy
# OR Atlas: mongodb+srv://<user>:<pass>@cluster.mongodb.net/myturfy

# JWT
JWT_SECRET=your_super_secret_jwt_key_here

# Razorpay
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_razorpay_secret

# Email (Gmail SMTP)
EMAIL_USER=myturfy@gmail.com
EMAIL_PASS=your_gmail_app_password

# Cloudinary (optional - for image uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
```

Create `client/js/config.js`:

```js
const RAZORPAY_KEY = 'rzp_test_xxxxxxxxxxxxxxxx';
const API_BASE = 'http://localhost:5000/api';
```

### 3. Run

```bash
# Start backend
cd server
npm run dev          # uses nodemon

# Serve frontend (separate terminal)
cd client
npx serve .          # or open index.html directly in browser
```

---

## 🔌 Key API Endpoints

### Bookings
| Method | Route | Description |
|---|---|---|
| `POST` | `/api/bookings/hold-slot` | Hold slot for 5 mins (BookMyShow-style) |
| `POST` | `/api/bookings/verify-payment` | Confirm after Razorpay success |
| `GET`  | `/api/bookings/mine` | Get all bookings for current user |
| `GET`  | `/api/bookings/live-ticket` | Upcoming booking (for Live Card) |
| `POST` | `/api/bookings/:id/request-refund` | Cancel + request refund |
| `GET`  | `/api/bookings/booked-slots` | Availability check (court-aware) |

### Venues
| Method | Route | Description |
|---|---|---|
| `GET`  | `/api/venues` | List / search venues (`?sport=&q=`) |
| `GET`  | `/api/venues/:id` | Get single venue detail |
| `POST` | `/api/venues` | Create venue (owner only) |
| `PUT`  | `/api/venues/:id` | Update venue |

### Auth
| Method | Route | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register new customer |
| `POST` | `/api/auth/login` | Email/password login → JWT |
| `POST` | `/api/auth/google` | Google OAuth login |
| `GET`  | `/api/auth/me` | Get current user profile |

---

## 🎨 Design System

All CSS variables in `styles.css`:

```css
--green:      #00c853;    /* Primary brand green */
--dark:       #04140a;    /* Darkest background */
--dark2:      #0a1a0f;    /* Navbar/toolbar */
--dark3:      #111a14;    /* Card backgrounds */
--card-bg:    #0f1c13;    /* Modal/card surface */
--text:       #e8f5ec;    /* Primary text */
--muted:      #7a9d84;    /* Secondary text */
--border:     rgba(255,255,255,0.08);
--red:        #ef5350;    /* Error/cancel */
--green-glow: rgba(0,200,83,0.25);
```

---

## 📦 Deployment

### Backend (Render / Railway)
1. Push `server/` to a GitHub repo
2. Create a new Web Service on [render.com](https://render.com)
3. Set root to `server`, build command: `npm install`, start: `npm start`
4. Add all `.env` variables in the Render dashboard

### Frontend (Vercel / Netlify)
1. Push `client/` to GitHub
2. Import into [vercel.com](https://vercel.com) — no build step needed
3. Update `config.js` to point to your Render backend URL

---

## 📋 Refund Policy (Automated)

| Time before slot | Refund |
|---|---|
| ≥ 24 hours | **100%** |
| 12 – 24 hours | **75%** |
| 1 – 12 hours | **25%** |
| < 1 hour | **5%** |
| After slot | **0%** (no refund) |

All refund decisions are made by the **MyTurfy Admin** only. Owners cannot approve or reject refunds.

---

## 🔐 Security

- All booking/payment routes protected by JWT middleware
- Razorpay webhook signature verified before processing payments
- Email/password passwords hashed with `bcryptjs`
- CORS restricted to allowed frontend origins

---

## 📞 Support

- **Email**: myturfy@gmail.com
- **Support page**: `/support.html`

---

© 2026 MyTurfy.com — All rights reserved.#   M y T u r f y - W e b s i t e 
 
 #   M y T u r f y - W e b s i t e 
 
 #   M y T u r f y - W e b s i t e 
 
 #   M y T u r f y - W e b s i t e 
 
 