# SportEvolve — Project rules

## Expo update policy — hard rule

SportEvolve is **OTA-first**.

Before triggering any EAS Build, first determine whether the change can ship with EAS Update / OTA.

### Use EAS Update / OTA for
- UI and layout fixes
- text/content changes
- JavaScript/TypeScript logic
- navigation changes
- Supabase queries and client-side data logic
- calculations and business rules
- screens/components/styles

These changes must **not** consume an EAS Build when the native runtime is unchanged.

### Use EAS Build only when native runtime changes
Examples:
- adding/changing a native dependency or Expo config plugin
- native permissions/capabilities
- HealthKit / Health Connect native integration
- bundle/package identifiers or other native app configuration requiring rebuild
- SDK/runtime changes that cannot be delivered OTA

### Mandatory check before any build
1. Ask: "Does this change modify the native runtime?"
2. If **no** → use OTA/EAS Update.
3. If **yes** → use EAS Build.

Do not trigger a new Android/iOS build merely to deliver a small UI/JS fix.

## Supabase
Small app updates do not consume any concept of "Supabase builds". Supabase usage is driven by database/storage/egress/auth usage, not by client UI releases.
