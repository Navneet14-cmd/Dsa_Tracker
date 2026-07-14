# DSA Tracker — Frontend Design Brief

This document provides a factual visual audit of the existing React Native mobile application. It documents the structure, components, state variations, typography, spacing, and styling in use to serve as a precise reference for UI design systems (e.g., Stitch).

---

## Login Screen

**Purpose**: Allows existing users to authenticate using their credentials.

**Navigation context**: Initial screen in the `AuthNavigator` stack. Redirects to the Registration screen on link press, and mounts the `AppTabNavigator` dashboard on successful login.

**Layout regions**:
1.  **Header Title**: Main app name display.
2.  **Subtitle**: Sub-heading explaining the screen's focus.
3.  **Form Container**:
    *   *Error Banner*: Displays validation or connection errors at the top of the form.
    *   *Email Input*: Labels and input textbox.
    *   *Password Input*: Labels and hidden input textbox.
    *   *Sign In Button*: Primary action button.
    *   *Register Navigation Link*: Footer navigation trigger.

**Components & data shown**:
*   *Error Banner*: Red container with centered white error text sourced from component validation or `error.response.data.message`.
*   *Inputs*: Normal TextInput for email, secure TextInput for password. Placeholders are slate-400 text.
*   *Sign In Button*: Contains the text label "Sign In" or an ActivityIndicator spinner when saving.
*   *Register Link*: Centered colored link text "Don't have an account? Register".

**States**:
*   *Initial / Empty*: TextInput fields are blank. Sign In button is active. Error banner is hidden.
*   *Populated*: Input fields show text.
*   *Loading (Submitting)*: Both inputs are disabled (`editable={false}` and `opacity: 0.6` style). Sign In button is disabled (`opacity: 0.6`) and renders an ActivityIndicator spinner instead of the text label.
*   *Error*: A red banner (`#ef4444` background) is displayed above inputs showing the validation error (e.g. "Please fill in all fields.") or API error.

**Interactive elements**:
*   *Email Field*: Focusable text input. Keyboard type: `email-address`. Auto-capitalization: `none`.
*   *Password Field*: Focusable text input with `secureTextEntry={true}`. Auto-capitalization: `none`.
*   *Sign In Button*: TouchableOpacity. Default background color is primary indigo (`#6366f1`). Pressed opacity is default. Disabled state uses `opacity: 0.6`.
*   *Register Link*: TouchableOpacity. Renders text in primary light color (`#818cf8`).

**Current styling**:
*   *Background*: `#0f172a` (Slate-900)
*   *Inputs*: Background `#1e293b` (Slate-800), border `#334155` (Slate-700), border width 1px, text `#f8fafc` (Slate-50), placeholder `#94a3b8` (Slate-400), font size 14px (sm), padding spacing 16px (lg).
*   *Sign In Button*: Background `#6366f1` (Indigo-500), border radius 8px (md), text color `#f8fafc`, font size 16px (md), font weight bold (700).
*   *Title Text*: Font size 32px (xxxl), font weight bold (700), color `#f8fafc`.
*   *Subtitle Text*: Font size 14px (sm), color `#94a3b8`, margin bottom 24px (xl).
*   *Labels*: Font size 14px (sm), font weight semibold (600), color `#f8fafc`, margin top 16px (lg), margin bottom 8px (sm).

**Sample data**:
*   *Email*: `testmobile@example.com`
*   *Password*: `Password123!`

---

## Register Screen

**Purpose**: Allows new users to create an account.

**Navigation context**: Part of the `AuthNavigator` stack. Pushed from the Login screen. Successfully registering caches the standard taxonomy, sets the token, and mounts the `AppTabNavigator`. Tapping the login footer navigates back.

**Layout regions**:
1.  **Header Title**: Main header name.
2.  **Subtitle**: Sub-heading explaining the screen's focus.
3.  **Form Container**:
    *   *Error Banner*: Displays validation or connection errors at the top of the form.
    *   *Name Input*: Labels and input textbox.
    *   *Email Input*: Labels and input textbox.
    *   *Password Input*: Labels and hidden input textbox.
    *   *Sign Up Button*: Primary action button.
    *   *Login Navigation Link*: Footer navigation trigger.

**Components & data options**:
*   Identical in structure to the Login screen, but includes a third TextInput field for the user's name.

**States**:
*   *Initial / Empty*: Input fields are blank. Sign Up button active. Error banner hidden.
*   *Populated*: Input fields show text.
*   *Loading (Submitting)*: Inputs and Sign Up button are disabled with `opacity: 0.6`. Button shows an ActivityIndicator spinner.
*   *Error*: Red banner (`#ef4444` background) is displayed above inputs showing the validation error (e.g. "Password must be at least 8 characters long.") or API error.

**Interactive elements**:
*   *Name Field*: Focusable text input.
*   *Email Field*: Focusable text input. Keyboard type: `email-address`. Auto-capitalization: `none`.
*   *Password Field*: Focusable text input with `secureTextEntry={true}`. Auto-capitalization: `none`.
*   *Sign Up Button*: TouchableOpacity. Background color is primary indigo (`#6366f1`). Pressed opacity is default. Disabled state uses `opacity: 0.6`.
*   *Login Link*: TouchableOpacity. Renders text in primary light color (`#818cf8`).

**Current styling**:
*   Identical to the styling tokens and values used on the Login screen.

**Sample data**:
*   *Name*: `Jane Doe`
*   *Email*: `jane@example.com`
*   *Password*: `Password123!`

---

## LogList Screen (Log Tab - Default)

**Purpose**: Displays a searchable and filterable feed of logged DSA problems.

**Navigation context**: Default screen of the Log stack under the bottom-tab shell. Tapping a card pushes to `LogFormScreen` in Edit mode. Tapping the Floating Action Button (FAB) `+` pushes to `LogFormScreen` in Create mode.

**Layout regions**:
1.  **Search Bar**: Text input field at the top.
2.  **Filters Container**:
    *   *Difficulty ScrollView*: Horizontal row of difficulty selectors (All, Easy, Medium, Hard).
    *   *Topics ScrollView*: Horizontal row of cached topics.
    *   *Patterns ScrollView*: Horizontal row of cached patterns.
3.  **Scrollable Problems Feed**: Vertical FlatList containing cards with pull-to-refresh support.
4.  **FAB**: Circular floating button in the bottom-right corner.

**Components & data shown**:
*   *Search Input*: Placeholder "Search by number or title...".
*   *Filter Chips*: Displays name of the difficulty, topic, or pattern. Active/selected chips have an indigo background.
*   *Problem Card*:
    *   LeetCode Number: Sourced from `item.leetcodeNumber` (e.g. `#141`).
    *   Difficulty Badge: Pill badge displaying `item.difficulty`. Colors are semantic: green for EASY, yellow for MEDIUM, red for HARD.
    *   Title: Sourced from `item.title` (e.g. `Linked List Cycle`).
    *   Tags: Horizontal flow of topic chips (blue text/tint) and pattern chips (orange text/tint).
    *   Solved Date: Sourced from `item.dateSolved` formatted (e.g., `Solved: Jul 7, 2026`).
    *   Confidence Score: Sourced from `item.confidence` (e.g., `Confidence: 4/5`).
*   *FAB*: Floating circular button containing the text "+".

**States**:
*   *Initial Loading*: ActivityIndicator centered in the screen.
*   *Empty*: Message text "No matching problem logs found." displayed in the list center.
*   *Populated*: Vertical scrollable list of cards.
*   *Loading More*: ActivityIndicator rendered at the bottom footer of the FlatList.
*   *Refreshing*: Native Pull-to-refresh spinner spinner at the top of the feed.

**Interactive elements**:
*   *Search Input*: Normal TextInput. Updates state, debounces (400ms), and calls search.
*   *Filter Chips*: TouchableOpacity. Tapping toggles selection. Active: background color `#6366f1`, text `#f8fafc`. Inactive: background `#1e293b`, border `#334155`, text `#94a3b8`.
*   *Problem Card*: TouchableOpacity. Tapping navigates to `LogFormScreen` with parameters: `{ problem: item }`.
*   *FAB*: TouchableOpacity. Positioned absolute at `bottom: 24`, `right: 24`. Background `#6366f1`, text `+` (`fontSize: 28`).

**Current styling**:
*   *Background*: `#0f172a` (Slate-900).
*   *Cards*: Background `#1e293b` (Slate-800), border `#334155` (Slate-700), border width 1px, padding spacing 16px (lg), border radius 12px (lg).
*   *Card Text*: Title (`fontSize: 16`, `fontWeight: bold`, `#f8fafc`). LeetCode number (`fontSize: 14`, `fontWeight: bold`, `#94a3b8`). Solved/Confidence label (`fontSize: 12`, color `#94a3b8`), value (`#f8fafc`, `fontWeight: semibold`).
*   *Difficulty Badge*:
    *   `EASY`: Text `#10b981` (Emerald), background `rgba(16, 185, 129, 0.1)`.
    *   `MEDIUM`: Text `#f59e0b` (Amber), background `rgba(245, 158, 11, 0.1)`.
    *   `HARD`: Text `#ef4444` (Red), background `rgba(239, 104, 104, 0.1)`.
*   *Tag Chips*:
    *   Topic: Text `#f8fafc`, background `rgba(99, 102, 241, 0.1)`, border `rgba(99, 102, 241, 0.2)`.
    *   Pattern: Text `#f8fafc`, background `rgba(245, 158, 11, 0.1)`, border `rgba(245, 158, 11, 0.2)`.

**Sample data**:
*   *Problem Log*:
    ```json
    {
      "id": "cmrbz8hyc00026emsz5lz9aiq",
      "leetcodeNumber": 141,
      "title": "Linked List Cycle",
      "difficulty": "EASY",
      "timeTakenMins": 12,
      "dateSolved": "2026-07-07T10:00:00.000Z",
      "solvedAlone": true,
      "notes": "Fast and slow pointer approach",
      "needsRevision": true,
      "confidence": 4,
      "topics": [{ "topic": { "id": "t1", "name": "Linked List" } }],
      "patterns": [{ "pattern": { "id": "p1", "name": "Two Pointer" } }]
    }
    ```

---

## LogForm Screen (Log Tab - Edit/Create)

**Purpose**: Allows logging a new problem or editing/deleting an existing log, and displays AI recommendations.

**Navigation context**: Stack push from `LogListScreen`. Back navigation returns to the list. Successfully saving in Create mode triggers the AI Recommendation Modal.

**Layout regions**:
1.  **Form Input Fields**:
    *   *LeetCode # & Time Taken*: Side-by-side columns.
    *   *Title*: Text input.
    *   *Difficulty*: Segmented control (EASY, MEDIUM, HARD).
    *   *Topics & Patterns Selector Rows*: Wrapped flows of toggleable tag chips.
    *   *Date Picker Button*: Formatted button displaying current date.
    *   *Switches Row*: Side-by-side columns for Solved Alone & Needs Revision.
    *   *Confidence Selector*: Row of 1 to 5 buttons.
    *   *Notes Area*: Multiline text input box.
    *   *Submit Button*: Action button at the bottom of the form.
    *   *Delete Button*: Red outline button (Edit mode only).
2.  **AI Recommendation Modal (Overlay)**:
    *   *Loading Screen*: Spinner with text label.
    *   *Result Screen*: Scrollable plan summary, suggestions cards, and a closing "Got it!" button.

**Components & data shown**:
*   *Segmented Difficulty Control*: Toggle buttons. Active button background color matches difficulty (green/yellow/red).
*   *Chip Selectors*: Cache-derived names for topics and patterns. Selected topic chip has an indigo border; selected pattern chip has an amber border.
*   *Date Button*: Renders formatted date (e.g. `7/7/2026`). Opens Native DateTimePicker.
*   *Switches*: Standard switches for boolean toggle values (`solvedAlone`, `needsRevision`).
*   *Confidence Rating*: Numbers 1 to 5. The selected number has an indigo background.
*   *AI Recommendation Card*: Suggetion details containing LeetCode Number, Title, and reason text.

**States**:
*   *Create Mode*: Empty input values, submit button displays "Log Problem".
*   *Edit Mode*: Input values populated with problem parameters from route context. Submit button displays "Save Changes". Red outline "Delete Problem Log" button visible at the bottom.
*   *Saving*: Inputs and buttons are disabled. Submit button displays an ActivityIndicator spinner.
*   *AI Modal Loading*: Modal overlays the form with a dark transparent background, displaying a large spinner and text "Consulting Claude for next recommendations...".
*   *AI Modal Populated*: Renders Claude's text overview and suggestion cards. The close button is visible.
*   *AI Modal Error*: Modal closes, displays a native Alert dialog ("AI recommendations currently unavailable") and redirects the user back to the list.

**Interactive elements**:
*   *Segmented Buttons*: Selects difficulty. Active background is success (`#10b981`), warning (`#f59e0b`), or danger (`#ef4444`).
*   *Topic / Pattern Chips*: Toggle buttons. Toggles ID membership.
*   *Date Button*: TouchableOpacity. Opens calendar picker.
*   *Switches*: Standard boolean toggle controls. Active track color: primary indigo (`#6366f1`).
*   *Confidence Buttons*: Toggle buttons. Renders active selection background in indigo.
*   *Submit Button*: TouchableOpacity. Background `#6366f1`, text color `#f8fafc`.
*   *Delete Button*: TouchableOpacity. Clear background, red border (`#ef4444`), text color `#ef4444`. Prompts native Alert confirmation dialog on tap.
*   *Modal Close Button*: TouchableOpacity. Background `#6366f1`, text "Got it!".

**Current styling**:
*   *Inputs / Cards*: Same as LogList screen cards. Notes TextInput height: 100px.
*   *Date Picker / Buttons height*: 48px.
*   *Active Topic Chip*: Background `rgba(99, 102, 241, 0.2)`, border `#6366f1`.
*   *Active Pattern Chip*: Background `rgba(245, 158, 11, 0.2)`, border `#f59e0b`.
*   *Modal Card*: Background `#1e293b` (Slate-800), border `#334155` (Slate-700), border width 1px, max height 80%, margin spacing 24px (xl).

**Sample data**:
*   *AI Recommendations Response*:
    ```json
    {
      "overallReason": "Your Array & Two Pointer foundations are starting to form. Focus on Linked Lists.",
      "recommendations": [
        { "number": 142, "title": "Linked List Cycle II", "reason": "Requires using the slow and fast pointer technique to detect the cycle's starting node." }
      ]
    }
    ```

---

## Progress Screen (Progress Tab)

**Purpose**: Displays user solved problem summaries and configures target learning goals per topic.

**Navigation context**: Default screen of the Progress tab. Tapping "Set a target goal" or an existing goal ratio opens the Goal Modal.

**Layout regions**:
1.  **Overall Difficulty Summary**: Row of 4 cards at the top (Easy, Medium, Hard, Total).
2.  **Topics Mastery Feed**: Vertical scrollable list of topics.
    *   *Topic Header*: Topic Name and solved/target ratio (e.g. `4 / 10`).
    *   *Progress Indicator*: Horizontal progress bar (if goal configured), or dashed "Set a target goal" button (if goal is null).
3.  **Goal Modal (Overlay)**:
    *   *Title / Subtitle*: Heading detailing selected topic name.
    *   *Error Banner*: Displays target validation/API errors in red.
    *   *Input Field*: Numeric TextInput.
    *   *Actions Row*: Side-by-side Cancel and Save buttons.

**Components & data shown**:
*   *Difficulty Stats Cards*: Sourced from `/dashboard/progress` difficulty counts:
    *   `Easy`: Solved count with green border accent.
    *   `Medium`: Solved count with yellow border accent.
    *   `Hard`: Solved count with red border accent.
    *   `Total`: Solved count with indigo border accent.
*   *Topic Progress Bar*: Solved count relative to target count. Fill color is emerald green (`#10b981`) if solved >= target, else indigo (`#6366f1`).
*   *Goal Modal Input*: TextInput prefilled with the topic's current `targetCount` (in edit mode) or empty (in create mode).

**States**:
*   *Initial Loading*: ActivityIndicator centered in the screen.
*   *Populated*: Summary cards and scrollable topics list visible.
*   *Refreshing*: Pull-to-refresh indicator active at the top of the screen.
*   *Goal Modal Open*: Modal overlay visible. Save button disabled if input is empty or non-numeric.
*   *Goal Modal Saving*: TextInput disabled, Save button displays spinner.
*   *Goal Modal Error*: Modal remains open, rendering a red warning block at the top of the modal with the error message.

**Interactive elements**:
*   *Set Goal Trigger*: TouchableOpacity (dashed button or active ratio text). Opens the Goal Modal.
*   *Modal Input*: Numeric TextInput. Keyboard type: `number-pad`.
*   *Cancel Button*: TouchableOpacity. Clear background, slate border (`#334155`), text color `#94a3b8`.
*   *Save Button*: TouchableOpacity. Background `#6366f1`. Disabled background `#334155`.

**Current styling**:
*   *Stat Cards*: Background `#1e293b` (Slate-800), width `48%` (grid layout), border top width 4px, centered values (`fontSize: 24`, `fontWeight: bold`).
*   *Progress Bar Background*: Height 8px, background `#334155` (Slate-700), border radius 9999 (round).
*   *Progress Bar Fill*: Height 100%, background color dynamically mapped (indigo or emerald green).
*   *Set Goal Button*: Border color `#6366f1`, border width 1px, border style `dashed`, border radius 8px (md), padding vertical 12px (md).
*   *Goal Modal Overlay*: Background `rgba(15, 23, 42, 0.75)` (semi-transparent Slate-900).

**Sample data**:
*   *Topic Progress Item*: Topic `"Array"`, `solvedCount: 4`, `targetCount: 10`.
*   *Goal Modal Payload*: `{ topicId: "t1", targetCount: 10 }`.

---

## Patterns Screen (Patterns Tab)

**Purpose**: Displays DSA pattern coverage and mastery percentages grouped under parent topics.

**Navigation context**: Default screen of the Patterns tab.

**Layout regions**:
1.  **Header Info Card**: Informational block explaining the baseline mastery target (5 solved problems).
2.  **Parent Topic Sections**:
    *   *Section Header*: Top border separator and topic title text.
    *   *Pattern Cards Grid*: Scrollable vertical list of cards sorted alphabetically.

**Components & data shown**:
*   *Parent Topic Title*: Alphabetically sorted topic names (e.g. `ARRAY`).
*   *Pattern Card*:
    *   Pattern Name: Sourced from `item.patternName` (e.g. `Two Pointer`).
    *   Ratio: Solved count out of 5 (e.g. `2 / 5`).
    *   Mastery Progress Bar: Solved count relative to 5. Fill color is green (`#10b981`) if solved >= 5, else orange/amber (`#f59e0b`).
    *   Status Badge: Displays "Mastered" in green text if solved >= 5.

**States**:
*   *Initial Loading*: ActivityIndicator centered in the screen.
*   *Empty*: Message text "No patterns data found." displayed in the screen center.
*   *Populated*: Alphabetically grouped topic sections and pattern cards visible.
*   *Refreshing*: Pull-to-refresh spinner active at the top of the feed.

**Interactive elements**:
*   None (informational dashboard feed only).

**Current styling**:
*   *Topic Section Header*: Color `#818cf8` (Indigo-400), font size 14px (sm), font weight bold (700), uppercase, letter spacing 1, border bottom 1px (`#334155`).
*   *Pattern Card*: Background `#1e293b` (Slate-800), border `#334155` (Slate-700), border width 1px, border left width 4px. Left border color is success green (`#10b981`) if solved >= 5, else slate border (`#334155`).
*   *Mastery Bar Background*: Height 6px, background `#334155` (Slate-700), border radius 9999 (round).
*   *Mastery Bar Fill*: Height 100%, background color dynamically mapped (orange/amber `#f59e0b` or green `#10b981`).

**Sample data**:
*   *Pattern Progress Item*:
    ```json
    {
      "patternId": "p1",
      "patternName": "Two Pointer",
      "solvedCount": 2,
      "topics": [{ "topicId": "t1", "topicName": "Array" }]
    }
    ```

---

## Revision Screen (Revision Tab)

**Purpose**: Lists overdue repetition tasks that require review and schedules upcoming repetitions.

**Navigation context**: Default screen of the Revision tab. Tapping "Complete Review" marks the task done and recalculates the schedule.

**Layout regions**:
1.  **Due for Review Section**:
    *   *Due Header*: Title text.
    *   *Due Card Feed*: Overdue revisions. Includes LeetCode title, difficulty badge, scheduled date, current interval, and "Complete Review" button.
    *   *Caught Up Card*: Shown if 0 due reviews.
2.  **Upcoming Timeline Section**:
    *   *Tomorrow Header & Cards*: List of upcoming items or "No reviews scheduled" empty text.
    *   *In 3 Days Header & Cards*: List of upcoming items or "No reviews scheduled" empty text.
    *   *In 7 Days / Later Header & Cards*: List of upcoming items or "No reviews scheduled" empty text.

**Components & data shown**:
*   *Due Card*: Sourced from `/revisions/due` array:
    *   LeetCode Name/Title: (e.g. `#141 - Linked List Cycle`).
    *   Difficulty Badge: Pill badge colored by difficulty (green/yellow/red).
    *   Scheduled Date: Formatted date (e.g. `Jul 7, 2026`).
    *   Interval: Repeat interval length in days (e.g. `1 days`).
*   *Upcoming Card*: Sourced from `/revisions/upcoming` sub-arrays:
    *   LeetCode Name/Title (e.g. `#1 - Two Sum`).
    *   Difficulty Badge: Colored pill badge.
    *   Interval Tag: Text tag "Interval: Xd".
    *   Due Date: Formatted date (e.g. `Jul 12`).

**States**:
*   *Initial Loading*: ActivityIndicator centered in the screen.
*   *Empty (All Caught Up)*: Replaces due list with a card: "🎉 All caught up! No LeetCode problems due for spaced repetition today." in green text.
*   *Empty Timeline Category*: Renders a dashed block containing the text "No reviews scheduled" in slate-400 under the category heading.
*   *Completing Review (Submitting)*: The clicked card's button disables and displays a spinner. All other cards' buttons disable to block multiple clicks. On success, the card is immediately removed from the due list and appended to the upcoming list.
*   *Refreshing*: Pull-to-refresh spinner active at the top of the screen.

**Interactive elements**:
*   *Complete Review Button*: TouchableOpacity. Background color success green (`#10b981`). Displays "Complete Review" or ActivityIndicator. Disabled state opacity 0.6.

**Current styling**:
*   *Caught Up Card*: Background `#1e293b` (Slate-800), padding 24px (xl), centered text.
*   *Due Card*: Background `#1e293b` (Slate-800), border `#334155` (Slate-700), border width 1px, border radius 12px (lg), padding 16px (lg).
*   *Detail Blocks*: Background `#0f172a` (Slate-900), padding 12px (md), border radius 8px (md).
*   *Timeline Header*: Text `#94a3b8` (Slate-400), font size 12px (xs), font weight bold (700), uppercase, letter spacing 0.5.
*   *Empty Timeline Block*: Dashed border, padding vertical 12px (md), padding horizontal 16px (lg).

**Sample data**:
*   *Due Revision*:
    ```json
    {
      "id": "rev1",
      "problemId": "p1",
      "scheduledFor": "2026-07-07T10:00:00.000Z",
      "intervalDays": 1,
      "completed": false,
      "problem": {
        "leetcodeNumber": 141,
        "title": "Linked List Cycle",
        "difficulty": "EASY"
      }
    }
    ```

---

## AI Screen (AI Tab)

**Purpose**: Provides AI-driven performance insights and generates custom study plans based on available session time.

**Navigation context**: Default screen of the AI tab. Caches results in local component state. Does not refetch on focus.

**Layout regions**:
1.  **Section 1: Performance Insights**:
    *   *Section Header & Subtitle*: Action details.
    *   *Analyze Button*: Trigger action.
    *   *Error Banner*: Visible if analysis API fails.
    *   *Insight Cards*: Strengths, Weak Areas, and Recommendation cards.
2.  **Section 2: Study Session Planner**:
    *   *Section Header & Subtitle*: Action details.
    *   *Hours Input*: TextInput for time input.
    *   *Validation Label*: Displays validation warnings (negative float or values > 12h).
    *   *Generate Button*: Trigger action.
    *   *Error Banner*: Visible if planner API fails.
    *   *Planner Output Card*: Total time summary and a list of task cards.
    *   *Empty Plan Card*: Shown if tasks list is empty.

**Components & data shown**:
*   *Insight Card*: Sourced from `/ai/weakness-analysis` arrays:
    *   `Strengths`: Green left-border card with bullet points.
    *   `Weak Areas`: Red left-border card with bullet points.
    *   `Recommendation`: Indigo left-border card with paragraph text.
*   *Hours TextInput*: Label "Available Hours Today" with placeholder "e.g. 1.5".
*   *Study Plan Card*: Sourced from `/ai/study-plan` task array:
    *   Total Time: Summary header (e.g. `Total: 90 mins`).
    *   Task Item: Type badge (REVISION: Green, PRACTICE: Blue, BREAK: Grey), description text, and estimated minutes (e.g., `20 mins`).

**States**:
*   *Initial / Empty*: Result cards are hidden. Inputs are empty. Buttons are active.
*   *Loading Insights*: Section 1 button is disabled, displaying an ActivityIndicator spinner.
*   *Loading Planner*: Section 2 button is disabled, displaying an ActivityIndicator spinner. Inputs are disabled.
*   *Populated Insights*: Insight cards visible.
*   *Populated Planner*: Plan cards and task lists visible.
*   *Zero-Task Plan*: Renders a dashed card containing: `"Not enough time for a scheduled task — try entering a longer session duration (e.g., at least 30 mins)."`
*   *Error*: Red banner (`#ef4444` background) is displayed inside the section containing the API failure details (e.g. "AI service is temporarily unavailable").

**Interactive elements**:
*   *Analyze Button*: TouchableOpacity. Background `#6366f1`.
*   *Hours Input*: Numeric TextInput. Keyboard type: `numeric`.
*   *Generate Button*: TouchableOpacity. Background `#6366f1`. Disabled background `#334155`.

**Current styling**:
*   *Insight Cards left border*: Left border width 4px. Color is green (`#10b981`) for Strengths, red (`#ef4444`) for Weak Areas, and indigo (`#6366f1`) for Recommendation.
*   *Type Badges*:
    *   `REVISION`: Text `#10b981` (Emerald), background `rgba(16, 185, 129, 0.1)`.
    *   `PRACTICE`: Text `#818cf8` (Indigo), background `rgba(99, 102, 241, 0.1)`.
    *   `BREAK`: Text `#94a3b8` (Slate), background `rgba(100, 116, 139, 0.1)`.
*   *Separator Line*: Height 1px, background color `#334155` (Slate-700), margin vertical 24px (xl).

**Sample data**:
*   *AI Study Plan Response*:
    ```json
    {
      "tasks": [
        { "type": "REVISION", "description": "Review scheduled problem #141 - Linked List Cycle", "estMinutes": 15 },
        { "type": "PRACTICE", "description": "Focus on your weak area: DP or Trees.", "estMinutes": 75 }
      ],
      "totalMinutes": 90
    }
    ```

---

## Design System Summary

### Color Palette
*   **`background`**: `#0f172a` (Slate-900 / Deep dark background)
*   **`surface`**: `#1e293b` (Slate-800 / Card, forms, inputs background)
*   **`border`**: `#334155` (Slate-700 / Outline separator borders)
*   **`text`**: `#f8fafc` (Slate-50 / Primary text, titles, values)
*   **`textSecondary`**: `#94a3b8` (Slate-400 / Secondary labels, placeholders, timelines)
*   **`primary`**: `#6366f1` (Indigo-500 / Primary CTA button, progress indicators)
*   **`primaryLight`**: `#818cf8` (Indigo-400 / Secondary text links, active headers)
*   **`success`**: `#10b981` (Emerald-500 / Easy difficulty, mastered patterns, complete actions)
*   **`danger`**: `#ef4444` (Red-500 / Hard difficulty, delete CTAs, error banners)
*   **`warning`**: `#f59e0b` (Amber-500 / Medium difficulty, in-progress patterns)

### Typography Scale
*   **Font Sizes**:
    *   `xs`: 12px (chips, timeline badges, metadata values)
    *   `sm`: 14px (inputs, body descriptions, table headers)
    *   `md`: 16px (card titles, primary buttons)
    *   `lg`: 18px (screen titles, modal titles)
    *   `xl`: 20px (card headers)
    *   `xxl`: 24px (stats summary value digits)
    *   `xxxl`: 32px (login/register main titles)
*   **Font Weights**:
    *   `regular`: `'400'`
    *   `medium`: `'500'`
    *   `semibold`: `'600'`
    *   `bold`: `'700'`

### Spacing Scale
*   **`xs`**: 4px (badge padding, switch spacing)
*   **`sm`**: 8px (margins between labels and inputs, chip gaps)
*   **`md`**: 12px (segmented controls spacing, card internal elements padding)
*   **`lg`**: 16px (overall screen card margins, layout padding)
*   **`xl`**: 24px (header subtitles bottom margins, absolute position padding)
*   **`xxl`**: 32px (empty state margins)

### Overall Visual Style
The app employs a cohesive, modern dark-mode aesthetic with card-based layouts and generous padding. Slate-900 serves as the primary canvas, and Slate-800 elements are layered on top with Slate-700 borders (1px) and rounded corners (8px md / 12px lg). Visual contrast is achieved through indigo-500 accent colors for actions, alongside semantic highlights (emerald green, amber orange, and red) for progress tracking and repetition urgency.
