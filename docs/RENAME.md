# Renaming the app

The name is chosen in one place for the screens people see, and in a few more for everything else.

1. `apps/web/src/v3/brand.ts`: `BRAND`, `TAGLINE`, `PITCH`. Welcome, Home, the splash, the browser title, the under-18 and age screens, the colours picker and the consent line use it.
2. `apps/web/index.html` and `apps/web/public/manifest.webmanifest`: title, short name, description, theme colour (used when someone adds the app to their phone).
3. `apps/api/src`: lock-screen notification titles (`packages/domain/src/notifications.ts`, `buildContent`), the companion prompts in the admin prompt registry, and the default companion name if you want it to change too.
4. Store listings: the app name and a few words after it, for example "Name: AI Companion to Talk, Calm & Grow".
5. Older designs (v1 and v2) still say Flint in their own screens; they are not the design people get when `ui.v3` is on.

Before choosing, reserve the name: create the app in App Store Connect and in the Play Console, search IP India's trademark register (classes 9, 41, 42, 44), and check the web address and the Instagram handle.
