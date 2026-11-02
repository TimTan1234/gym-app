# GymPal Health (Android)

A small companion app that reads daily **steps** and **sleep** from Health Connect and sends the
day totals to GymPal (`POST /api/device/sync`). It has no other features: GymPal itself stays a web app.

## Build

Needs JDK 21 and the Android SDK (platform 36). Then, from the repo root:

```bash
npm run android:apk   # tests, builds, and copies the APK to public/downloads/gympal-health.apk
```

Settings → Phone health data offers that file for download once it exists.

## Link a phone

1. Install the APK (Android 9 or newer, with Health Connect; it's built into Android 14+).
2. In GymPal: Settings → Phone health data → **Link an Android phone**.
3. In the app, enter the server address (must be `https://`) and the code. Codes work once, for 10 minutes.
4. Allow reading steps and sleep. Where Health Connect supports background reads, it syncs about
   every 3 hours; otherwise it syncs each time the app is opened.

Unlinking in GymPal stops the phone's token at once.

## How the days are counted

- Steps: Health Connect's daily aggregate, so a phone and a watch aren't counted twice.
- Sleep: total sleep-session time from noon to noon, counted on the day you woke up.
- The last 7 days are sent each time; GymPal keeps the latest total for each day.
