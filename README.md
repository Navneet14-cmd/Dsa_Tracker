# DSA Tracker — Spaced Repetition LeetCode Planner

A React Native mobile application built on Expo, backed by an Express + Prisma backend, that optimizes DSA learning through spaced repetition scheduling and AI-driven performance recommendations.

---

## Tech Stack & Architecture

*   **Mobile Frontend**: React Native, Expo, TypeScript, Zustand, SecureStore, Axios.
*   **Backend Server**: Node.js, Express, Prisma ORM, PostgreSQL (or SQLite/other adapters).
*   **AI Integration**: Anthropic Claude API (with fallback development mocking).

---

## Getting Started (Quick Setup)

A fresh repository clone can be configured and run by following these steps:

### 1. Configure Environment Variables

Create environment configuration files for both the backend and mobile clients:

#### Backend Config (`/.env`)
Copy the backend template from the root folder:
```bash
cp .env.example .env
```
Update `.env` with your database URL, JWT secret, and Anthropic API key:
*   `DATABASE_URL`: Your PostgreSQL connection string.
*   `JWT_SECRET`: A secure signing string for login tokens.
*   `PORT`: Port for the Express server (defaults to `3000`).
*   `ANTHROPIC_API_KEY`: If blank or unconfigured in development, the server automatically runs in **Mock Development Mode** with predefined AI outputs to bypass API charges.

#### Mobile Config (`/mobile/.env`)
Copy the mobile template from the mobile folder:
```bash
cp mobile/.env.example mobile/.env
```
*   `EXPO_PUBLIC_API_URL`: Set this if testing on a physical mobile device (point to your computer's local Wi-Fi IP, e.g. `http://192.168.1.45:3000`). If testing on simulators, you can leave it blank (defaults automatically to `localhost` on iOS and `10.0.2.2` on Android).

---

### 2. Database Migration & Seeding

Install backend dependencies, execute database schemas, and seed standard topics (e.g. Arrays, Trees, DP) and patterns (e.g. Sliders, Two-Pointers):

```bash
# Install backend packages
npm install

# Run database migrations
npx prisma migrate dev --name init

# Seed topics and patterns
npx prisma db seed
```

---

### 3. Start the Backend Server

Launch the Express development server (runs with hot-reloading on port 3000):

```bash
npm run dev
```

---

### 4. Start the Expo Mobile Client

In a separate terminal window, set up and launch the mobile development server:

```bash
# Navigate to mobile directory
cd mobile

# Install mobile dependencies
npm install

# Run the Expo dev server
npx expo start
```

Once the terminal prints the QR code, you can:
*   Press **`i`** to open in the iOS Simulator.
*   Press **`a`** to open in the Android Emulator.
*   Scan the QR code using the **Expo Go** app on your physical phone (both devices must be on the same Wi-Fi network).

---

## Verifying Features

*   **Authentication**: Create an account via **Register** or sign in. The taxonomy (topics/patterns) is pre-fetched on login and cached in state.
*   **Problem Logging**: Log a LeetCode problem. The submit button is protected by double-submit locks, and saving a new problem triggers an AI recommendation overlay.
*   **Progress Dashboard**: Navigate to **Progress** to view topic mastery ratios and difficulty summaries. Tap any ratio or button to set/edit target goals inline.
*   **Patterns Coverage**: Check the **Patterns** tab to see technique coverage grouped alphabetically, utilizing the benchmark of 5 solved problems for mastery.
*   **Spaced Repetition**: Clear pending reviews under **Revision** (marking a revision complete schedules the next interval: 1d → 3d → 7d → 14d → 30d).
*   **AI Planner**: Access the **AI** tab to perform weakness analysis or generate a custom study plan based on hours available today.
