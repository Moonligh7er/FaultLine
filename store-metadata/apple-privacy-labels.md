# Apple Privacy Labels — FixThisFaster
# Fill these out in App Store Connect → App Privacy

## Data Linked to You

### Location
- **Precise Location**: YES
  - Purpose: App Functionality (pinpointing infrastructure issues)
  - Linked to identity: Only if user has an account (not for anonymous reports)

### Contact Info
- **Email Address**: YES
  - Purpose: App Functionality (account creation, magic link auth)
  - Linked to identity: YES

### User Content
- **Photos or Videos**: YES
  - Purpose: App Functionality (documenting infrastructure issues)
  - Linked to identity: Only if user has an account
- **Other User Content**: YES (report descriptions)
  - Purpose: App Functionality
  - Linked to identity: Only if user has an account

### Identifiers
- **Device ID**: YES
  - Purpose: Analytics, Advertising (AdMob)
  - Linked to identity: NO

### Usage Data
- **Product Interaction**: YES
  - Purpose: Analytics (crash reporting via Sentry)
  - Linked to identity: NO
- **Crash Data**: YES
  - Purpose: App Functionality (bug fixes)
  - Linked to identity: NO

## Data NOT Collected
- Financial Info
- Health & Fitness
- Browsing History
- Search History
- Contacts
- Sensitive Info
- Diagnostics (beyond crash data)
