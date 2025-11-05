# Android Home Screen Widget for 401k Tracker - Implementation Plan

## Overview
Build a native Android widget that displays live portfolio data from the 401k tracker API with graphing capabilities.

## User Requirements
- **Setup:** From scratch (need to install Android Studio)
- **Display:** Total value, gain/loss, update time + **graph if possible**
- **Sizes:** Small (2x2), Medium (4x2), and Large (4x4) widgets
- **Updates:** Every 15 minutes during market hours
- **Auth:** Hardcoded API token (private use only)
- **Interaction:** Tap widget opens full website

## Technical Architecture

**Technology Stack:**
- Language: Kotlin
- Framework: Jetpack Glance (modern declarative widgets) OR AppWidgetProvider (traditional)
- API: REST calls to `https://401k.mreedon.com/api/holdings/snapshots.js`
- Auth: `X-401K-Token` header
- Background: WorkManager for periodic updates
- Graphing: Custom Canvas sparkline OR MPAndroidChart library

**Graph Feasibility:** ✅ YES - Android widgets support:
- Simple sparklines (line charts showing trend)
- Canvas drawing for lightweight custom graphs
- Static chart images updated on refresh
- Recommendation: 7-30 day sparkline showing portfolio value trend

## Implementation Phases

### Phase 1: Environment Setup (1-2 hours)
1. Install Android Studio (download from developer.android.com)
2. Download Android SDK (API 26+ / Android 8.0+)
3. Create new "401k Widget" Android project
4. Configure build.gradle with dependencies
5. Set up Git repository (optional)

### Phase 2: API Integration (2-3 hours)
1. Create Retrofit API service
2. Define data models for portfolio response
3. Implement authentication with hardcoded token
4. Add caching layer (SharedPreferences)
5. Test API calls and error handling

### Phase 3: Widget Layouts (3-4 hours)

**Small Widget (2x2):**
```
┌─────────────┐
│ 401k Tracker│
│             │
│  $45,283.12 │
│  +$1,245.67 │
│   (+2.8%)   │
└─────────────┘
```
- Portfolio value (large text)
- Daily gain/loss with % (colored green/red)
- Minimal padding

**Medium Widget (4x2):**
```
┌────────────────────────────┐
│ 401k Tracker               │
│                            │
│ $45,283.12   ╱╲╱╲  ↗      │
│ +$1,245.67 (+2.8%)         │
│                            │
│ VTI  $15,230  33.6%        │
│ SCHD $12,450  27.5%        │
│ Updated: 2:45 PM           │
└────────────────────────────┘
```
- Portfolio value
- Daily gain/loss with %
- Mini sparkline (7-day trend)
- Top 3 holdings with percentages
- Last updated time

**Large Widget (4x4):**
```
┌────────────────────────────┐
│ 401k Tracker               │
│                            │
│      $45,283.12            │
│      +$1,245.67 (+2.8%)    │
│                            │
│ ┌────────────────────────┐ │
│ │    ╱╲  ╱╲╱╲            │ │
│ │  ╱    ╱                │ │
│ └────────────────────────┘ │
│ 30-day performance         │
│                            │
│ VTI   $15,230   33.6% ▲    │
│ SCHD  $12,450   27.5% ▲    │
│ BND   $8,120    17.9% ▼    │
│ QQQM  $6,340    14.0% ▲    │
│ DES   $3,143     6.9% ▲    │
│                            │
│ 🟢 Market Open             │
│ Updated: 2:45 PM ET        │
└────────────────────────────┘
```
- Portfolio value (prominent)
- Daily/weekly/monthly gain
- Larger sparkline chart (30-day trend)
- Top 5 holdings with percentages and indicators
- Market status indicator
- Last updated time

### Phase 4: Graph Rendering (1-2 hours)
1. Fetch last 30 days from `portfolio_snapshots` via API
2. Create sparkline renderer using Canvas
3. Draw simple line chart with gradient fill
4. Scale to widget size
5. Add axis labels if space permits
6. Cache rendered bitmap

### Phase 5: Background Updates (1-2 hours)
1. Set up WorkManager periodic task
2. Schedule 15-minute updates during market hours (9:30 AM - 4:00 PM ET)
3. Implement manual refresh on tap
4. Handle offline mode (show cached data)
5. Battery optimization (exponential backoff on errors)

### Phase 6: Interaction & Polish (1-2 hours)
1. Add click handler to open `https://401k.mreedon.com`
2. Implement loading states
3. Add error states with retry
4. Theme matching (dark mode support)
5. Build release APK with ProGuard

## Project Structure
```
401k-widget/
├── app/
│   ├── src/main/
│   │   ├── kotlin/com/widget401k/
│   │   │   ├── PortfolioWidget.kt          # Main widget provider
│   │   │   ├── api/
│   │   │   │   ├── ApiService.kt           # Retrofit API interface
│   │   │   │   ├── ApiClient.kt            # HTTP client setup
│   │   │   │   └── Models.kt               # Data classes
│   │   │   ├── worker/
│   │   │   │   └── UpdateWorker.kt         # Background refresh worker
│   │   │   ├── ui/
│   │   │   │   ├── SmallWidgetLayout.kt
│   │   │   │   ├── MediumWidgetLayout.kt
│   │   │   │   └── LargeWidgetLayout.kt
│   │   │   └── util/
│   │   │       ├── CacheManager.kt         # Data persistence
│   │   │       └── SparklineRenderer.kt    # Graph drawing
│   │   ├── res/
│   │   │   ├── layout/                     # Widget XML layouts
│   │   │   ├── values/                     # Colors, strings, dimens
│   │   │   └── xml/widget_info.xml         # Widget metadata
│   │   └── AndroidManifest.xml
│   └── build.gradle
└── settings.gradle
```

## Key Dependencies
```kotlin
dependencies {
    // Core Android
    implementation 'androidx.core:core-ktx:1.12.0'
    implementation 'androidx.appcompat:appcompat:1.6.1'

    // Network
    implementation 'com.squareup.retrofit2:retrofit:2.9.0'
    implementation 'com.squareup.retrofit2:converter-gson:2.9.0'
    implementation 'com.squareup.okhttp3:logging-interceptor:4.11.0'

    // Background work
    implementation 'androidx.work:work-runtime-ktx:2.8.1'

    // Modern widgets (Glance approach - recommended)
    implementation 'androidx.glance:glance-appwidget:1.0.0'

    // Charting (optional - for richer graphs)
    implementation 'com.github.PhilJay:MPAndroidChart:v3.1.0'

    // Coroutines
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'
}
```

## API Integration Details

**Endpoint:** `GET https://401k.mreedon.com/api/holdings/snapshots.js?days=30`

**Headers:**
```http
X-401K-Token: <HARDCODED_TOKEN>
```

**Response Structure:**
```json
{
  "ok": true,
  "totals": {
    "marketValue": 45283.12,
    "costBasis": 40000.00,
    "gainLoss": 5283.12,
    "gainLossPercent": 13.21,
    "lastUpdated": "2024-10-29T14:45:00Z"
  },
  "timeline": [
    { "date": "2024-10-29", "marketValue": 45283.12, "gainLoss": 5283.12 },
    { "date": "2024-10-28", "marketValue": 44850.00, "gainLoss": 4950.00 },
    { "date": "2024-10-27", "marketValue": 44200.00, "gainLoss": 4300.00 }
  ],
  "currentHoldings": [
    {
      "fund": "VTI",
      "accountName": "Voya 401(k)",
      "shares": 62.1234,
      "unitPrice": 245.32,
      "marketValue": 15230.45,
      "costBasis": 14000.00,
      "gainLoss": 1230.45,
      "gainLossPercent": 8.79
    }
  ]
}
```

## Widget Update Strategy

**Schedule:**
- **Market hours (9:30 AM - 4:00 PM ET, Mon-Fri):** Update every 15 minutes
- **After hours:** Update hourly or on manual refresh only
- **Weekends/holidays:** No automatic updates (use cached data)
- **Manual refresh:** Tap refresh icon or pull-to-refresh gesture

**Error Handling:**
- Network failure → Display cached data with "Last updated: X mins ago"
- API error (401) → Show "Authentication failed"
- API error (500) → Show "Server error - tap to retry"
- No cached data → Show "Loading..." or "Tap to load data"
- Timeout → Retry with exponential backoff

**Battery Optimization:**
- Use WorkManager constraints (requires network, not low battery)
- Cancel updates when battery < 15%
- Increase interval when repeated errors occur
- Stop updates after 3 consecutive failures

## Security & Privacy
- API token obfuscated using ProGuard/R8 in release build
- No external analytics or tracking
- All data stored locally on device in encrypted SharedPreferences
- HTTPS-only connections (enforce with network security config)
- No permission requests beyond INTERNET
- No data sharing with third parties
- Widget data cleared on app uninstall

## Android Permissions Required
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

## Testing Plan
- [ ] Small widget displays correctly on home screen
- [ ] Medium widget shows sparkline chart
- [ ] Large widget shows full breakdown with 5 holdings
- [ ] Tap widget opens website in default browser
- [ ] Updates every 15 minutes during market hours
- [ ] Offline mode shows cached data with timestamp
- [ ] Red/green colors match gain/loss direction
- [ ] Graph renders correctly with 7-30 data points
- [ ] Works on Android 8.0+ (API 26+)
- [ ] Battery usage acceptable (<5% per day)
- [ ] No crashes on network errors
- [ ] No memory leaks during background updates
- [ ] Multiple widget instances work independently

## Estimated Timeline
| Phase | Description | Time |
|-------|-------------|------|
| 1 | Setup (Android Studio, SDK) | 1-2 hours |
| 2 | API Integration | 2-3 hours |
| 3 | Widget UI (3 sizes) | 3-4 hours |
| 4 | Graph Feature | 1-2 hours |
| 5 | Background Updates | 1-2 hours |
| 6 | Testing & Polish | 1-2 hours |
| **Total** | | **9-15 hours** |

Estimated: **1-2 weekend coding sessions**

## Deliverables
1. Android Studio project with all source code
2. Release APK file (app-release.apk) for sideloading
3. Debug APK for testing
4. Installation instructions (enable "Unknown sources")
5. Widget configuration guide
6. Source code documentation

## Installation Instructions (for later)

**Sideloading the APK:**
1. Copy `app-release.apk` to phone via USB/cloud
2. Enable "Install unknown apps" for file manager
3. Tap APK file to install
4. Grant internet permission when prompted
5. Long-press home screen → Add widget → Select "401k Tracker"
6. Choose widget size and place on home screen

**Updating the Widget:**
1. Download new APK version
2. Install over existing app (data preserved)
3. Widget automatically uses new version

## Future Enhancements (Optional)
- [ ] Configurable refresh intervals in settings
- [ ] Multiple widget instances with different funds
- [ ] Rich notifications with daily summary at market close
- [ ] Dark/light theme toggle or auto-detect
- [ ] Compare portfolio to S&P 500 benchmark
- [ ] Dividend tracking widget
- [ ] Transaction history widget
- [ ] Fund performance comparison widget
- [ ] Export data to CSV
- [ ] Backup/restore widget settings

## Technical Decisions to Make

**Widget Framework:**
- **Option A: Traditional AppWidgetProvider** (More examples, better documented)
- **Option B: Jetpack Glance** (Modern, declarative, better for compose fans)
- **Recommendation:** Start with traditional, migrate to Glance later if desired

**Graph Library:**
- **Option A: MPAndroidChart** (Full-featured, 15MB+ APK size)
- **Option B: Custom Canvas drawing** (Lightweight, ~100KB, more control)
- **Recommendation:** Custom Canvas for sparklines (simple line graphs)

**Data Storage:**
- **Option A: SharedPreferences** (Simple, sufficient for widget data)
- **Option B: Room Database** (Overkill for this use case)
- **Recommendation:** SharedPreferences with encryption

**Update Strategy:**
- **Option A: AlarmManager** (Battery drain, not recommended)
- **Option B: WorkManager** (Battery-friendly, recommended by Google)
- **Recommendation:** WorkManager with PeriodicWorkRequest

## Resources & Learning Materials

**Official Documentation:**
- [App Widgets Overview](https://developer.android.com/guide/topics/appwidgets/overview)
- [WorkManager Guide](https://developer.android.com/topic/libraries/architecture/workmanager)
- [Retrofit Documentation](https://square.github.io/retrofit/)

**Example Projects:**
- [Android Widget Samples](https://github.com/android/user-interface-samples)
- [Glance Widgets Codelab](https://developer.android.com/codelabs/jetpack-compose-for-app-widgets)

**Stack Overflow Tags:**
- `android-appwidget`
- `android-workmanager`
- `retrofit2`

## Notes
- This is a private widget for personal use only
- No Play Store publication required (sideload only)
- API token will be hardcoded (acceptable for private use)
- Widget will work offline with cached data
- Designed for Android 8.0+ (covers ~95% of devices)
- Estimated APK size: 2-5 MB (depending on graph library choice)

---

**Status:** Planning phase - ready to implement when time allows

**Created:** 2024-10-29

**Last Updated:** 2024-10-29
