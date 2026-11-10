# Spine Route (Android)

Spine Route is a walking, scanning, and book trading Android application designed for Denver's Little Free Libraries network. It helps book scouts, traders, and community stewards walk an optimized loop of book boxes, scan shelf volumes on-device, and sort candidates into prepaid-label buyback shipments.

Rewritten from the original React web app to a native Android application using Kotlin and Jetpack Compose with Material Design 3.

## Features

- **Route Loop Planner**:
  - 71 mapped Little Free Library book boxes and 6 mutual-aid pins across the City and County of Denver.
  - Section filtering: Central & Historic, Northwest & West, South & Southeast, East & Northeast, Southwest, and Denver Metro.
  - Interactive schematic route radar map connecting planned waypoint sequences.
  - Greedy loop planner solving for distance vs expected profit yield ($0.25/mile cost penalty).
  - One-tap walking directions integration via Google Maps.

- **Shelf & Spine Scanner**:
  - Quick-look ISBN analyzer with condition gate (Good 100%, Fair 70%, Poor 35%).
  - Real-time quote evaluation against 5 major buyback desks (BooksRun, World of Books, TopDollar4Books, Valore, TextbookRush).
  - Transparent "TAKE" vs "LEAVE" decision engine that only approves books clearing the 99¢ unit acquisition cost plus packing friction.
  - Replacements-in-bag tracker to ensure ethical box replenishment.
  - Built-in high demand academic and trade catalog with direct comparator links to BookScouter.

- **The Desk & Bin Packer**:
  - Bin packing algorithm grouping scanned volumes into shipments that clear each buyer's prepaid shipping label threshold ($7.50 for BooksRun, $9 for World of Books, $10 for Valore, $12 for TextbookRush).
  - Financial breakdown: Gross staged value, unit acquisition cost ($0.99/book), packaging friction, and net cash profit.
  - Threshold completion hints and progress bars.
  - Ship bin action to finalize orders and feed the reinforcement learning engine.

- **Replace Community Stock**:
  - Directory of Denver community stock resources (BookGive Denver, Official Charter Map, Denver Craigslist book sales, Little Free Pantry Map, Denver Community Fridges) to restock boxes responsibly.

- **On-Device Q-Learning Trading Agent**:
  - Reinforcement learning policy over 3 core actions: SKIP, STAGE, and SHIP.
  - Interactive on-device simulation trainer (600 and 3,000 episode batches).
  - Policy situation inspection table.
  - Desk rate calibration tracker comparing modelled priors with real observed payouts.
  - Verified cash payouts ledger.

## Architecture

- **Language:** Kotlin 2.1
- **UI Framework:** Jetpack Compose (Material 3)
- **Design System:** Custom dark botanical theme matching the Denver green/gold palette
- **Architecture Pattern:** MVVM (Model-View-ViewModel) with Kotlin Coroutines & StateFlow
- **Target SDK:** Android 35 / Min SDK 26
