MyTurfy — Complete Project & Architecture Walkthrough (PPT Ready)
This document provides a complete technical and commercial walkthrough of MyTurfy.com, structured slide-by-slide so you can easily use it to create your project presentation (PPT).





📊 Executive Summary & Slide-by-Slide PPT Outline

  ┌────────────────────────────────────────────────────────────────────────┐
  │                           MYTURFY PLATFORM                             │
  │     India's Premier Sports Turf Booking & Split Payment Ecosystem       │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      │
         ┌────────────────────────────┼───────────────────────────┐
         ▼                            ▼                           ▼
 🔒 PAYMENT SECURITY          🤝 TIERED REFUNDS           💰 ESCROW PAYOUTS
 5-Min Hold Lock             ≥24h: 100% | 12-24h: 75%     Hourly Auto-Scheduler
 HMAC Verified Only          6-12h: 50% | 2-6h: 25%       50% Owner Compensation
 Zero Unpaid Bookings        <2h: 0%                      Missing Bank Details Alert



Slide 1: Executive Overview & Problem Solved
Problems Solved:
Double Booking & Payment Bugs: Fixed server crash ("Something went wrong on server") caused by Razorpay 40-character receipt ID limits (venue_${id}_${Date.now()} → shortened to rcp_${id.slice(-12)}_${Date.now()}).
Unpaid Turf Exploits: Prevented users from holding or faking bookings without completing payment. Turf slots are now locked in temporary 'hold' status and ONLY transition to 'upcoming' after 100% HMAC SHA256 signature verification.
Stuck 5-Minute Holds: Automatic client-side dismissal triggers (modal.ondismiss & payment.failed) plus backend auto-expiration instantly release slots if payment fails or is abandoned.
Half-Paid Split Bookings: Unpaid or half-paid split payments auto-expire when the 1-hour window passes, returning money to payers and unlocking court availability.




Slide 2: Strict Payment Security & Lifecycle Architecture
The 4-State Booking Lifecycle:

  [Slot Selected] ──► [status: 'hold'] ──► (Payment Fails/Dismissed) ──► [status: 'cancelled']
                             │
                             ├─► (Razorpay HMAC Verification Success) ──► [status: 'upcoming']
                             │                                                 │
                             │                                                 ▼
                             └─► (Match Slot Passes + No Refund)  ──► [status: 'completed']

Key Architecture Rules:
Escrow-Style Holding: Money is collected into MyTurfy's central Razorpay account upon booking and held until the match is completed.
Owner Portal Protection: Unconfirmed holds (status: 'hold') are strictly excluded from the Partner Portal (GET /api/bookings/owner) and live QR entry tickets until payment is verified.



Slide 3: Tiered Refund Policy & Admin Approval Engine
Time-Based Refund Tiers (Perishable Inventory Model):
Time Before Match Slot	Customer Refund %	Platform Retained %	Owner Compensation (50% of Retained)

≥ 24 Hours	            100% 0%	 ₹0 (Slot released for re-booking)
12 – 24 Hours	        75%	25%	 12.5% of total booking amount
6 – 12 Hours	        50%	50%	 25.0% of total booking amount
2 – 6 Hours	            25%	75%	 37.5% of total booking amount
< 2 Hours / Past Slot	0%	100% 50.0% of total booking amount

Refund Workflow:
Customer clicks Cancel & Request Refund in My Bookings.
Backend calculates the exact tier percentage based on hours remaining until match start (calculateRefundTier).
Request is sent to MyTurfy Admin (myturfy@gmail.com) for review.
Upon approval, Razorpay automatically dispatches funds back to the customer's UPI/Card within 5–7 business days.





Slide 4: 50% Owner Cancellation Compensation Model
Commercial Compensation Logic:
Turf slots represent perishable time-based inventory. Short-notice cancellations prevent owners from re-selling the slot.
To protect venue partners, 50% of all non-refunded retained money is automatically credited to the venue owner as fair slot compensation.

Example: For a ₹1,000 booking cancelled 8 hours prior:
Customer gets 50% refund (₹500).
Retained non-refunded amount = ₹500.
Owner receives 50% compensation: ₹250.
MyTurfy platform share: ₹250.





Slide 5: Escrow Payout Engine & Missing Bank Details System
Automated Payout Flow (payoutScheduler.js):
Hourly Background Job: Scans all completed match slots every hour.
Payout Eligibility: If slot time has passed and no active refund request exists, booking is marked payoutEligible = true.
Net Commission Calculation: 10% platform commission is retained; 90% net earnings (or cancellation compensation) are queued for payout.
Missing Bank Details Guardrail:
If an owner has not entered their Bank Account Number/IFSC or UPI ID, payouts remain safely accumulated under their Partner Account balance.
A prominent warning banner appears on the Partner Dashboard (owner-portal.html):
"⚠️ Bank / UPI Payout Details Missing: Your booking payouts & cancellation compensations remain securely held in escrow until payout details are added."







Slide 6: Multi-Payer Split Payment System
Commercial Teammate Split Architecture:
Booker selects target players (e.g., 4 players for ₹1,000 = ₹250/person).
A unique link with share code (SPLIT-XXXX) is generated valid for 1 hour.
Real-Time Progress: "My Bookings" displays amber badges showing live collected amounts: ⏳ Split Pending (₹500 / ₹1,000).
Auto-Expiration: If the 1-hour window passes before 100% is paid, status transitions to splitStatus: 'expired', status: 'cancelled', freeing the court slot and refunding paid shares.
Slide 7: Technical Stack & API Endpoint Mapping
Core Tech Stack:
Frontend: HTML5, Vanilla CSS3 (Custom design system, glassmorphism, mobile-first responsive), Vanilla JavaScript (ES6 Modules, Fetch API).
Backend: Node.js, Express.js REST API, Mongoose ORM, MongoDB Atlas.
Integrations: Razorpay Node SDK (Payments & Refunds), Nodemailer (Email Alerts), Crypto (HMAC Verification & QR Hashes).
Key API Endpoints:

  POST /api/bookings/hold-slot       ──► Initiates 5-minute hold lock (status: 'hold')
  POST /api/payments/verify          ──► Verifies Razorpay HMAC signature & confirms booking (status: 'upcoming')
  POST /api/payments/create-split-order ──► Spawns 1-hour multi-payer split link
  POST /api/payments/pay-split-share ──► Processes individual teammate share
  POST /api/bookings/:id/request-refund ──► Calculates tier & submits refund to Admin
  POST /api/bookings/:id/approve-refund ──► Admin approves refund & calculates owner 50% compensation
  GET  /api/bookings/owner           ──► Partner dashboard route (excludes unpaid holds)
🛠️ Verification Checklist (All Systems Go)
 Razorpay Receipt Limit: Verified all receipt strings are ≤ 30 characters.
 Zero Unpaid Bookings: Verified no booking reaches status: 'upcoming' without HMAC signature verification.
 5-Minute Hold Cleanup: Verified client dismissal & payment failure events clear holds immediately.
 Split Payment Expiry: Verified automatic status updates to 'expired'/'cancelled'.
 Tiered Refunds: Verified calculation engine (≥24h: 100%, 12-24h: 75%, 6-12h: 50%, 2-6h: 25%, <2h: 0%).
 50% Owner Compensation: Verified ownerCompensation formula on unrefunded amounts.
 Missing Bank Alert: Verified warning banner rendering in owner-portal.html.
 Legal Documentation: Updated refund-policy.html and terms.html.