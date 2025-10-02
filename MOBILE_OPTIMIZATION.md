# Mobile Optimization TODO

## Overview
Site-wide mobile optimization to improve usability on phones and tablets.

## Current Issues
- Tables don't scroll well on mobile
- Navigation links may be too cramped
- Charts may not resize properly
- Summary cards could use better mobile layouts
- Filter dropdowns might be hard to tap on small screens

## Recommended Changes

### 1. Navigation
- [ ] Convert nav links to hamburger menu on mobile
- [ ] Make nav buttons larger for easier tapping (min 44px touch targets)
- [ ] Stack navigation vertically on narrow screens

### 2. Tables (Dashboard, Accounts, Dividends, Transactions)
- [ ] Make all tables horizontally scrollable with clear scroll indicators
- [ ] Consider card-based layout instead of tables on mobile
- [ ] Reduce font sizes slightly for better fit
- [ ] Hide less important columns on mobile (show/hide toggle)
- [ ] Add sticky table headers

### 3. Charts
- [ ] Reduce chart heights on mobile (currently may be too tall)
- [ ] Ensure all Recharts components are responsive
- [ ] Test pie chart labels don't overlap on small screens
- [ ] Consider hiding some chart elements on mobile for clarity

### 4. Summary Cards
- [ ] Force single column layout on mobile (already partially done)
- [ ] Reduce padding/spacing on mobile
- [ ] Ensure all cards stack nicely

### 5. Filters (Transactions Page)
- [ ] Stack filter dropdowns vertically on mobile
- [ ] Make dropdowns full-width on mobile
- [ ] Increase touch target sizes for select elements

### 6. Forms & Inputs
- [ ] Ensure all input fields are properly sized
- [ ] Add proper input types (tel, email, etc.) for better mobile keyboards
- [ ] Test Plaid connection flow on mobile

### 7. General Layout
- [ ] Review all media query breakpoints (currently 768px)
- [ ] Add intermediate breakpoint for tablets (~1024px)
- [ ] Reduce horizontal padding on mobile to maximize space
- [ ] Test in both portrait and landscape orientations
- [ ] Ensure modals/overlays work well on mobile

### 8. Performance
- [ ] Consider lazy loading charts on mobile
- [ ] Optimize image sizes if any are added
- [ ] Test load times on slower connections

### 9. Testing Checklist
- [ ] iPhone (Safari)
- [ ] Android (Chrome)
- [ ] iPad (Safari)
- [ ] Small screens (< 375px width)
- [ ] Large screens (> 768px width)

## CSS Approach

### Suggested Breakpoints
```css
/* Mobile first approach */
--mobile: 0-767px (default)
--tablet: 768px-1023px
--desktop: 1024px+

/* Media queries */
@media (min-width: 768px) { /* Tablet */ }
@media (min-width: 1024px) { /* Desktop */ }
```

### Priority Pages
1. Dashboard (most important - main view)
2. Transactions (lots of data to handle)
3. Accounts (table heavy)
4. Dividends (charts + tables)

## Notes
- Keep dark theme consistent across all screen sizes
- Test with real data (not just mock data)
- Consider touch gestures for table scrolling
- Ensure accessibility (screen readers, contrast ratios)
