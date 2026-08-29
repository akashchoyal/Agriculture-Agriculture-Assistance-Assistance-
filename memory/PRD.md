# KrishiAI Smart Agriculture Assistant

## Problem statement
Build a mobile smart-agriculture assistant with email/password and Google login, logout, Hindi/English language, light/dark theme, agriculture-first start screen, AI chat, crop scanning, settings, and a farmer profile containing name, age, pincode, country, address, and photo.

## Architecture
- Expo SDK 54 React Native frontend with Expo Router entry, Safe Area Context, Ionicons, Image Picker, secure token storage, and an in-app four-area navigation shell.
- FastAPI backend on `0.0.0.0:8001`, MongoDB via Motor, custom seven-day bearer sessions, bcrypt email/password auth, Emergent-managed Google session exchange, and server-side LLM image/text requests.
- MongoDB collections: `users`, `user_sessions`, `chat_messages`, and the existing `status_checks`; custom `user_id` values and `_id`-free API projections keep responses JSON-safe.

## User personas
- Smallholder farmer who needs practical, localized crop advice in Hindi.
- Bilingual farm operator who checks crop health, weather context, and field reminders.
- Family farm manager who wants a reusable profile and secure account across sessions.

## Core requirements (static)
1. Email/password login, new account, logout, and Emergent-managed Google login.
2. Hindi/English UI preference with persistence.
3. Light/dark appearance preference with persistence.
4. Agriculture-focused dashboard with field health, weather, quick actions, and updates.
5. Authenticated AI chat with bilingual agriculture guidance and persisted messages.
6. Camera/gallery crop scanner accepting base64 JPEG/PNG/WEBP and returning diagnosis, confidence, symptoms, and remedies.
7. Profile fields: name, age, pincode, country, address, and base64 profile photo.
8. Settings for language, theme, notifications, help, and about.

## Implemented
- 2026-08-29: Built complete auth gate, secure session restore, email signup/login/logout, Google OAuth handoff, and agriculture-themed Hindi-first auth screen.
- 2026-08-29: Built dashboard, four navigation areas, bilingual copy, theme system, settings persistence, field status cards, and responsive safe-area layouts.
- 2026-08-29: Added real server-side AI chat and crop image analysis, camera/gallery selection, profile editing/photo upload, MongoDB persistence, indexes, and API validation.
- 2026-08-29: Added stable accessibility/test IDs and completed live mobile-web regression: backend 100%, frontend 100%.

## Prioritized backlog
- P0: Monitor AI response cost/latency and add rate limiting before high-volume use.
- P1: Add real weather and mandi market data integrations; show field-specific history charts.
- P1: Add scan history list with timestamp, crop name, and saved remedies.
- P2: Add push notifications, voice input/output, and offline queueing for low-connectivity farms.
- P2: Add multi-field management and optional agronomist referral workflow.

## Next tasks
- Product review of Hindi terminology and crop-specific prompt templates.
- Validate camera permissions on physical iOS and Android devices.
- Add analytics for scanner completion and AI advice usefulness after user consent.